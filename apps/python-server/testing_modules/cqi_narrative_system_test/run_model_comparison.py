import asyncio
import copy
import json
import os
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Set working directory to repo python-server root
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR))

from app.analytics import cqi_narrative
from app.core.config import settings
from app.schemas.cqi_narrative import (
    CQINarrativeResponse,
    CQIReportNarrativePayload,
    FactItem,
)

BASE_DIR = Path(__file__).resolve().parent

PAYLOAD_SPECS = [
    ("payload_bsit_25_not_met", BASE_DIR / "payload_bsit_25_not_met.json"),
    ("payload_two_not_met", BASE_DIR / "payload_two_not_met.json"),
    ("synthetic_payload", BASE_DIR / "synthetic_payload.json"),
]

# Track provider calls
HARD_CAP = 30
total_provider_calls = 13  # 4 probes + 9 prior calls executed
consecutive_quota_errors = 0
halt_triggered = False
halt_reason = ""

orig_execute_call = cqi_narrative._execute_gemini_call

async def rate_limited_execute_call(prompt: str):
    global total_provider_calls, consecutive_quota_errors, halt_triggered, halt_reason

    if halt_triggered:
        raise RuntimeError(f"Execution halted: {halt_reason}")

    if total_provider_calls >= HARD_CAP:
        halt_triggered = True
        halt_reason = f"Hard cap of {HARD_CAP} provider calls reached."
        raise RuntimeError(halt_reason)

    if consecutive_quota_errors >= 2:
        halt_triggered = True
        halt_reason = "2 consecutive quota/rate limit errors encountered."
        raise RuntimeError(halt_reason)

    # Free-tier rate limiting: wait at least 12 seconds before calling LLM
    print(f"  [Rate Limiter] Waiting 12s before provider call #{total_provider_calls + 1}...")
    await asyncio.sleep(12)

    total_provider_calls += 1
    print(f"  [Provider Call #{total_provider_calls}] Model: {settings.LLM_MODEL}...")

    try:
        res = await orig_execute_call(prompt)
        consecutive_quota_errors = 0
        return res
    except Exception as e:
        err_str = str(e)
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
            consecutive_quota_errors += 1
            print(f"  [Rate Limit / Quota Error] Consecutive count: {consecutive_quota_errors}")
            if consecutive_quota_errors >= 2:
                halt_triggered = True
                halt_reason = "2 consecutive quota/rate limit errors encountered."
        else:
            consecutive_quota_errors = 0
        raise

cqi_narrative._execute_gemini_call = rate_limited_execute_call


def compute_coverage(payload_dict: dict, output_dict: dict, facts: List[FactItem]) -> Tuple[int, int, str]:
    payload = CQIReportNarrativePayload.model_validate(payload_dict)
    not_met_outcomes = [o.outcome_code for o in payload.outcomes if o.status == "NOT MET"]
    total_not_met = len(not_met_outcomes)
    if total_not_met == 0:
        return 0, 0, "N/A (0 NOT MET)"

    rec_factor_cited: Set[str] = set()
    for rec in output_dict.get("recommendations", []):
        rec_factor_cited.update(rec.get("evidence_fact_ids", []))
    for pcf in output_dict.get("possible_contributing_factors", []):
        rec_factor_cited.update(pcf.get("evidence_fact_ids", []))

    addressed_codes: Set[str] = set()
    for code in not_met_outcomes:
        outcome_facts = {f.fact_id for f in facts if f.scope == code}
        if rec_factor_cited.intersection(outcome_facts):
            addressed_codes.add(code)
        else:
            # Check if value facts missing and mentioned in data limitations
            val_facts = [
                f for f in facts
                if f.scope == code and any(k in f.source_field for k in ("composite_pct", "direct_pct", "indirect_pct"))
            ]
            has_missing = any(f.value == "missing/insufficient" for f in val_facts)
            if has_missing:
                in_limits = any(code in lim for lim in output_dict.get("data_limitations", []))
                if in_limits:
                    addressed_codes.add(code)

    addressed_count = len(addressed_codes)
    ratio_str = f"{addressed_count}/{total_not_met}"
    return addressed_count, total_not_met, ratio_str


async def main():
    with open(BASE_DIR / "probe_results.json", "r") as f:
        probes = json.load(f)

    responding_models = [p["model"] for p in probes if p.get("success")]
    print(f"Responding models from probe ({len(responding_models)}): {responding_models}")

    summary_records = []

    for payload_stem, payload_path in PAYLOAD_SPECS:
        print(f"\n=======================================================")
        print(f"Processing Payload: {payload_stem}")
        print(f"=======================================================")

        with open(payload_path, "r") as f:
            payload_data = json.load(f)

        payload_obj = CQIReportNarrativePayload.model_validate(payload_data)
        facts, _ = cqi_narrative.flatten_payload_to_facts(payload_obj)

        for model_id in responding_models:
            global halt_triggered, halt_reason
            out_filename = f"live_{model_id}_{payload_stem}.json"
            out_filepath = BASE_DIR / out_filename

            # If already generated, load existing record
            if out_filepath.exists():
                print(f"Loading already generated output: {out_filename}")
                with open(out_filepath, "r") as f:
                    saved_data = json.load(f)
                prov = saved_data.get("provenance") or {}
                status = saved_data.get("status", "unknown")
                cov_str = None
                if status == "ok":
                    _, _, cov_str = compute_coverage(payload_data, saved_data, facts)

                record = {
                    "payload": payload_stem,
                    "model": model_id,
                    "output_file": out_filename,
                    "duration_ms": None,
                    "status": status,
                    "returned_model_version": prov.get("returned_model_version"),
                    "response_id": prov.get("response_id"),
                    "attempts_used": prov.get("attempts_used", 1),
                    "failure_reason": saved_data.get("reason") or saved_data.get("error"),
                    "coverage_ratio": cov_str,
                    "usage_metadata": prov.get("usage_metadata"),
                    "timestamp_utc": prov.get("timestamp_utc", datetime.now(timezone.utc).isoformat()),
                }
                summary_records.append(record)
                continue

            if halt_triggered:
                print(f"SKIPPING {model_id} on {payload_stem} due to halt: {halt_reason}")
                break

            print(f"\n>>> Running Model: {model_id} on {payload_stem}")

            os.environ["OBELISK_LLM_MODEL"] = model_id
            settings.LLM_MODEL = model_id

            start_t = time.perf_counter()
            resp: Optional[CQINarrativeResponse] = None
            exec_error = None

            try:
                resp = await cqi_narrative.generate_cqi_report_narrative(payload_obj)
            except Exception as e:
                exec_error = str(e)
                print(f"  Execution exception: {exec_error}")

            duration_ms = round((time.perf_counter() - start_t) * 1000, 2)

            record = {
                "payload": payload_stem,
                "model": model_id,
                "output_file": out_filename,
                "duration_ms": duration_ms,
                "status": "error" if exec_error else (resp.status if resp else "unknown"),
                "returned_model_version": None,
                "response_id": None,
                "attempts_used": None,
                "failure_reason": None,
                "coverage_ratio": None,
                "usage_metadata": None,
                "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            }

            if resp:
                resp_dict = resp.model_dump()
                prov = resp_dict.get("provenance") or {}
                record["returned_model_version"] = prov.get("returned_model_version")
                record["response_id"] = prov.get("response_id")
                record["attempts_used"] = prov.get("attempts_used", 1)
                record["usage_metadata"] = prov.get("usage_metadata")
                if prov.get("timestamp_utc"):
                    record["timestamp_utc"] = prov.get("timestamp_utc")

                if resp.status == "ok":
                    _, _, cov_str = compute_coverage(payload_data, resp_dict, facts)
                    record["coverage_ratio"] = cov_str
                    print(f"  Result: OK | Attempts: {record['attempts_used']} | Coverage: {cov_str} | Latency: {duration_ms} ms")
                elif resp.status == "narrative_unavailable":
                    record["failure_reason"] = resp.reason
                    print(f"  Result: narrative_unavailable | Attempts: {record['attempts_used']} | Reason: {resp.reason}")
                else:
                    record["failure_reason"] = resp.error
                    print(f"  Result: error | Error: {resp.error}")

                with open(out_filepath, "w") as f:
                    json.dump(resp_dict, f, indent=2)
                print(f"  Saved output to {out_filepath.name}")
            else:
                record["failure_reason"] = exec_error
                print(f"  Failed without response object. Error: {exec_error}")

            summary_records.append(record)

    with open(BASE_DIR / "comparison_summary.json", "w") as f:
        json.dump(summary_records, f, indent=2)

    print(f"\nRuns finished. Total provider calls used: {total_provider_calls}/{HARD_CAP}")
    if halt_triggered:
        print(f"Halt occurred: {halt_reason}")


if __name__ == "__main__":
    asyncio.run(main())
