from collections import defaultdict
from typing import List, Dict, Any

from app.analytics.cqi_recommender import anonymize_students, call_llm_api, IS_DEBUG_MODE
from app.etl.transform.transformer import INSTITUTIONAL_THRESHOLD
from app.schemas.institutional_summary import InstitutionalSummaryPayload, CourseSubmission


def _calculate_mean_attainment_pct(attainments: List[Dict[str, Any]]) -> float:
    """
    Helper to calculate the average of all individual direct_clo_attainment_pct values
    for a given group of records, per Formula 2A.
    """
    if not attainments:
        return 0.0
    
    total_pct = sum(a.get("direct_clo_attainment_pct", 0.0) for a in attainments)
    return total_pct / len(attainments)


def compute_plo_attainment(clo_summary: Dict[str, Any], clo_plo_map: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Computes PLO attainment by averaging the attainment rates of mapped CLOs (Formula 7A).
    """
    map_lookup = defaultdict(list)
    for item in clo_plo_map:
        map_lookup[item["clo_code"]].append({
            "plo": item["plo_code"],
            "strength": item["correlation_strength"]
        })
    
    plo_data = defaultdict(list)
    for clo_code, clo_stats in clo_summary.items():
        mappings = map_lookup.get(clo_code, [])
        for mapping in mappings:
            plo_data[mapping["plo"]].append({
                "clo_code": clo_code,
                "mean_attainment_pct": clo_stats["mean_attainment_pct"],
                # Note: correlation_strength is carried through as metadata. It is a real weighting
                # factor for cross-course PLO merging (Formula 7C), but is not used in this
                # unweighted Formula 7A calculation.
                "correlation_strength": mapping["strength"],
            })

    plo_attainment = {}
    for plo_code, mapped_clos in plo_data.items():
        if not mapped_clos:
            continue
        
        # The current single-course PLO computation (Formula 7A, unweighted) is still
        # correct and unaffected by the note on correlation_strength. A follow-up
        # change will implement the actual weighted cross-course merge.
        avg_attainment = sum(c["mean_attainment_pct"] for c in mapped_clos) / len(mapped_clos)
        plo_attainment[plo_code] = {
            "plo_attainment_direct_only": avg_attainment,
            "mapped_clos": mapped_clos,
        }
    return plo_attainment


def _generic_aggregator(submissions: List[CourseSubmission], group_by_key: str, is_program_level: bool = False) -> Dict[str, Any]:
    """Generic function to roll up attainment data by a given key (e.g., 'department', 'program')."""
    summary = defaultdict(lambda: {"submissions": [], "clo_data": defaultdict(list)})
    for sub in submissions:
        group_name = getattr(sub, group_by_key)
        if group_name is None:
            continue
        summary[group_name]["submissions"].append(sub)
        for attainment in sub.attainments:
            summary[group_name]["clo_data"][attainment.clo_code].append(attainment.model_dump())

    results = {}
    for name, data in summary.items():
        consolidated_mapping = {f"{m['clo_code']}_{m['plo_code']}": m for sub in data["submissions"] for m in sub.clo_plo_mapping}.values()
        
        clo_summary = {
            clo: {
                "mean_attainment_pct": _calculate_mean_attainment_pct(attainments),
                "record_count": len(attainments),
            }
            for clo, attainments in data["clo_data"].items()
        }

        plos = compute_plo_attainment(clo_summary, list(consolidated_mapping))

        result_payload = {
            "total_attainment_records": sum(len(attainments) for attainments in data["clo_data"].values()),
            "clos": clo_summary,
            "plos": plos,
        }

        # Formula 7C: Program-Level Average PLO Attainment.
        # This is ONLY computed at the program level.
        if is_program_level and plos:
            all_plo_attainments = [p["plo_attainment_direct_only"] for p in plos.values()]
            if all_plo_attainments:
                result_payload["program_plo_average"] = sum(all_plo_attainments) / len(all_plo_attainments)

        results[name] = result_payload

    return results


def aggregate_by_department(submissions: List[CourseSubmission]) -> Dict[str, Any]:
    return _generic_aggregator(submissions, 'department', is_program_level=False)

def aggregate_by_program(submissions: List[CourseSubmission]) -> Dict[str, Any]:
    return _generic_aggregator(submissions, 'program', is_program_level=True)

def aggregate_by_avp_group(submissions: List[CourseSubmission]) -> Dict[str, Any]:
    return _generic_aggregator(submissions, 'avp_group', is_program_level=False)


def find_worst_performers(agg_data: Dict[str, Any], group_name: str, top_n: int = 3) -> List[Dict[str, Any]]:
    all_clos = []
    for key, data in agg_data.items():
        for clo_code, clo_data in data.get("clos", {}).items():
            all_clos.append({
                "group_name": group_name,
                "key": key,
                "clo_code": clo_code,
                "mean_attainment_pct": clo_data["mean_attainment_pct"],
                "record_count": clo_data["record_count"],
            })
    return sorted(all_clos, key=lambda x: (x["mean_attainment_pct"], -x["record_count"]))[:top_n]


def build_institutional_prompt(payload: InstitutionalSummaryPayload, summary: Dict[str, Any]) -> str:
    period_label = payload.period.label
    worst_performers = summary.get("worst_performing_clos", [])
    prompt_lines = [
        f"Institution-Wide Performance Summary for {period_label}",
        f"The institutional attainment threshold is {INSTITUTIONAL_THRESHOLD * 100:.0f}%.",
        "\nAnalysis of performance gaps has identified the following areas as the most critical challenges across all levels of the institution:",
    ]
    if not worst_performers:
        prompt_lines.append("\nNo significant performance gaps were identified across the institution. Overall attainment is strong.")
    else:
        for item in worst_performers:
            rate = item['mean_attainment_pct'] * 100
            prompt_lines.append(
                f"- Level: {item['group_name']}, Name: {item['key']}, CLO: {item['clo_code']}. "
                f"Mean Attainment: {rate:.1f}% ({item['record_count']} student records)."
            )
    prompt_lines.extend([
        "\nBased on this institution-wide data, please provide a high-level strategic summary for the Vice President for Academic Affairs (VPAA).",
        "1. Identify 1-2 cross-cutting themes or patterns suggested by these performance gaps (e.g., 'Is CLO1 consistently low across multiple departments?').",
        "2. Suggest 2-3 strategic, actionable interventions that could be implemented at the institutional, AVP, or departmental level.",
        "3. Frame the recommendations in a way that is suitable for executive review and strategic planning.",
    ])
    return "\n".join(prompt_lines)


async def generate_institutional_summary(payload: InstitutionalSummaryPayload) -> Dict[str, Any]:
    for submission in payload.submissions:
        submission.attainments = anonymize_students(submission.attainments)
    
    department_summary = aggregate_by_department(payload.submissions)
    program_summary = aggregate_by_program(payload.submissions)
    avp_group_summary = aggregate_by_avp_group(payload.submissions)
    
    worst_depts = find_worst_performers(department_summary, "Department")
    worst_progs = find_worst_performers(program_summary, "Program")
    worst_avps = find_worst_performers(avp_group_summary, "AVP Group")
    
    all_worst = sorted(worst_depts + worst_progs + worst_avps, key=lambda x: (x["mean_attainment_pct"], -x["record_count"]))
    
    summary = {
        "period": payload.period.model_dump(),
        "department_summary": department_summary,
        "program_summary": program_summary,
        "avp_group_summary": avp_group_summary,
        "worst_performing_clos": all_worst[:5],
    }
    
    prompt = build_institutional_prompt(payload, summary)
    llm_response = await call_llm_api(prompt)

    return {
        "status": "ok",
        "summary": summary,
        "prompt_used": prompt,
        "recommendation": llm_response,
    }
