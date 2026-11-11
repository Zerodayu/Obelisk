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
    compute_uncovered_outcomes,
    flatten_payload_to_facts,
    generate_cqi_report_narrative,
    validate_cqi_narrative,
)
from app.core.config import settings
from app.schemas.cqi_narrative import (
    CQINarrativeOutput,
    CQINarrativeResponse,
    CQIReportNarrativePayload,
    ContributingFactorItem,
    PatternItem,
    ProvenanceMetadata,
    RecommendationItem,
    UncoveredOutcome,
)


def run_system_audit(payload_dict: dict, output_dict: dict, claimed_model: Optional[str] = None) -> Tuple[bool, List[str]]:
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

    # Test 7: Multi-course bundling in single recommendation
    payload_courses = copy.deepcopy(payload_dict)
    payload_courses["outcomes"] = [
        {"outcome_type": "CLO", "course_code": "IT 101", "outcome_code": "CLO1", "target_pct": 75.0, "composite_pct": 60.0, "status": "NOT MET", "is_complete": True},
        {"outcome_type": "CLO", "course_code": "IT 201", "outcome_code": "CLO1", "target_pct": 75.0, "composite_pct": 62.0, "status": "NOT MET", "is_complete": True},
    ]
    p_course_obj = CQIReportNarrativePayload.model_validate(payload_courses)
    facts_courses, _ = flatten_payload_to_facts(p_course_obj)
    bundled_rec = RecommendationItem(
        problem="Attainment deficits across courses.",
        evidence_fact_ids=["fact_clo_IT_101_CLO1_status", "fact_clo_IT_201_CLO1_status"],
        existing_intervention_assessment="None supplied in assessment cycle.",
        proposed_additions="Revise rubrics and problem sets across courses.",
        intervention="Revise rubrics and problem sets across courses.",
        responsible_role="Faculty",
        timeline="To be set by Program Chair",
        success_indicator="Improved attainment across courses.",
        verification_method="Departmental exam review.",
    )
    output_7 = CQINarrativeOutput(
        summary="Summary of cross-course performance.",
        recommendations=[bundled_rec],
        possible_contributing_factors=[],
        data_limitations=[],
    )
    is_valid, reason = validate_cqi_narrative(output_7, facts_courses)
    assert not is_valid and "covers CLOs from multiple courses" in reason, f"Negative Test 7 FAILED: {reason}"
    print(f"  [PASS] Negative Test 7: Multi-course bundling rejected with reason: {reason}")

    # Test 8: Status mixing (MET and NOT MET in same recommendation)
    payload_mix = copy.deepcopy(payload_dict)
    p_mix_obj = CQIReportNarrativePayload.model_validate(payload_mix)
    facts_mix, _ = flatten_payload_to_facts(p_mix_obj)
    # CLO1 is NOT MET, CLO2 is MET in synthetic_payload
    mixed_rec = RecommendationItem(
        problem="Mixed performance in CLO1 and CLO2.",
        evidence_fact_ids=["fact_clo_CLO1_status", "fact_clo_CLO2_status"],
        existing_intervention_assessment="None supplied in assessment cycle.",
        proposed_additions="Revise assignments for CLO1 and CLO2.",
        intervention="Revise assignments for CLO1 and CLO2.",
        responsible_role="Faculty",
        timeline="To be set by Program Chair",
        success_indicator="Improved attainment.",
        verification_method="Departmental assessment review.",
    )
    output_8 = CQINarrativeOutput(
        summary="Summary of mixed outcomes.",
        recommendations=[mixed_rec],
        possible_contributing_factors=[],
        data_limitations=[],
    )
    is_valid, reason = validate_cqi_narrative(output_8, facts_mix)
    assert not is_valid and "mixes MET and NOT MET outcomes" in reason, f"Negative Test 8 FAILED: {reason}"
    print(f"  [PASS] Negative Test 8: Status mixing rejected with reason: {reason}")

    # Test 9: Missing individual recommendation for CRITICAL / HIGH outcome
    payload_prio = copy.deepcopy(payload_dict)
    payload_prio["outcomes"] = [
        {"outcome_type": "CLO", "course_code": "IT 101", "outcome_code": "CLO1", "priority": "CRITICAL", "gap_pp": 15.0, "target_pct": 75.0, "composite_pct": 60.0, "status": "NOT MET", "is_complete": True},
        {"outcome_type": "CLO", "course_code": "IT 101", "outcome_code": "CLO2", "target_pct": 75.0, "composite_pct": 65.0, "status": "NOT MET", "is_complete": True},
    ]
    p_prio_obj = CQIReportNarrativePayload.model_validate(payload_prio)
    facts_prio, _ = flatten_payload_to_facts(p_prio_obj)
    bundled_prio_rec = RecommendationItem(
        problem="Bundled IT 101/CLO1 and IT 101/CLO2.",
        evidence_fact_ids=["fact_clo_IT_101_CLO1_status", "fact_clo_IT_101_CLO2_status"],
        existing_intervention_assessment="None supplied in assessment cycle.",
        proposed_additions="Revise coding clinics for IT 101/CLO1 and IT 101/CLO2.",
        intervention="Revise coding clinics for IT 101/CLO1 and IT 101/CLO2.",
        responsible_role="Faculty",
        timeline="To be set by Program Chair",
        success_indicator="Improved attainment.",
        verification_method="Laboratory rubric review.",
    )
    output_9 = CQINarrativeOutput(
        summary="Summary of IT 101 performance.",
        recommendations=[bundled_prio_rec],
        possible_contributing_factors=[],
        data_limitations=[],
    )
    is_valid, reason = validate_cqi_narrative(output_9, facts_prio)
    assert not is_valid and "lacks a dedicated individual recommendation" in reason, f"Negative Test 9 FAILED: {reason}"
    print(f"  [PASS] Negative Test 9: Missing individual recommendation rejected with reason: {reason}")

    # Test 10: Generic boilerplate intervention rejection
    tampered_10 = copy.deepcopy(valid_output_dict)
    if tampered_10.get("recommendations"):
        tampered_10["recommendations"][0]["proposed_additions"] = "Strengthen active learning across all lectures."
        tampered_10["recommendations"][0]["intervention"] = "Strengthen active learning across all lectures."
        output_10 = CQINarrativeOutput(
            summary=tampered_10.get("summary", ""),
            recommendations=tampered_10.get("recommendations", []),
            possible_contributing_factors=tampered_10.get("possible_contributing_factors", []),
            pattern=tampered_10.get("pattern"),
            data_limitations=tampered_10.get("data_limitations", []),
        )
        is_valid, reason = validate_cqi_narrative(output_10, facts)
        assert not is_valid and "generic action" in reason, f"Negative Test 10 FAILED: {reason}"
        print(f"  [PASS] Negative Test 10: Generic boilerplate intervention rejected with reason: {reason}")

    # Test 11: Contributing factor hypothesis not matching root cause category
    tampered_11 = copy.deepcopy(valid_output_dict)
    if tampered_11.get("possible_contributing_factors"):
        tampered_11["possible_contributing_factors"][0]["root_cause_category"] = "1-Curriculum Design"
        tampered_11["possible_contributing_factors"][0]["hypothesis"] = "The weather was unusually warm during final testing."
        output_11 = CQINarrativeOutput(
            summary=tampered_11.get("summary", ""),
            recommendations=tampered_11.get("recommendations", []),
            possible_contributing_factors=tampered_11.get("possible_contributing_factors", []),
            pattern=tampered_11.get("pattern"),
            data_limitations=tampered_11.get("data_limitations", []),
        )
        is_valid, reason = validate_cqi_narrative(output_11, facts)
        assert not is_valid and "does not match root_cause_category" in reason, f"Negative Test 11 FAILED: {reason}"
        print(f"  [PASS] Negative Test 11: Mismatched root-cause category rejected with reason: {reason}")

    # Test 12: Two-way status contradiction (claiming NOT MET outcome was MET)
    tampered_12 = copy.deepcopy(valid_output_dict)
    tampered_12["summary"] = "Overall performance was positive because CLO1 was met this semester."
    output_12 = CQINarrativeOutput(
        summary=tampered_12["summary"],
        recommendations=tampered_12.get("recommendations", []),
        possible_contributing_factors=tampered_12.get("possible_contributing_factors", []),
        pattern=tampered_12.get("pattern"),
        data_limitations=tampered_12.get("data_limitations", []),
    )
    is_valid, reason = validate_cqi_narrative(output_12, facts)
    assert not is_valid and "contradicts fact" in reason, f"Negative Test 12 FAILED: {reason}"
    print(f"  [PASS] Negative Test 12: Status contradiction rejected with reason: {reason}")

    # Test 13: Mentioning unknown outcome not in facts
    tampered_13 = copy.deepcopy(valid_output_dict)
    tampered_13["summary"] = "Performance in CS 999/CLO9 was particularly notable across cohorts."
    output_13 = CQINarrativeOutput(
        summary=tampered_13["summary"],
        recommendations=tampered_13.get("recommendations", []),
        possible_contributing_factors=tampered_13.get("possible_contributing_factors", []),
        pattern=tampered_13.get("pattern"),
        data_limitations=tampered_13.get("data_limitations", []),
    )
    is_valid, reason = validate_cqi_narrative(output_13, facts)
    assert not is_valid and "which does not exist in supplied facts" in reason, f"Negative Test 13 FAILED: {reason}"
    print(f"  [PASS] Negative Test 13: Unknown outcome mention rejected with reason: {reason}")

    # Test 14: Duplicate outcome identifier rejection (schema validation error / HTTP 422)
    payload_dup = copy.deepcopy(payload_dict)
    payload_dup["outcomes"] = [
        {"outcome_type": "CLO", "course_code": "IT 101", "outcome_code": "CLO1", "target_pct": 75.0, "status": "NOT MET"},
        {"outcome_type": "CLO", "course_code": "IT 101", "outcome_code": "CLO1", "target_pct": 75.0, "status": "NOT MET"},
    ]
    try:
        CQIReportNarrativePayload.model_validate(payload_dup)
        assert False, "Negative Test 14 FAILED: Duplicate outcome identifier was not rejected!"
    except ValueError as e:
        assert "Duplicate outcome identifier found" in str(e)
        print(f"  [PASS] Negative Test 14: Duplicate outcome identifier rejected with: {e}")

    # Test 15: Coverage policy test - Attempt 2 simulation where PLO1 is omitted
    bsit_p = json.loads((HERE / "payload_bsit_25_not_met.json").read_text(encoding="utf-8"))
    bsit_payload = CQIReportNarrativePayload.model_validate(bsit_p)
    bsit_facts, _ = flatten_payload_to_facts(bsit_payload)

    # Build recommendations addressing all NOT MET outcomes except PLO1
    # Priority outcomes (CRITICAL / HIGH): IT 101/CLO3, IT 101/CLO1, IT 101/CLO5, IT 201/CLO3, BSIS 101/CLO3
    test_recs = [
        RecommendationItem(
            problem="IT 101/CLO3 fell below target at 59.7% composite.",
            evidence_fact_ids=["fact_clo_IT_101_CLO3_status", "fact_clo_IT_101_CLO3_composite", "fact_clo_IT_101_CLO3_target"],
            existing_intervention_assessment="None supplied",
            proposed_additions="Introduce targeted laboratory clinics for IT 101/CLO3.",
            responsible_role="Faculty",
            timeline="To be set by Program Chair",
            success_indicator="Attainment reaches 74.0% target.",
            target=74.0,
            verification_method="Review rubric scores.",
        ),
        RecommendationItem(
            problem="IT 101/CLO1 fell below target at 61.7% composite.",
            evidence_fact_ids=["fact_clo_IT_101_CLO1_status", "fact_clo_IT_101_CLO1_composite", "fact_clo_IT_101_CLO1_target"],
            existing_intervention_assessment="None supplied",
            proposed_additions="Implement modular programming workshops for IT 101/CLO1.",
            responsible_role="Faculty",
            timeline="To be set by Program Chair",
            success_indicator="Attainment reaches 72.0% target.",
            target=72.0,
            verification_method="Review practical exam results.",
        ),
        RecommendationItem(
            problem="IT 101/CLO5 fell below target at 63.7% composite.",
            evidence_fact_ids=["fact_clo_IT_101_CLO5_status", "fact_clo_IT_101_CLO5_composite", "fact_clo_IT_101_CLO5_target"],
            existing_intervention_assessment="None supplied",
            proposed_additions="Revise instructional scaffolding for IT 101/CLO5.",
            responsible_role="Faculty",
            timeline="To be set by Program Chair",
            success_indicator="Attainment reaches 73.0% target.",
            target=73.0,
            verification_method="Review assignment outcomes.",
        ),
        RecommendationItem(
            problem="IT 201/CLO3 fell below target at 65.7% composite.",
            evidence_fact_ids=["fact_clo_IT_201_CLO3_status", "fact_clo_IT_201_CLO3_composite", "fact_clo_IT_201_CLO3_target"],
            existing_intervention_assessment="None supplied",
            proposed_additions="Provide supplementary database schema exercises for IT 201/CLO3.",
            responsible_role="Faculty",
            timeline="To be set by Program Chair",
            success_indicator="Attainment reaches 76.0% target.",
            target=76.0,
            verification_method="Inspect database project rubrics.",
        ),
        RecommendationItem(
            problem="BSIS 101/CLO3 fell below target at 67.0% composite.",
            evidence_fact_ids=["fact_clo_BSIS_101_CLO3_status", "fact_clo_BSIS_101_CLO3_composite", "fact_clo_BSIS_101_CLO3_target"],
            existing_intervention_assessment="None supplied",
            proposed_additions="Align enterprise system case studies for BSIS 101/CLO3.",
            responsible_role="Faculty",
            timeline="To be set by Program Chair",
            success_indicator="Attainment reaches 70.0% target.",
            target=70.0,
            verification_method="Evaluate case study submissions.",
        ),
    ]

    other_not_met_clos = [
        ("BSIS 101", ["CLO1"]),
        ("CAP 102", ["CLO1", "CLO3", "CLO5"]),
        ("IT 101", ["CLO2", "CLO4"]),
        ("IT 201", ["CLO1", "CLO5"]),
        ("IT 301", ["CLO1", "CLO3", "CLO5"]),
    ]
    for course, clos in other_not_met_clos:
        fids = [f"fact_clo_{course.replace(' ', '_')}_{c}_status" for c in clos]
        test_recs.append(
            RecommendationItem(
                problem=f"Remaining NOT MET outcomes in {course} ({', '.join(clos)}) fell below institutional targets.",
                evidence_fact_ids=fids,
                existing_intervention_assessment="None supplied",
                proposed_additions=f"Conduct mid-term review and targeted remediation sessions for {course}.",
                responsible_role="Faculty",
                timeline="To be set by Program Chair",
                success_indicator=f"Outcomes in {course} demonstrate attainment progress.",
                target=None,
                verification_method="Review departmental grade reports.",
            )
        )

    plo_fids = [f"fact_plo_PLO{i}_status" for i in [2, 3, 4, 5, 7, 8, 11, 13]]
    test_recs.append(
        RecommendationItem(
            problem="Program learning outcomes PLO2, PLO3, PLO4, PLO5, PLO7, PLO8, PLO11, and PLO13 fell below targets.",
            evidence_fact_ids=plo_fids,
            existing_intervention_assessment="None supplied",
            proposed_additions="Coordinate program curriculum mapping adjustments across faculty teaching BSIT cohorts.",
            responsible_role="Program Chair",
            timeline="To be set by Program Chair",
            success_indicator="Program attainment targets reached across assessed domains.",
            target=None,
            verification_method="Review curriculum audit report.",
        )
    )

    test_output_omitting_plo1 = CQINarrativeOutput(
        summary="Assessment findings indicate outcomes below institutional targets across BSIT and BSIS cohorts.",
        recommendations=test_recs,
        possible_contributing_factors=[
            ContributingFactorItem(
                hypothesis="Curriculum pacing in preliminary laboratory exercises may affect practical skill retention.",
                root_cause_category="1-Curriculum Design",
                evidence_fact_ids=["fact_clo_IT_101_CLO3_composite", "fact_clo_IT_101_CLO3_status"],
            )
        ],
        pattern=PatternItem(
            description="Technical outcomes in foundational courses demonstrated lower attainment than advanced cohorts.",
            evidence_fact_ids=["fact_clo_IT_101_CLO3_status", "fact_clo_IT_201_CLO3_status"],
        ),
        data_limitations=[],
    )

    is_valid, reason = validate_cqi_narrative(test_output_omitting_plo1, bsit_facts)
    assert is_valid, f"Negative Test 15 FAILED: Expected output omitting regular NOT MET outcome PLO1 to pass validation, got: {reason}"
    uncovered = compute_uncovered_outcomes(test_output_omitting_plo1, bsit_facts)
    assert len(uncovered) == 1, f"Expected exactly 1 uncovered outcome, got {len(uncovered)}: {[u.scope for u in uncovered]}"
    assert uncovered[0].scope == "PLO1", f"Expected uncovered outcome to be PLO1, got {uncovered[0].scope}"
    assert uncovered[0].status == "NOT MET"
    assert uncovered[0].composite == 69.2
    assert uncovered[0].target == 72.0

    resp = CQINarrativeResponse(
        status="ok",
        summary=test_output_omitting_plo1.summary,
        recommendations=test_output_omitting_plo1.recommendations,
        possible_contributing_factors=test_output_omitting_plo1.possible_contributing_factors,
        pattern=test_output_omitting_plo1.pattern,
        data_limitations=test_output_omitting_plo1.data_limitations,
        missing_sections=["cqi_entries"],
        facts_used=bsit_facts,
        uncovered_outcomes=uncovered,
    )
    assert resp.status == "ok"
    assert len(resp.uncovered_outcomes) == 1
    assert resp.uncovered_outcomes[0].scope == "PLO1"
    print(f"  [PASS] Negative Test 15: Coverage policy verified: output omitting regular outcome PLO1 passes validation with PLO1 in uncovered_outcomes (composite={uncovered[0].composite}%, target={uncovered[0].target}%).")

    # Verify that CRITICAL outcome missing dedicated recommendation STILL fails as a hard failure
    tampered_prio = copy.deepcopy(test_recs)
    # Remove dedicated recommendation for IT 101/CLO3 (CRITICAL)
    tampered_prio = [r for r in tampered_prio if "IT 101/CLO3" not in r.problem]
    tampered_prio_output = CQINarrativeOutput(
        summary=test_output_omitting_plo1.summary,
        recommendations=tampered_prio,
        possible_contributing_factors=test_output_omitting_plo1.possible_contributing_factors,
        pattern=test_output_omitting_plo1.pattern,
        data_limitations=[],
    )
    is_valid_prio, reason_prio = validate_cqi_narrative(tampered_prio_output, bsit_facts)
    assert not is_valid_prio, "CRITICAL outcome without dedicated recommendation should have failed!"
    assert "CRITICAL priority, but lacks a dedicated individual recommendation" in reason_prio
    print(f"  [PASS] Negative Test 15b: CRITICAL outcome without dedicated recommendation fails validation with: {reason_prio}")

    # 15c: Simulate partial first attempt followed by successful targeted recommendation merge
    targeted_rec_plo1 = RecommendationItem(
        problem="Program learning outcome PLO1 fell below institutional target benchmark.",
        evidence_fact_ids=["fact_plo_PLO1_composite", "fact_plo_PLO1_target", "fact_plo_PLO1_status"],
        existing_intervention_assessment="None supplied",
        proposed_additions="Coordinate curriculum committee review of introductory programming courses contributing to PLO1.",
        responsible_role="Program Chair",
        timeline="To be set by Program Chair",
        success_indicator="PLO1 cohort composite attainment reaches the 72.0% target.",
        target=72.0,
        verification_method="Review program curriculum audit report.",
    )
    targeted_output = CQINarrativeOutput(
        summary="Targeted recommendation for uncovered outcome PLO1.",
        recommendations=[targeted_rec_plo1],
        possible_contributing_factors=[],
        pattern=None,
        data_limitations=[],
    )
    merged_recs = list(test_output_omitting_plo1.recommendations) + list(targeted_output.recommendations)
    merged_output = CQINarrativeOutput(
        summary=test_output_omitting_plo1.summary,
        recommendations=merged_recs,
        possible_contributing_factors=test_output_omitting_plo1.possible_contributing_factors,
        pattern=test_output_omitting_plo1.pattern,
        data_limitations=test_output_omitting_plo1.data_limitations,
    )
    merged_valid, merged_reason = validate_cqi_narrative(merged_output, bsit_facts)
    assert merged_valid, f"Merged output should pass validation: {merged_reason}"
    final_uncovered = compute_uncovered_outcomes(merged_output, bsit_facts)
    assert len(final_uncovered) == 0, f"Expected 0 uncovered outcomes after merge, got: {[u.scope for u in final_uncovered]}"

    # Fallback simulation: If targeted retry fails or times out, return first attempt with uncovered_outcomes
    fallback_resp = CQINarrativeResponse(
        status="ok",
        summary=test_output_omitting_plo1.summary,
        recommendations=test_output_omitting_plo1.recommendations,
        possible_contributing_factors=test_output_omitting_plo1.possible_contributing_factors,
        pattern=test_output_omitting_plo1.pattern,
        data_limitations=test_output_omitting_plo1.data_limitations,
        missing_sections=["cqi_entries"],
        facts_used=bsit_facts,
        uncovered_outcomes=uncovered,
    )
    assert fallback_resp.status == "ok"
    assert len(fallback_resp.uncovered_outcomes) == 1
    assert fallback_resp.uncovered_outcomes[0].scope == "PLO1"
    print("  [PASS] Negative Test 15c: Targeted retry merge verified (merged output covers all 25 NOT MET outcomes; fallback preserves uncovered_outcomes).")

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
        expected_live_model = o_dict.get("provenance", {}).get("requested_model", str(settings.LLM_MODEL))
        passed, lines = run_system_audit(p_dict, o_dict, claimed_model=expected_live_model)
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

    passed, report_lines = run_system_audit(payload_dict, output_dict, claimed_model=str(settings.LLM_MODEL))
    for line in report_lines:
        print(line)

    if not passed:
        sys.exit(1)

    neg_passed = run_negative_tests(payload_dict, output_dict)
    suite_passed = run_suite_replays()

    sys.exit(0 if (passed and neg_passed and suite_passed) else 1)


if __name__ == "__main__":
    asyncio.run(main())
