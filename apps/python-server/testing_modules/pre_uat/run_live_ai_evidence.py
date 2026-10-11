"""Evidence-only by default. --live-st-ai002 authorizes at most one new request.

Never generates ST-AI-001 again. ST-AI-004 uses saved responses only. Every run
writes a fresh directory and leaves historical/consolidated mocked rows intact.
"""
import argparse
import ast
import asyncio
from collections import Counter
import contextlib
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import sys
import time
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EVIDENCE = HERE / "evidence"
WORST = EVIDENCE / "20261011T092244_208959Z_ST-AI-001_live"
sys.path.insert(0, str(ROOT))
sys.dont_write_bytecode = True
from testing_modules.pre_uat.live_ai_claims import claims, self_check


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path, value):
    with path.open("x", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, ensure_ascii=False)


def relative(path):
    return path.resolve().relative_to(ROOT).as_posix()


def fingerprints():
    files = list((ROOT / "app").rglob("*.py")) + list((ROOT / "testing_modules/old_test").glob("*"))
    files += list(EVIDENCE.rglob("*"))
    return {relative(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file() and "__pycache__" not in p.parts}


def independent_dataset(scenario):
    # Reuse the unchanged fixture's scenario selector, without importing its
    # offline bootstrap or any production/credential/provider module.
    tree = ast.parse((HERE / "support.py").read_text(encoding="utf-8-sig"))
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "SyntheticWorkbook")
    method = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == "values")
    namespace = {}
    exec(compile(ast.Module(body=[method], type_ignores=[]), str(HERE / "support.py"), "exec"), namespace)
    result = []
    for s in range(4):
        for c in range(3):
            fraction, rating = namespace["values"](SimpleNamespace(scenario=scenario), s, c)
            direct = Decimal(str(fraction))
            indirect = Decimal(str(rating)) / 5 * 100
            composite = (Decimal("0.70") * direct * 100 + Decimal("0.30") * indirect).quantize(Decimal("0.01"))
            result.append(dict(student_name=f"Student {chr(65+s)}", clo_code=f"CLO{c+1}",
                               direct_clo_attainment_pct=float(direct), indirect_clo_attainment_pct=float(indirect),
                               composite_clo_attainment_pct=float(composite), met_threshold=composite >= 70))
    return result


def validate_schema(text):
    # Execute the exact pure production validator definition; evidence-only
    # mode never imports config.py or constructs any Gemini client.
    source = ROOT / "app/analytics/cqi_recommender.py"
    tree = ast.parse(source.read_text(encoding="utf-8-sig"))
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "validate_course_recommendation")
    namespace = {"json": json}
    exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), "exec"), namespace)
    return namespace["validate_course_recommendation"](text)


def validate_source(source, scenario):
    assert source["production_recommender_invoked"] is True
    assert source["provider_invoked"] is True and source["sdk_generation_invoked"] is True
    assert source["observed_sdk_http_attempts"] == 1
    assert source.get("actual_generated_response")
    assert source["production_result"]["status"] == "ok"
    assert source["inputs_unchanged"] is True
    actual = sorted(source["input_records"], key=lambda r: (r["student_name"], r["clo_code"]))
    expected = sorted(independent_dataset(scenario), key=lambda r: (r["student_name"], r["clo_code"]))
    assert len(actual) == 12
    for a, e in zip(actual, expected, strict=True):
        assert all(a.get(key) == value for key, value in e.items()), "Saved ETL does not match independent fixture arithmetic"
    assert len({(r["student_name"], r["clo_code"]) for r in actual}) == 12
    assert "threshold = 70.0%" in source["actual_prompt"]
    assert validate_schema(source["production_result"]["recommendation"])
    generated = json.loads(source["production_result"]["recommendation"])
    # Raw SDK text may contain a valid wrapping code fence. Production normalized
    # output must be the same JSON body, never a substituted/canned response.
    raw = source["actual_generated_response"].strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    assert json.loads(raw) == generated
    return generated, expected


def find_mixed():
    candidates = sorted(set(EVIDENCE.rglob("LIVE_ST-AI-002.json")) | set(EVIDENCE.rglob("ST-AI-002_result.txt")), reverse=True)
    for path in candidates:
        try:
            source = read_json(path)
            if source.get("test_id") == "ST-AI-002":
                validate_source(source, "mixed")
                return path, source
        except (KeyError, ValueError, AssertionError, TypeError):
            continue
    return None, None


async def mixed_live(destination):
    # These helpers do not call a provider at module import; their mocked/test
    # entry points are never used. Only unchanged fixture/config helpers reused.
    from testing_modules.pre_uat.run_st_ai001_live import load_configuration, fixture_helpers
    cqi = load_configuration()
    from google.genai import _api_client
    from importlib.metadata import version
    record = dict(test_id="ST-AI-002", execution_type="Live Gemini AI generation",
                  timestamp=datetime.now(timezone.utc).isoformat(), production_recommender_invoked=False,
                  provider_invoked=False, sdk_generation_invoked=False, observed_sdk_http_attempts=0,
                  actual_generated_response=None, status="BLOCKED")
    start = time.perf_counter()
    # No additional SDK client is constructed by preflight. The unchanged
    # production function constructs the only generation client.
    keys = cqi.settings.llm_api_keys_list
    record["preflight"] = dict(debug_mode=cqi.IS_DEBUG_MODE, configured_key_count=len(keys),
        model=cqi.settings.LLM_MODEL, google_genai_version=version("google-genai"),
        sdk_max_attempts=_api_client.retry_args(None)["stop"].max_attempt_number,
        installed_aiohttp_transport=_api_client.has_aiohttp)
    clients = []
    frames = set()
    secrets = list(keys)
    try:
        assert not cqi.IS_DEBUG_MODE and len(keys) == 1, "Single configured key and real provider mode required"
        assert record["preflight"]["sdk_max_attempts"] == 1
        assert not _api_client.has_aiohttp, "aiohttp internal connection retries cannot satisfy unchanged single-request constraint"
        assert not any(os.getenv(name) for name in ("GOOGLE_GEMINI_BASE_URL", "GOOGLE_VERTEX_BASE_URL"))
        assert os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "false").lower() not in {"true", "1"}
        assert os.getenv("GOOGLE_GENAI_USE_ENTERPRISE", "false").lower() not in {"true", "1"}
        # Fail closed if production client configuration has changed since audit.
        tree = ast.parse((ROOT / "app/analytics/cqi_recommender.py").read_text(encoding="utf-8-sig"))
        provider = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "call_llm_api")
        constructors = [n for n in ast.walk(provider) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == "Client"]
        assert len(constructors) == 1 and [k.arg for k in constructors[0].keywords] == ["api_key"]
        helpers = fixture_helpers(cqi)
        with helpers["SyntheticWorkbook"](scenario="mixed", students=4, clos=3) as fixture:
            extracted, output = await fixture.etl()
            record["input_records"] = [a.model_dump() for a in cqi.anonymize_students(output)]
            expected = independent_dataset("mixed")
            for actual, oracle in zip(record["input_records"], expected, strict=True):
                assert all(actual.get(key) == value for key, value in oracle.items())
            assert sum(a.met_threshold is False for a in output) == 6
            before = [a.model_dump() for a in output]
            gap = cqi.identify_gaps(extracted[0], cqi.anonymize_students(output))
            record["actual_prompt"] = cqi.build_prompt(extracted[0], gap)
            record["fixture_sha256"] = hashlib.sha256(fixture.path.read_bytes()).hexdigest()
            def observe(frame, event, value):
                name, path = frame.f_code.co_name, frame.f_code.co_filename.replace("\\", "/")
                if event == "return" and name == "__init__" and path.endswith("/google/genai/client.py"):
                    client = frame.f_locals.get("self")
                    if isinstance(client, cqi.genai.Client) and client not in clients:
                        clients.append(client)
                if event == "call" and name == "call_llm_api" and path.endswith("/app/analytics/cqi_recommender.py"):
                    record["provider_invoked"] = True
                    record["actual_prompt"] = frame.f_locals["prompt"]
                if event == "call" and name == "generate_content" and path.endswith("/google/genai/models.py"):
                    record["sdk_generation_invoked"] = True
                    record["requested_model"] = frame.f_locals.get("model")
                if event == "call" and name == "_async_request_once" and path.endswith("/google/genai/_api_client.py"):
                    frames.add(id(frame))
                if event == "return" and name == "generate_content" and isinstance(value, cqi.types.GenerateContentResponse):
                    record["actual_generated_response"] = value.text
                    record["response_model_version"] = value.model_version
                    record["provider_response_id"] = value.response_id
            previous = sys.getprofile()
            sys.setprofile(observe)
            record["production_recommender_invoked"] = True
            try:
                record["production_result"] = await asyncio.wait_for(
                    cqi.generate_cqi_recommendation(extracted[0], output), timeout=60)
            finally:
                sys.setprofile(previous)
                record["observed_sdk_http_attempts"] = len(frames)
            record["inputs_unchanged"] = before == [a.model_dump() for a in output]
            if record["actual_generated_response"]:
                record["status"] = "PASS" if record["production_result"]["status"] == "ok" else "FAIL"
            else:
                record["reason"] = "Provider did not produce a generated recommendation. No retry performed."
    except Exception as exc:
        record.update(status="BLOCKED", error_type=type(exc).__name__, reason="Preflight or provider could not complete within the single-request bounds.")
    finally:
        for client in clients:
            try:
                await client.aio.aclose()
                client.close()
            except Exception as exc:
                record["client_cleanup_error_type"] = type(exc).__name__
        record["duration_seconds"] = round(time.perf_counter()-start, 6)
    serialized = json.dumps(record, ensure_ascii=False)
    for key in secrets:
        serialized = serialized.replace(key, "[REDACTED]")
        if len(key) > 8:
            serialized = serialized.replace(f"{key[:4]}...{key[-4:]}", "[REDACTED]")
    record = json.loads(serialized)
    path = destination / "LIVE_ST-AI-002.json"
    write_json(path, record)
    return path, record


def result_row(test_id, objective, scenario, expected, destination, command):
    return dict(test_id=test_id, objective=objective, scenario=scenario, expected=expected,
        actual=[], status="BLOCKED", executed=False, timestamp=datetime.now(timezone.utc).isoformat(),
        environment=dict(python=platform.python_version(), platform=platform.platform(),
                         database="not used", redis="not used", workers="not started", synthetic_data=True),
        script_function="testing_modules.pre_uat.run_live_ai_evidence.generation_row",
        command=command, duration_seconds=None, subchecks=[], failures=[],
        evidence_path=relative(destination / (test_id + "_result.txt")), live_api_called=False,
        evidence_processing_timestamp=datetime.now(timezone.utc).isoformat())


def generation_row(test_id, source_path, source, scenario, destination, command, newly_called=False):
    start = time.perf_counter()
    row = result_row(test_id, "Generate CQI recommendations for " + scenario + " attainment",
        "4 fictional students, 3 CLOs, 12 records; " + ("all 12 below 70% at composite 6%" if scenario == "worst" else "6 below, 6 at/above 70%; composite 40/62.5/73.5/90%"),
        "Genuine schema-valid recommendation addresses measured gaps; educational usefulness requires academic review.", destination, command)
    if source is None:
        row["failures"] = ["No valid saved live generation. Use explicit opt-in to request ST-AI-002 only."]
    else:
        row.update(source_execution_timestamp=source.get("timestamp"), timestamp=source.get("timestamp"),
                   source_execution_duration_seconds=source.get("duration_seconds"),
                   execution_type="live generation then evidence validation" if newly_called else "saved live evidence validation",
                   provider="Google Gemini", model=source.get("response_model_version", source.get("requested_model")),
                   source_evidence=relative(source_path), live_api_called=newly_called)
        try:
            generated, expected_records = validate_source(source, scenario)
            data_checks = claims(generated, expected_records)
            row.update(status="PASS", executed=True, generated_recommendation=generated,
                       schema_validation="PASS", numerical_validation=data_checks, manual_review_required=True,
                       actual=[dict(provider_attempts=source["observed_sdk_http_attempts"],
                                    records=12, below_threshold=sum(r["met_threshold"] is False for r in expected_records),
                                    inputs_unchanged=True, response=generated)],
                       acceptance_scope="Genuine generation, schema and independently verified input/gap data; academic quality is not certified.")
            if data_checks["counts"]["MISMATCH"]:
                row.update(status="FAIL", failures=["Generated numerical claim contradicts independently calculated fixture data."])
            text = json.dumps(generated).lower()
            row["advisory_review"] = dict(status="MANUAL REVIEW", grade_wording_present="grade" in text,
                limitation="Lexical checks cannot certify absence of every grade-manipulation suggestion. Academic review required.")
            row["gap_relevance"] = dict(mentioned_clos=[c for c in ("CLO1", "CLO2", "CLO3") if c in json.dumps(generated)],
                status="MANUAL REVIEW", limitation="Mentions and role labels do not prove educational usefulness or adequate improvement actions.")
            (destination / (test_id + "_PROMPT.txt")).write_text(source["actual_prompt"], encoding="utf-8")
            (destination / (test_id + "_GEMINI_RESPONSE.txt")).write_text(source["actual_generated_response"], encoding="utf-8")
            write_json(destination / (test_id + "_GEMINI_RESPONSE.json"), generated)
            row["subchecks"] = [dict(check="Saved real-provider provenance", status="PASS"), dict(check="Independent fixture data", status="PASS"), dict(check="Production response schema", status="PASS")]
        except (AssertionError, KeyError, ValueError, TypeError) as exc:
            row.update(status="FAIL" if source.get("actual_generated_response") else "BLOCKED", executed=bool(source.get("actual_generated_response")),
                       failures=["Saved source/response validation could not pass: " + type(exc).__name__], actual=[source])
    row["duration_seconds"] = round(time.perf_counter()-start, 6)
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live-st-ai002", action="store_true")
    args = parser.parse_args()
    protected = fingerprints()
    destination = EVIDENCE / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S_%fZ") + "_live_ai_evidence")
    destination.mkdir(exist_ok=False)
    command = "& '.venv/Scripts/python.exe' -B testing_modules/pre_uat/run_live_ai_evidence.py" + (" --live-st-ai002" if args.live_st_ai002 else "")
    source001 = read_json(WORST / "ST-AI-001_result.txt")
    # Corroborate accompanying files instead of trusting a PASS label.
    assert read_json(WORST / "GEMINI_RESPONSE.json") == json.loads(source001["actual_generated_response"])
    assert (WORST / "PROMPT.txt").read_text(encoding="utf-8-sig").strip() == source001["actual_prompt"].strip()
    assert read_json(WORST / "POST_RUN_REVIEW.json")["failed_checks"] == 0
    assert (WORST / "LIVE_EXECUTION_SUMMARY.md").is_file()
    control = self_check()
    source002_path, source002 = find_mixed()
    new_call = False
    if args.live_st_ai002 and source002 is None:
        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                source002_path, source002 = asyncio.run(mixed_live(destination))
        except Exception as exc:
            source002 = dict(test_id="ST-AI-002", status="BLOCKED", error_type=type(exc).__name__,
                             timestamp=datetime.now(timezone.utc).isoformat(), observed_sdk_http_attempts=0,
                             reason="Configuration/preflight could not complete; no raw exception or credentials recorded.")
            source002_path = destination / "LIVE_ST-AI-002.json"
            write_json(source002_path, source002)
        new_call = source002["observed_sdk_http_attempts"] > 0
    row001 = generation_row("ST-AI-001", WORST / "ST-AI-001_result.txt", source001, "worst", destination, command)
    row002 = generation_row("ST-AI-002", source002_path, source002, "mixed", destination, command, new_call)
    start = time.perf_counter()
    row004 = result_row("ST-AI-004", "Numerical grounding of real Gemini CQI responses", "Saved worst and mixed live responses; no generation for ST-AI-004",
        "Every identifiable numerical claim is VERIFIED or NOT APPLICABLE; any MISMATCH fails, unresolved claims require review and prevent PASS.", destination, command)
    available = [r for r in (row001, row002) if "numerical_validation" in r]
    row004.update(executed=bool(available), execution_type="saved live response numerical validation",
                  script_function="testing_modules.pre_uat.live_ai_claims.claims",
                  provider="saved Google Gemini output", actual=[dict(source_test=r["test_id"], source_evidence=r["source_evidence"], validation=r["numerical_validation"]) for r in available],
                  source_execution_timestamps={r["test_id"]: r["source_execution_timestamp"] for r in available})
    outcomes = Counter(claim["outcome"] for r in available for claim in r["numerical_validation"]["claims"])
    row004["numerical_validation"] = dict(outcomes)
    row004["manual_review_required"] = outcomes["MANUAL REVIEW"] > 0
    if outcomes["MISMATCH"]:
        row004.update(status="FAIL", failures=["Supported numerical claims contradict the independent dataset."])
    elif len(available) < 2:
        row004["failures"] = ["Both saved live scenarios are required; mixed live response is unavailable."]
    elif outcomes["MANUAL REVIEW"]:
        row004["failures"] = ["Unresolved numerical claims require human review; not silently treated as correct."]
    else:
        row004["status"] = "PASS"
    row004["duration_seconds"] = round(time.perf_counter()-start, 6)
    rows = [row001, row002, row004]
    current = fingerprints()
    changes = [path for path, digest in protected.items() if current.get(path) != digest]
    assert not changes, "Historical evidence/production/original scripts changed during workflow"
    write_json(destination / "PRESERVATION.json", dict(protected_files=len(protected), changed_files=changes))
    write_json(destination / "SOURCE_MANIFEST.json", {relative(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in
        (Path(__file__), HERE / "live_ai_claims.py", HERE / "support.py", ROOT / "app/analytics/cqi_recommender.py")})
    for row in rows:
        write_json(destination / (row["test_id"] + "_result.txt"), row)
    write_json(destination / "RESULTS.json", dict(rows=rows, new_sdk_http_attempts=source002["observed_sdk_http_attempts"] if new_call else 0,
                                                  numerical_parser_controls=control, command=command))
    lines = ["LIVE-AI EVIDENCE | ST-AI-001 reused; ST-AI-004 uses saved output only",
             f"New Gemini SDK HTTP attempts this run: {source002['observed_sdk_http_attempts'] if new_call else 0}"]
    for row in rows:
        lines.append(f"{row['test_id']}: {row['status']} | mode={row.get('execution_type', 'evidence only')} | human review={row.get('manual_review_required', False)}")
    lines += [f"ST-AI-004 numerical outcomes: {dict(outcomes)}", "Academic approval: NOT CLAIMED", "Evidence: " + relative(destination)]
    (destination / "TERMINAL_SUMMARY.txt").write_text("\n".join(lines)+"\n", encoding="utf-8")
    print("\n".join(lines))
    return 1 if any(r["status"] == "FAIL" for r in rows) else 0


if __name__ == "__main__":
    raise SystemExit(main())
