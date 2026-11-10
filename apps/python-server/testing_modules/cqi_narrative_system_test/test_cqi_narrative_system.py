"""
System test runner for CQI report narrative.
Default mode: offline replay against live_gemini_output.json.
--live mode: executes a real call to the Google Gemini API.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app.analytics.cqi_narrative import (
    _collect_canonical_fact_numbers,
    _extract_text_numbers,
    flatten_payload_to_facts,
    generate_cqi_report_narrative,
    validate_cqi_narrative,
)
from app.schemas.cqi_narrative import (
    CQINarrativeOutput,
    CQINarrativeResponse,
    CQIReportNarrativePayload,
)


def run_system_audit(payload_dict: dict, output_dict: dict) -> bool:
    payload = CQIReportNarrativePayload.model_validate(payload_dict)
    facts, _ = flatten_payload_to_facts(payload)

    # Validate against outer response schema or extract inner output
    if "status" in output_dict:
        resp = CQINarrativeResponse.model_validate(output_dict)
        output = CQINarrativeOutput(
            summary=resp.summary or "",
            recommendations=resp.recommendations,
            possible_contributing_factors=resp.possible_contributing_factors,
            pattern=resp.pattern,
            data_limitations=resp.data_limitations,
        )
    else:
        output = CQINarrativeOutput.model_validate(output_dict)

    is_valid, reason = validate_cqi_narrative(output, facts)

    print("\n--- CQI NARRATIVE SYSTEM TEST AUDIT ---")
    print(f"Summary: {output.summary}")
    print(f"\nRecommendations ({len(output.recommendations)}):")
    for r in output.recommendations:
        print(f"  • Role: {r.responsible_role} | Problem: {r.problem[:60]}... | Target: {r.target}")
        print(f"    Intervention: {r.intervention}")
        print(f"    Evidence Fact IDs: {r.evidence_fact_ids}")

    print(f"\nHypotheses / Contributing Factors ({len(output.possible_contributing_factors)}):")
    for f in output.possible_contributing_factors:
        print(f"  • Category: {f.root_cause_category}")
        print(f"    Hypothesis: {f.hypothesis}")

    if output.pattern:
        print(f"\nPattern: {output.pattern.description}")

    print(f"\nData Limitations ({len(output.data_limitations)}): {output.data_limitations}")

    print("\n--- VALIDATION METRICS ---")
    print(f"Hard Validator Passed: {'PASS' if is_valid else 'FAIL'}")
    if not is_valid:
        print(f"Failure Reason: {reason}")
    return is_valid


async def main():
    parser = argparse.ArgumentParser(description="CQI narrative system test.")
    parser.add_argument("--live", action="store_true", default=False, help="Run live Gemini API call.")
    args = parser.parse_args()

    payload_path = HERE / "synthetic_payload.json"
    payload_dict = json.loads(payload_path.read_text(encoding="utf-8"))

    if args.live:
        print("Executing live Gemini call via generate_cqi_report_narrative...")
        payload = CQIReportNarrativePayload.model_validate(payload_dict)
        resp = await generate_cqi_report_narrative(payload)
        if resp.status != "ok":
            print(f"Live call returned status: {resp.status} (Reason: {resp.reason or resp.error})")
            sys.exit(1)
        output_dict = resp.model_dump()
    else:
        print("Running offline audit against recorded output (live_gemini_output.json)...")
        output_path = HERE / "live_gemini_output.json"
        output_dict = json.loads(output_path.read_text(encoding="utf-8"))

    passed = run_system_audit(payload_dict, output_dict)
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    asyncio.run(main())
