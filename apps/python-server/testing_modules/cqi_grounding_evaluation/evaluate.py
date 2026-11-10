"""
CQI Report Narrative Grounding Evaluation Script.

Conventions:
- Offline replay mode by default (uses recorded benchmark responses or --responses).
- --live enables live Gemini generation ONLY with an explicit flag; never auto-runs paid calls.
- Evaluates:
  1. Schema validity (% of responses strictly following Pydantic schema).
  2. Fact ID validity (% of cited fact_ids existing in supplied facts).
  3. Number grounding/traceability (% of statistics/numbers traceable to facts; MUST BE 100%).
- Notes that academic quality review remains a manual rubric.
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
from typing import Any, Dict, List

# Ensure apps/python-server is in sys.path
HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parents[1]
sys.path.insert(0, str(PROJECT_ROOT))
sys.dont_write_bytecode = True

from app.analytics.cqi_narrative import (
    _collect_canonical_fact_numbers,
    _extract_text_numbers,
    flatten_payload_to_facts,
    generate_cqi_report_narrative,
    validate_cqi_narrative,
)
from app.schemas.cqi_narrative import (
    CQINarrativeOutput,
    CQIReportNarrativePayload,
)
from testing_modules.cqi_grounding_evaluation.dataset import BENCHMARK_CASES


def evaluate_single_response(
    payload: CQIReportNarrativePayload,
    output_dict: Dict[str, Any],
) -> Dict[str, Any]:
    """Evaluates a single narrative output against supplied payload facts."""
    facts, _ = flatten_payload_to_facts(payload)
    valid_fact_ids = {f.fact_id for f in facts}
    canonical_numbers = _collect_canonical_fact_numbers(facts)

    # 1. Schema Validity
    schema_valid = True
    schema_error = None
    try:
        output_obj = CQINarrativeOutput.model_validate(output_dict)
    except Exception as e:
        schema_valid = False
        schema_error = str(e)
        output_obj = None

    # 2. Fact ID Validity
    total_cited_fact_ids = 0
    valid_cited_fact_ids = 0
    cited_ids_list: List[str] = []

    # 3. Number Grounding
    total_numbers = 0
    grounded_numbers = 0
    untraceable_numbers: List[str] = []

    if output_obj is not None:
        # Collect cited fact IDs
        for rec in output_obj.recommendations:
            for fid in rec.evidence_fact_ids:
                total_cited_fact_ids += 1
                cited_ids_list.append(fid)
                if fid in valid_fact_ids:
                    valid_cited_fact_ids += 1

        for pcf in output_obj.possible_contributing_factors:
            for fid in pcf.evidence_fact_ids:
                total_cited_fact_ids += 1
                cited_ids_list.append(fid)
                if fid in valid_fact_ids:
                    valid_cited_fact_ids += 1

        if output_obj.pattern is not None:
            for fid in output_obj.pattern.evidence_fact_ids:
                total_cited_fact_ids += 1
                cited_ids_list.append(fid)
                if fid in valid_fact_ids:
                    valid_cited_fact_ids += 1

        # Collect and verify numbers
        text_blocks = [output_obj.summary]
        for rec in output_obj.recommendations:
            text_blocks.extend([rec.problem, rec.intervention, rec.timeline, rec.success_indicator, rec.verification_method])
            if rec.target is not None:
                text_blocks.append(str(rec.target))
        for pcf in output_obj.possible_contributing_factors:
            text_blocks.append(pcf.hypothesis)
        if output_obj.pattern is not None:
            text_blocks.append(output_obj.pattern.description)

        for block in text_blocks:
            extracted = _extract_text_numbers(block)
            for val, raw in extracted:
                total_numbers += 1
                if val in canonical_numbers:
                    grounded_numbers += 1
                else:
                    untraceable_numbers.append(raw)

        # Full validator pass
        hard_valid, hard_reason = validate_cqi_narrative(output_obj, facts)
    else:
        hard_valid = False
        hard_reason = f"Schema validation failed: {schema_error}"

    fact_id_validity_pct = (
        (valid_cited_fact_ids / total_cited_fact_ids * 100.0)
        if total_cited_fact_ids > 0
        else 100.0
    )
    number_traceability_pct = (
        (grounded_numbers / total_numbers * 100.0)
        if total_numbers > 0
        else 100.0
    )

    return {
        "schema_valid": schema_valid,
        "schema_error": schema_error,
        "hard_valid": hard_valid,
        "hard_reason": hard_reason,
        "total_cited_fact_ids": total_cited_fact_ids,
        "valid_cited_fact_ids": valid_cited_fact_ids,
        "fact_id_validity_pct": fact_id_validity_pct,
        "total_numbers": total_numbers,
        "grounded_numbers": grounded_numbers,
        "untraceable_numbers": untraceable_numbers,
        "number_traceability_pct": number_traceability_pct,
    }


async def run_evaluation(live: bool = False, responses_path: str | None = None) -> int:
    """Runs the grounding evaluation over benchmark cases."""
    print("=" * 70)
    print("  OBELISK CQI REPORT NARRATIVE — GROUNDING EVALUATION")
    print("=" * 70)
    print(f"Mode: {'LIVE API CALLS (--live enabled)' if live else 'OFFLINE REPLAY (safe, zero cost)'}")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 70)

    external_responses = None
    if responses_path:
        p = Path(responses_path)
        if not p.is_file():
            print(f"ERROR: Responses file not found: {responses_path}")
            return 1
        external_responses = json.loads(p.read_text(encoding="utf-8"))

    results: List[Dict[str, Any]] = []

    for case in BENCHMARK_CASES:
        case_id = case["id"]
        print(f"\nEvaluating {case_id}: {case['description']}")

        payload_obj = CQIReportNarrativePayload.model_validate(case["payload"])

        if live:
            # Explicit live mode
            resp = await generate_cqi_report_narrative(payload_obj)
            if resp.status != "ok":
                print(f"  [FAIL] Live call returned status: {resp.status} (Reason: {resp.reason or resp.error})")
                results.append({"case_id": case_id, "success": False, "reason": resp.reason or resp.error})
                continue
            output_dict = {
                "summary": resp.summary,
                "recommendations": [r.model_dump() for r in resp.recommendations],
                "possible_contributing_factors": [p.model_dump() for p in resp.possible_contributing_factors],
                "pattern": resp.pattern.model_dump() if resp.pattern else None,
                "data_limitations": resp.data_limitations,
            }
        elif external_responses and case_id in external_responses:
            output_dict = external_responses[case_id]
        else:
            output_dict = case["recorded_output"]

        metrics = evaluate_single_response(payload_obj, output_dict)
        metrics["case_id"] = case_id
        results.append(metrics)

        print(f"  • Schema Validity:        {'PASS' if metrics['schema_valid'] else 'FAIL'}")
        print(f"  • Fact ID Validity:       {metrics['fact_id_validity_pct']:.1f}% ({metrics['valid_cited_fact_ids']}/{metrics['total_cited_fact_ids']} valid)")
        print(f"  • Number Traceability:    {metrics['number_traceability_pct']:.1f}% ({metrics['grounded_numbers']}/{metrics['total_numbers']} traceable)")
        if metrics["untraceable_numbers"]:
            print(f"    WARNING: Untraceable numbers: {metrics['untraceable_numbers']}")
        print(f"  • Hard Validator Status:  {'PASS' if metrics['hard_valid'] else 'FAIL'}")
        if not metrics["hard_valid"]:
            print(f"    Validation Reason: {metrics['hard_reason']}")

    # Consolidated Metrics
    total_cases = len(results)
    schema_pass_count = sum(1 for r in results if r.get("schema_valid"))
    hard_pass_count = sum(1 for r in results if r.get("hard_valid"))
    all_traceable = all(r.get("number_traceability_pct", 0) == 100.0 for r in results)
    all_fact_ids_valid = all(r.get("fact_id_validity_pct", 0) == 100.0 for r in results)

    print("\n" + "=" * 70)
    print("  EVALUATION SUMMARY REPORT")
    print("=" * 70)
    print(f"Total Benchmark Cases:        {total_cases}")
    print(f"Schema Validity Rate:         {(schema_pass_count / total_cases * 100.0):.1f}%")
    print(f"Fact ID Validity Rate:        {'100.0% (PASS)' if all_fact_ids_valid else 'FAIL (<100%)'}")
    print(f"Number Traceability Rate:     {'100.0% (PASS)' if all_traceable else 'FAIL (<100%)'}")
    print(f"Hard Validator Pass Rate:     {(hard_pass_count / total_cases * 100.0):.1f}%")
    print("-" * 70)
    print("NOTE: Academic quality review remains a manual rubric; automated evaluation")
    print("verifies grounding, number traceability, citations, and structural constraints only.")
    print("=" * 70 + "\n")

    if not all_traceable or not all_fact_ids_valid or schema_pass_count != total_cases:
        return 1
    return 0


def main():
    parser = argparse.ArgumentParser(description="Evaluate CQI narrative grounding.")
    parser.add_argument(
        "--live",
        action="store_true",
        default=False,
        help="Explicitly authorizes live paid calls to the Google Gemini API (never runs by default).",
    )
    parser.add_argument(
        "--responses",
        type=str,
        default=None,
        help="Path to external recorded responses JSON file for replay.",
    )
    args = parser.parse_args()

    exit_code = asyncio.run(run_evaluation(live=args.live, responses_path=args.responses))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
