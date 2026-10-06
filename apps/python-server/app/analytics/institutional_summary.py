from collections import defaultdict
from typing import List, Dict, Any, cast

from app.analytics.cqi_recommender import (
    alignment_block,
    alignment_lines,
    anonymize_students,
    call_llm_api,
    sanitize_prompt_data,
    strip_code_fences,
)
from app.etl import etl_const
from app.schemas.institutional_summary import (
    InstitutionalSummaryPayload,
    CourseSubmission,
)


def _calculate_mean_attainment_pct(attainments: List[Dict[str, Any]]) -> float:
    """
    Calculates the average of individual attainment values for a given group of records.
    Implements Formula 2A: prefers composite_clo_attainment_pct (scaled to 0-1 fraction),
    falling back to direct_clo_attainment_pct if composite is absent.
    """
    valid_values = []
    for a in attainments:
        composite = a.get("composite_clo_attainment_pct")
        if composite is not None:
            # composite is on 0-100 scale; convert to 0-1 fraction for internal aggregation consistency
            valid_values.append(composite / 100.0)
        elif a.get("direct_clo_attainment_pct") is not None:
            valid_values.append(a.get("direct_clo_attainment_pct"))

    if not valid_values:
        return 0.0

    return sum(valid_values) / len(valid_values)


def compute_plo_attainment(
    clo_summary: Dict[str, Any], clo_plo_map: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Computes per-PLO attainment by averaging mapped CLO attainments (Formula 7A)
    and checks for data completeness (Rule 3).
    """
    map_lookup = defaultdict(list)
    for item in clo_plo_map:
        map_lookup[item["clo_code"]].append(
            {"plo": item["plo_code"], "strength": item["correlation_strength"]}
        )

    plo_data = defaultdict(list)
    for clo_code, clo_stats in clo_summary.items():
        mappings = map_lookup.get(clo_code, [])
        for mapping in mappings:
            plo_data[mapping["plo"]].append(
                {
                    "clo_code": clo_code,
                    "mean_attainment_pct": clo_stats["mean_attainment_pct"],
                    "correlation_strength": mapping["strength"],
                    "rule1_met": clo_stats.get("rule1_met", False),
                }
            )

    plo_attainment = {}
    for plo_code, mapped_clos in plo_data.items():
        if not mapped_clos:
            continue

        avg_attainment = sum(c["mean_attainment_pct"] for c in mapped_clos) / len(
            mapped_clos
        )

        complete_clo_count = sum(1 for c in mapped_clos if c["rule1_met"])
        plo_completeness_pct = (
            complete_clo_count / len(mapped_clos) if mapped_clos else 0.0
        )

        plo_attainment[plo_code] = {
            "plo_attainment_direct_only": avg_attainment,
            "plo_completeness_pct": plo_completeness_pct,
            "plo_rule3_met": plo_completeness_pct
            >= etl_const.Transformation.COMPLETENESS_THRESHOLD,
            "mapped_clos": mapped_clos,
        }
    return plo_attainment


def _generic_aggregator(
    submissions: List[CourseSubmission],
    group_by_key: str,
    is_program_level: bool = False,
) -> Dict[str, Any]:
    """
    Rolls up attainment data by a given key (e.g., 'department', 'program'),
    calculating CLO means, PLO rollups, and program-level averages.
    """
    summary = defaultdict(lambda: {"submissions": [], "clo_data": defaultdict(list)})
    for sub in submissions:
        group_name = getattr(sub, group_by_key)
        if group_name is None:
            continue
        summary[group_name]["submissions"].append(sub)
        for attainment in sub.attainments:
            if attainment.excluded_reason is not None or (
                attainment.composite_clo_attainment_pct is None
                and attainment.direct_clo_attainment_pct is None
            ):
                continue
            summary[group_name]["clo_data"][attainment.clo_code].append(
                attainment.model_dump()
            )

    results = {}
    for name, data in summary.items():
        consolidated_mapping = {
            f"{m['clo_code']}_{m['plo_code']}": m
            for sub in data["submissions"]
            for m in sub.clo_plo_mapping
        }.values()

        clo_summary = {}
        for clo, attainments in data["clo_data"].items():
            rule1_met_status = (
                attainments[0].get("rule1_met", False) if attainments else False
            )
            clo_summary[clo] = {
                "mean_attainment_pct": _calculate_mean_attainment_pct(attainments),
                "record_count": len(attainments),
                "rule1_met": rule1_met_status,
            }

        plos = compute_plo_attainment(clo_summary, list(consolidated_mapping))

        result_payload: Dict[str, Any] = {
            "total_attainment_records": sum(
                len(attainments) for attainments in data["clo_data"].values()
            ),
            "clos": clo_summary,
            "plos": plos,
        }

        if is_program_level and plos:
            all_plo_attainments = [
                p["plo_attainment_direct_only"] for p in plos.values()
            ]
            if all_plo_attainments:
                result_payload["program_plo_average"] = cast(
                    Any, sum(all_plo_attainments) / len(all_plo_attainments)
                )

        results[name] = result_payload

    return results


def aggregate_by_department(submissions: List[CourseSubmission]) -> Dict[str, Any]:
    """Aggregates attainment data for all submissions, grouped by department."""
    return _generic_aggregator(submissions, "department", is_program_level=False)


def aggregate_by_program(submissions: List[CourseSubmission]) -> Dict[str, Any]:
    """Aggregates attainment data for all submissions, grouped by program."""
    return _generic_aggregator(submissions, "program", is_program_level=True)


def aggregate_by_avp_group(submissions: List[CourseSubmission]) -> Dict[str, Any]:
    """Aggregates attainment data for all submissions, grouped by AVP group."""
    return _generic_aggregator(submissions, "avp_group", is_program_level=False)


def find_worst_performers(
    agg_data: Dict[str, Any], group_name: str, top_n: int = 3
) -> List[Dict[str, Any]]:
    """Identifies the CLOs with the lowest mean attainment across a given aggregation level."""
    all_clos = []
    for key, data in agg_data.items():
        for clo_code, clo_data in data.get("clos", {}).items():
            all_clos.append(
                {
                    "group_name": group_name,
                    "key": key,
                    "clo_code": clo_code,
                    "mean_attainment_pct": clo_data["mean_attainment_pct"],
                    "record_count": clo_data["record_count"],
                }
            )
    return sorted(
        all_clos, key=lambda x: (x["mean_attainment_pct"], -x["record_count"])
    )[:top_n]


def _alignment_rows(payload: InstitutionalSummaryPayload) -> List[Dict[str, Any]]:
    """
    Per-CLO pedagogical rows (Bloom's / I-P-D / assessment types) that the
    webapp backend folded into `clo_plo_mapping`.

    Entries carrying none of the alignment keys are skipped: the rollups merge
    CLOs by bare code across every course in a group, so only the explicit
    per-course context can be quoted safely.
    """
    alignment_keys = ("blooms_level", "ipd_stage", "assessment_types")
    rows: List[Dict[str, Any]] = []
    for submission in payload.submissions:
        for entry in submission.clo_plo_mapping or []:
            if not isinstance(entry, dict) or not any(
                k in entry for k in alignment_keys
            ):
                continue
            rows.append(
                {
                    "course_code": submission.course_code,
                    "section": submission.section,
                    "clo_code": entry.get("clo_code"),
                    "blooms_level": entry.get("blooms_level"),
                    "ipd_stage": entry.get("ipd_stage"),
                    "assessment_types": entry.get("assessment_types"),
                }
            )
    return rows


def build_institutional_prompt(
    payload: InstitutionalSummaryPayload, summary: Dict[str, Any]
) -> str:
    """Builds a text prompt for an LLM to generate an institution-wide CQI summary."""
    period_label = payload.period.label
    worst_performers = summary.get("worst_performing_clos", [])
    data_lines = [
        f"Institution-Wide Performance Summary for {period_label}",
        f"The institutional attainment threshold is {etl_const.Transformation.INSTITUTIONAL_THRESHOLD * 100:.0f}%.",
        "\nAnalysis of performance gaps has identified the following areas as the most critical challenges across all levels of the institution:",
    ]
    if not worst_performers:
        data_lines.append(
            "\nNo significant performance gaps were identified across the institution. Overall attainment is strong."
        )
    else:
        for item in worst_performers:
            rate = item["mean_attainment_pct"] * 100
            data_lines.append(
                f"- Level: {item['group_name']}, Name: {item['key']}, CLO: {item['clo_code']}. "
                f"Mean Attainment: {rate:.1f}% ({item['record_count']} student records)."
            )
    # NOTE: pedagogical alignment so the VPAA-facing summary can say *why* a
    # CLO is struggling (level, stage, evidence), not only the number.
    alignment = alignment_lines(_alignment_rows(payload))
    if alignment:
        data_lines.append(
            "\nPedagogical alignment for the courses behind these gaps "
            "(Bloom's Taxonomy, I-P-D stage, assessment evidence):"
        )
        data_lines.extend(f"- {line}" for line in alignment_block(alignment))
    instructions = [
        "Based on this institution-wide data, provide a high-level strategic summary for the Vice President for Academic Affairs (VPAA).",
        "1. Identify 1-2 cross-cutting themes or patterns suggested by these performance gaps.",
        "2. Suggest 2-3 strategic, actionable interventions that could be implemented at the institutional, AVP, or departmental level.",
        "3. Frame the recommendations in a way that is suitable for executive review and strategic planning.",
        "4. Where a recommendation touches a CLO, cite its Bloom's level and I-P-D stage so a reviewer can verify the pedagogical alignment.",
    ]
    return (
        "\n".join(instructions)
        + "\n\n<DATA>\n"
        + sanitize_prompt_data("\n".join(data_lines))
        + "\n</DATA>"
    )


def compute_summary_only(payload: InstitutionalSummaryPayload) -> Dict[str, Any]:
    """
    Performs all data aggregation and analysis for an institutional summary
    without making any external AI/LLM calls.
    """
    for submission in payload.submissions:
        submission.attainments = anonymize_students(submission.attainments)

    department_summary = aggregate_by_department(payload.submissions)
    program_summary = aggregate_by_program(payload.submissions)
    avp_group_summary = aggregate_by_avp_group(payload.submissions)

    worst_depts = find_worst_performers(department_summary, "Department")
    worst_progs = find_worst_performers(program_summary, "Program")
    worst_avps = find_worst_performers(avp_group_summary, "AVP Group")

    all_worst = sorted(
        worst_depts + worst_progs + worst_avps,
        key=lambda x: (x["mean_attainment_pct"], -x["record_count"]),
    )

    summary = {
        "period": payload.period.model_dump(),
        "department_summary": department_summary,
        "program_summary": program_summary,
        "avp_group_summary": avp_group_summary,
        "worst_performing_clos": all_worst[:5],
    }
    return summary


async def generate_institutional_summary(
    payload: InstitutionalSummaryPayload,
) -> Dict[str, Any]:
    """
    Generates a full institutional summary, including data aggregation and
    an AI-powered recommendation.
    """
    summary = compute_summary_only(payload)
    prompt = build_institutional_prompt(payload, summary)
    llm_response = strip_code_fences(await call_llm_api(prompt))

    is_error = isinstance(llm_response, str) and llm_response.startswith(
        "[LLM API ERROR"
    )
    result = {
        "status": "error" if is_error else "ok",
        "summary": summary,
        "prompt_used": prompt,
        "recommendation": llm_response,
    }
    if is_error:
        result["error"] = llm_response

    return result
