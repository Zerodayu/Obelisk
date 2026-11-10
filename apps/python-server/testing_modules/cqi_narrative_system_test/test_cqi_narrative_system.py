"""
System test runner for CQI report narrative.
Default mode: offline non-circular replay against recorded outputs with full negative tests.
--live mode: executes the authorized live call to Google Gemini and records output with provenance.
"""

from __future__ import annotations

import argparse
import asyncio
import copy
import json
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Tuple

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
    ProvenanceMetadata,
)


def run_system_audit(payload_dict: dict, output_dict: dict, claimed_model: Optional[str] = "gemini-3.5-flash-lite") -> Tuple[bool, List[str]]:
    """
    Performs full system audit:
    - Provenance verification (non-circular, checks against claimed model)
    - Hard validator (number traceability, roles, citations, coverage check)
    - Returns (passed, audit_lines)
    """
    lines: List[str] = []
    payload = CQIReportNarrativePayload.model_validate(payload_dict)
    facts, _ = flatten_payload_to_facts(payload)

    # 1. Provenance Check
    provenance_data = output_dict.get("provenance")
    if not provenance_data:
        return False, lines

    try:
        prov = ProvenanceMetadata.model_validate(provenance_data)
    except Exception as e:
        lines.append(f"FAIL: Provenance schema validation error: {e}")
        return False, lines

    if prov.execution_mode == "live" and prov.is_debug_mode:
        return False, lines

    if claimed_model and prov.requested_model != claimed_model:
        lines.append(f"FAIL: Claimed model mismatch: expected '{claimed_model}', got '{prov.requested_model}'.")
        return False, lines

    # 2. Extract Narrative Output
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

    lines.append(f"Requested Model:     {prov.requested_model}")
    lines.append(f"Returned Version:    {prov.returned_model_version}")
    lines.append(f"Response ID:         {prov.response_id}")
    lines.append(f"Execution Mode:      {prov.execution_mode}")
    lines.append(f"IS_DEBUG_MODE:       {prov.is_debug_mode}")
    lines.append(f"Timestamp UTC:       {prov.timestamp_utc}")
    if prov.usage_metadata:
        lines.append(f"Prompt Tokens:       {prov.usage_metadata.get('prompt_token_count')}")
        lines.append(f"Candidates Tokens:   {prov.usage_metadata.get('candidates_token_count')}")
        lines.append(f"Total Tokens:        {prov.usage_metadata.get('total_token_count')}")

    # 3. Dynamic Number Traceability Extraction
    canonical_numbers = _collect_canonical_fact_numbers(facts)
    lines.append(f"{'Number':<12} | {'Status':<10} | {'Matched Canonical Fact'}")

    all_texts = [output.summary]
    for r in output.recommendations:
        all_texts.extend([
            r.problem,
            r.existing_intervention_assessment or "",
            r.proposed_additions or "",
            r.intervention or "",
            r.success_indicator,
            r.timeline,
            r.verification_method,
        ])
        if r.target is not None:
            all_texts.append(str(r.target))
    for pcf in output.possible_contributing_factors:
        all_texts.append(pcf.hypothesis)
    if output.pattern:
        all_texts.append(output.pattern.description)

    extracted_numbers: List[Tuple[float, str]] = []
    for t in all_texts:
        if t:
            extracted_numbers.extend(_extract_text_numbers(t))

    untraced_count = 0
    seen_nums = set()
    for val, raw in extracted_numbers:
        if raw in seen_nums:
            continue
        seen_nums.add(raw)
        matching_facts = [
            f for f in facts
            if (isinstance(f.value, (int, float)) and float(f.value) == val)
            or (isinstance(f.value, str) and raw in f.value)
        ]
        if matching_facts:
            matched_id = matching_facts[0].fact_id
            lines.append(f"{raw:<12} | {'TRACED':<10} | {matched_id} (value: {matching_facts[0].value})")
        else:
            lines.append(f"{raw:<12} | {'UNTRACED':<10} | NO MATCHING FACT")
            untraced_count += 1

    lines.append(f"\nTraceability Summary: {len(seen_nums) - untraced_count}/{len(seen_nums)} numbers verified.")

    # 4. Narrative Scope Verification
    lines.append("\nNARRATIVE SCOPE VERIFICATION:")
    has_summary = bool(output.summary.strip())
    has_pattern = output.pattern is not None and bool(output.pattern.description.strip())
    has_hypotheses = len(output.possible_contributing_factors) > 0
    has_limitations = len(output.data_limitations) > 0
    lines.append(f"  • Summary Present:              {has_summary}")
    lines.append(f"  • Cross-Outcome Pattern:       {has_pattern}")
    lines.append(f"  • Root-Cause Hypotheses:       {has_hypotheses} ({len(output.possible_contributing_factors)} items)")
    lines.append(f"  • Data Limitations Identified: {has_limitations} ({len(output.data_limitations)} items)")

    is_all_met = any(
        "maintain current practice" in (r.proposed_additions or r.intervention or "").lower()
        or "maintain current practice" in r.problem.lower()
        for r in output.recommendations
    )
    if is_all_met:
        part_9_verified = has_summary
    else:
        part_9_verified = has_summary and (has_hypotheses or has_pattern or has_limitations)

    lines.append(f"  • Strengths Present:            False (Omitted: webapp computes strengths)")
    lines.append(f"  • Next-Cycle Priorities List:  False (Omitted: webapp aggregates recommendations into priorities)")
    lines.append(f"Narrative Scope Verification:    {'PASS' if part_9_verified else 'INCOMPLETE'}")

    lines.append(f"\nHard Validator Status:           {'PASS' if is_valid else 'FAIL'}")
    if not is_valid:
        lines.append(f"Failure Reason:                  {reason}")

    return (is_valid and (untraced_count == 0) and part_9_verified), lines


def run_negative_tests(payload_dict: dict, valid_output_dict: dict) -> bool:
    """
    Executes negative tests on tampered payloads and outputs:
    1. Tampered output with invented number -> must fail hard validator
    2. Tampered output with unknown fact_id -> must fail hard validator
    3. Tampered output with missing provenance -> must fail audit
    4. Tampered output with is_debug_mode=True and execution_mode='live' -> must fail provenance
    5. Tampered output with unsupplied duration number -> must fail hard validator
    6. Tampered output where complete NOT MET outcome is addressed only in data_limitations -> must fail coverage
    """
    payload = CQIReportNarrativePayload.model_validate(payload_dict)
    facts, _ = flatten_payload_to_facts(payload)

    # Test 1: Invented number in recommendation
    tampered_1 = copy.deepcopy(valid_output_dict)
    if tampered_1.get("recommendations"):
        tampered_1["recommendations"][0]["problem"] += " Attainment dropped to 99.9% unexpectedly."
        output_1 = CQINarrativeOutput(
            summary=tampered_1.get("summary", ""),
            recommendations=tampered_1.get("recommendations", []),
            possible_contributing_factors=tampered_1.get("possible_contributing_factors", []),
            pattern=tampered_1.get("pattern"),
            data_limitations=tampered_1.get("data_limitations", []),
        )
        is_valid, reason = validate_cqi_narrative(output_1, facts)
        assert not is_valid, "Negative Test 1 FAILED: Invented number was not rejected!"
        print(f"  [PASS] Negative Test 1: Invented number 99.9% rejected with reason: {reason}")

    # Test 2: Unknown fact_id cited
    tampered_2 = copy.deepcopy(valid_output_dict)
    if tampered_2.get("recommendations"):
        tampered_2["recommendations"][0]["evidence_fact_ids"].append("fact_unknown_9999")
        output_2 = CQINarrativeOutput(
            summary=tampered_2.get("summary", ""),
            recommendations=tampered_2.get("recommendations", []),
            possible_contributing_factors=tampered_2.get("possible_contributing_factors", []),
            pattern=tampered_2.get("pattern"),
            data_limitations=tampered_2.get("data_limitations", []),
        )
        is_valid, reason = validate_cqi_narrative(output_2, facts)
        assert not is_valid, "Negative Test 2 FAILED: Unknown fact_id was not rejected!"
        print(f"  [PASS] Negative Test 2: Unknown fact_id rejected with reason: {reason}")

    # Test 3: Missing provenance field
    tampered_3 = copy.deepcopy(valid_output_dict)
    tampered_3.pop("provenance", None)
    passed_3, _ = run_system_audit(payload_dict, tampered_3)
    assert not passed_3, "Negative Test 3 FAILED: Missing provenance was not rejected!"

    # Test 4: False live claim (is_debug_mode=True while execution_mode='live')
    tampered_4 = copy.deepcopy(valid_output_dict)
    if "provenance" in tampered_4:
        tampered_4["provenance"]["is_debug_mode"] = True
        tampered_4["provenance"]["execution_mode"] = "live"
        passed_4, lines = run_system_audit(payload_dict, tampered_4)
        assert not passed_4, "Negative Test 4 FAILED: False live claim was not rejected!"

    # Test 5: Unsupplied duration number (e.g., 'Within 8 weeks' when only 4 was supplied)
    tampered_5 = copy.deepcopy(valid_output_dict)
    if tampered_5.get("recommendations"):
        tampered_5["recommendations"][0]["timeline"] = "Within 8 weeks"
        output_5 = CQINarrativeOutput(
            summary=tampered_5.get("summary", ""),
            recommendations=tampered_5.get("recommendations", []),
            possible_contributing_factors=tampered_5.get("possible_contributing_factors", []),
            pattern=tampered_5.get("pattern"),
            data_limitations=tampered_5.get("data_limitations", []),
        )
        is_valid, reason = validate_cqi_narrative(output_5, facts)
        assert not is_valid, "Negative Test 5 FAILED: Unsupplied duration number 8 was not rejected!"
        print(f"  [PASS] Negative Test 5: Unsupplied duration number rejected with reason: {reason}")

    # Test 6: NOT MET outcome with complete value facts addressed ONLY in data_limitations
    tampered_6 = copy.deepcopy(valid_output_dict)
    # Remove citations to CLO1 from recommendations and factors, but add CLO1 to data_limitations
    for rec in tampered_6.get("recommendations", []):
        rec["evidence_fact_ids"] = [fid for fid in rec["evidence_fact_ids"] if "CLO1" not in fid]
        if not rec["evidence_fact_ids"]:
            rec["evidence_fact_ids"] = ["fact_clo_CLO2_status"]
    for pcf in tampered_6.get("possible_contributing_factors", []):
        pcf["evidence_fact_ids"] = [fid for fid in pcf["evidence_fact_ids"] if "CLO1" not in fid]
        if not pcf["evidence_fact_ids"]:
            pcf["evidence_fact_ids"] = ["fact_clo_CLO2_status"]
    tampered_6["data_limitations"].append("CLO1 assessment requires further study.")
    output_6 = CQINarrativeOutput(
        summary=tampered_6.get("summary", ""),
        recommendations=tampered_6.get("recommendations", []),
        possible_contributing_factors=tampered_6.get("possible_contributing_factors", []),
        pattern=tampered_6.get("pattern"),
        data_limitations=tampered_6.get("data_limitations", []),
    )
    is_valid, reason = validate_cqi_narrative(output_6, facts)
    assert not is_valid, "Negative Test 6 FAILED: NOT MET outcome with complete facts passed solely in data_limitations!"
    print(f"  [PASS] Negative Test 6: Complete NOT MET outcome in data_limitations rejected with reason: {reason}")

    return True


def run_suite_replays() -> bool:
    """Verifies all additional synthetic test payloads offline."""
    additional_cases = [
        ("payload_all_met.json", "synthetic_output_all_met.json", "All Met Baseline"),
        ("payload_missing_data.json", "synthetic_output_missing_data.json", "Missing Data & Completeness"),
        ("payload_two_not_met.json", "synthetic_output_two_not_met.json", "Two NOT MET Outcomes"),
        ("payload_escalated_entry.json", "synthetic_output_escalated_entry.json", "Escalated CQI Entry"),
        ("payload_prompt_injection.json", "synthetic_output_prompt_injection.json", "Prompt-Injection Defense"),
    ]
    all_ok = True
    for p_name, o_name, desc in additional_cases:
        p_path = HERE / p_name
        o_path = HERE / o_name
        if not p_path.exists() or not o_path.exists():
            print(f"  [FAIL] Missing file: {p_name} or {o_name}")
            all_ok = False
            continue
        p_dict = json.loads(p_path.read_text(encoding="utf-8"))
        o_dict = json.loads(o_path.read_text(encoding="utf-8"))
        passed, lines = run_system_audit(p_dict, o_dict, claimed_model=None)
        if passed:
            print(f"  [PASS] {desc} ({p_name} -> {o_name})")
        else:
            print(f"  [FAIL] {desc} ({p_name} -> {o_name})")
            for l in lines:
                print(f"    {l}")
            all_ok = False

    live_cases = [
        ("payload_all_met.json", "live_output_all_met.json", "Live All Met Baseline"),
        ("payload_missing_data.json", "live_output_missing_data.json", "Live Missing Data & Completeness"),
        ("payload_two_not_met.json", "live_output_two_not_met.json", "Live Two NOT MET Outcomes"),
        ("payload_escalated_entry.json", "live_output_escalated_entry.json", "Live Escalated CQI Entry"),
        ("payload_prompt_injection.json", "live_output_prompt_injection.json", "Live Prompt-Injection Defense"),
    ]
    for p_name, o_name, desc in live_cases:
        p_path = HERE / p_name
        o_path = HERE / o_name
        if not p_path.exists() or not o_path.exists():
            print(f"  [SKIP] File not found: {o_name}")
            continue
        p_dict = json.loads(p_path.read_text(encoding="utf-8"))
        o_dict = json.loads(o_path.read_text(encoding="utf-8"))
        passed, lines = run_system_audit(p_dict, o_dict, claimed_model="gemini-3.5-flash-lite")
        if passed:
            print(f"  [PASS] {desc} ({p_name} -> {o_name})")
        else:
            print(f"  [FAIL] {desc} ({p_name} -> {o_name})")
            for l in lines:
                print(f"    {l}")
            all_ok = False



    return all_ok


async def main():
    parser = argparse.ArgumentParser(description="CQI narrative system test.")
    parser.add_argument("--live", action="store_true", default=False, help="Run live Gemini API call (needs explicit authorization).")
    args = parser.parse_args()

    payload_path = HERE / "synthetic_payload.json"
    payload_dict = json.loads(payload_path.read_text(encoding="utf-8"))

    if args.live:
        payload = CQIReportNarrativePayload.model_validate(payload_dict)
        resp = await generate_cqi_report_narrative(payload)
        if resp.status != "ok":
            print(f"Live call returned status: {resp.status} (Reason: {resp.reason or resp.error})")
            sys.exit(1)
        output_dict = resp.model_dump()
        output_path = HERE / "live_gemini_output.json"
        output_path.write_text(json.dumps(output_dict, indent=2), encoding="utf-8")
        print(f"Successfully recorded live output with provenance to {output_path.name}")
    else:
        output_path = HERE / "live_gemini_output.json"
        if not output_path.exists():
            print(f"File not found: {output_path}")
            sys.exit(1)
        output_dict = json.loads(output_path.read_text(encoding="utf-8"))

    passed, report_lines = run_system_audit(payload_dict, output_dict, claimed_model="gemini-3.5-flash-lite")
    for line in report_lines:
        print(line)

    if not passed:
        sys.exit(1)

    neg_passed = run_negative_tests(payload_dict, output_dict)
    suite_passed = run_suite_replays()

    sys.exit(0 if (passed and neg_passed and suite_passed) else 1)


if __name__ == "__main__":
    asyncio.run(main())
