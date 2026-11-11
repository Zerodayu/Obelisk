import asyncio
import json
import os
import sys
import time
from pathlib import Path

# Respect OBELISK_LLM_MODEL from environment
model_env = os.environ.get("OBELISK_LLM_MODEL", "gemini-3.5-flash-lite")
os.environ["OBELISK_LLM_MODEL"] = model_env

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR))

from app.analytics import cqi_narrative
from app.core.config import settings
from app.schemas.cqi_narrative import CQIReportNarrativePayload, CQINarrativeOutput

BASE_DIR = Path(__file__).resolve().parent
PAYLOAD_FILE = BASE_DIR / "payload_bsit_25_not_met.json"
OUT_FILE = BASE_DIR / f"live_{settings.LLM_MODEL}_payload_bsit_25_not_met.json"

provider_calls_count = 0
MAX_CALLS = 2

orig_call = cqi_narrative._execute_gemini_call

async def rate_limited_call(prompt: str):
    global provider_calls_count
    if provider_calls_count >= MAX_CALLS:
        raise RuntimeError(f"Max authorized calls ({MAX_CALLS}) reached.")
    print(f"  [Rate Limiter] Waiting 12s before provider call #{provider_calls_count + 1}...")
    await asyncio.sleep(12)
    provider_calls_count += 1
    print(f"  [Provider Call #{provider_calls_count}] Model: {settings.LLM_MODEL}...")
    return await orig_call(prompt)

cqi_narrative._execute_gemini_call = rate_limited_call

async def main():
    print(f"Loading payload: {PAYLOAD_FILE}")
    payload_data = json.loads(PAYLOAD_FILE.read_text(encoding="utf-8"))
    payload = CQIReportNarrativePayload.model_validate(payload_data)
    facts, missing = cqi_narrative.flatten_payload_to_facts(payload)
    print(f"Flattened facts: {len(facts)} items. Missing sections: {missing}")

    print("Calling generate_cqi_report_narrative with model:", settings.LLM_MODEL)
    t0 = time.perf_counter()
    resp = await cqi_narrative.generate_cqi_report_narrative(payload)
    total_elapsed = time.perf_counter() - t0

    resp_dict = resp.model_dump()
    OUT_FILE.write_text(json.dumps(resp_dict, indent=2), encoding="utf-8")
    print(f"Recorded output to {OUT_FILE.name}")
    print(f"Response status: {resp.status}")
    print(f"Total elapsed time: {total_elapsed:.2f}s")
    print(f"Provider calls executed: {provider_calls_count}")
    print(f"Uncovered outcomes count: {len(resp.uncovered_outcomes)}")
    for uo in resp.uncovered_outcomes:
        print(f"  Uncovered: {uo.scope} (status={uo.status}, composite={uo.composite}%, target={uo.target}%)")

    if resp.status == "ok":
        prov = resp.provenance
        print(f"Returned Model Version: {prov.returned_model_version}")
        print(f"Response ID: {prov.response_id}")
        print(f"Attempts used: {prov.attempts_used}")
        print(f"Total latency ms: {prov.total_latency_ms}")
        print(f"Total cost USD: ${prov.total_cost_usd}")
        if prov.attempts:
            for att in prov.attempts:
                print(f"  Attempt {att.attempt_number}: model={att.returned_model_version}, latency={att.latency_ms}ms, cost=${att.cost_usd}, failure_reason={att.failure_reason}, usage={att.usage_metadata}")

        # Verify with validator directly
        out_obj = CQINarrativeOutput(
            summary=resp.summary,
            recommendations=resp.recommendations,
            possible_contributing_factors=resp.possible_contributing_factors,
            pattern=resp.pattern,
            data_limitations=resp.data_limitations,
        )
        is_val, reason = cqi_narrative.validate_cqi_narrative(out_obj, facts)
        print(f"Direct validation check: {is_val} (Reason: {reason})")
    else:
        print(f"Reason / Error: {resp.reason or resp.error}")
        if resp.provenance and resp.provenance.attempts:
            for att in resp.provenance.attempts:
                print(f"  Attempt {att.attempt_number}: model={att.returned_model_version}, latency={att.latency_ms}ms, cost=${att.cost_usd}, failure_reason={att.failure_reason}, usage={att.usage_metadata}")

if __name__ == '__main__':
    asyncio.run(main())
