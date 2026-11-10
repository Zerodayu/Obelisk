"""
Batch runner for authorized live Gemini execution (up to 12 total calls).
Runs 6 payloads (baseline + 5 test payloads), tracks attempt-level outcomes and provenance.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
import sys
from typing import Any, Dict, List

HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app.analytics import cqi_narrative
from app.analytics.cqi_narrative import (
    _collect_canonical_fact_numbers,
    _extract_text_numbers,
    _parse_and_validate,
    build_cqi_narrative_prompt,
    flatten_payload_to_facts,
    generate_cqi_report_narrative,
    validate_cqi_narrative,
)
from app.schemas.cqi_narrative import CQIReportNarrativePayload

CALLS_MADE = 0
MAX_CALLS_AUTHORIZED = 12

original_gemini_call = cqi_narrative._execute_gemini_call

async def tracked_gemini_call(prompt: str):
    global CALLS_MADE
    if CALLS_MADE >= MAX_CALLS_AUTHORIZED:
        raise RuntimeError(f"Maximum authorized live calls ({MAX_CALLS_AUTHORIZED}) reached. Aborting.")
    CALLS_MADE += 1
    call_num = CALLS_MADE
    print(f"  [API CALL #{call_num}/{MAX_CALLS_AUTHORIZED}] Calling Gemini API...")
    raw_text, meta = await original_gemini_call(prompt)
    print(f"  [API CALL #{call_num}] Success. Model: {meta.get('returned_model_version')}, ID: {meta.get('response_id')}")
    return raw_text, meta

cqi_narrative._execute_gemini_call = tracked_gemini_call
cqi_narrative.IS_DEBUG_MODE = False

PAYLOADS = [
    ("Baseline (Standard CQI)", "synthetic_payload.json", "live_baseline_output.json"),
    ("All Outcomes MET", "payload_all_met.json", "live_output_all_met.json"),
    ("Missing Data & Completeness", "payload_missing_data.json", "live_output_missing_data.json"),
    ("Two NOT MET Outcomes", "payload_two_not_met.json", "live_output_two_not_met.json"),
    ("Escalated Entry", "payload_escalated_entry.json", "live_output_escalated_entry.json"),
    ("Prompt Injection Test", "payload_prompt_injection.json", "live_output_prompt_injection.json"),
]

async def main():
    print(f"Starting authorized live check suite (Max authorized calls: {MAX_CALLS_AUTHORIZED})...\n")
    results_summary = []

    for name, input_file, output_file in PAYLOADS:
        print(f"============================================================")
        print(f"Running: {name} ({input_file} -> {output_file})")
        print(f"============================================================")
        input_path = HERE / input_file
        with open(input_path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
        
        payload = CQIReportNarrativePayload.model_validate(raw_data)
        calls_before = CALLS_MADE

        response = await generate_cqi_report_narrative(payload)
        calls_for_payload = CALLS_MADE - calls_before

        out_path = HERE / output_file
        out_dict = response.model_dump(mode="json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(out_dict, f, indent=2, ensure_ascii=False)
        print(f"  Saved response to {out_path.name}")

        if output_file == "live_baseline_output.json":
            with open(HERE / "live_gemini_output.json", "w", encoding="utf-8") as f:
                json.dump(out_dict, f, indent=2, ensure_ascii=False)
            print(f"  Updated live_gemini_output.json")

        prov = response.provenance
        res_info = {
            "name": name,
            "input_file": input_file,
            "output_file": output_file,
            "status": response.status,
            "calls_used": calls_for_payload,
            "attempts_used": prov.attempts_used if prov else None,
            "attempt_1_reason": prov.attempt_1_reason if prov else None,
            "final_reason": response.reason,
            "model_version": prov.returned_model_version if prov else None,
            "response_id": prov.response_id if prov else None,
            "usage": prov.usage_metadata if prov else None,
            "timestamp_utc": prov.timestamp_utc if prov else None,
        }
        results_summary.append(res_info)

        print(f"  Result: status={response.status}, calls_used={calls_for_payload}, attempts={prov.attempts_used if prov else 'N/A'}")
        if prov and prov.attempt_1_reason:
            print(f"  Attempt 1 Failure Reason: {prov.attempt_1_reason}")
        if response.reason:
            print(f"  Final Failure Reason: {response.reason}")
        print()

    print("============================================================")
    print("LIVE RUN SUMMARY")
    print("============================================================")
    print(f"Total API Calls Made: {CALLS_MADE}/{MAX_CALLS_AUTHORIZED}\n")
    print(f"{'Payload':<30} | {'Status':<21} | {'Calls':<5} | {'Att':<3} | {'Attempt 1 Fail / Reason'}")
    print("-" * 110)
    for r in results_summary:
        att1_desc = "Clean Pass (No retry)" if not r["attempt_1_reason"] else f"Retry: {r['attempt_1_reason'][:50]}..."
        print(f"{r['name']:<30} | {r['status']:<21} | {r['calls_used']:<5} | {r['attempts_used']:<3} | {att1_desc}")

    summary_file = HERE / "live_run_summary.json"
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump({
            "total_calls_made": CALLS_MADE,
            "max_calls_authorized": MAX_CALLS_AUTHORIZED,
            "results": results_summary
        }, f, indent=2)
    print(f"\nDetailed summary written to {summary_file.name}")

if __name__ == "__main__":
    asyncio.run(main())
