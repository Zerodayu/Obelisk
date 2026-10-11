"""IT-007/IT-009 only, with owned local Docker Redis or honest BLOCKED evidence."""
import ast
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
from importlib.metadata import version, PackageNotFoundError
import json
from pathlib import Path
import platform
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
HERE = ROOT/"testing_modules/pre_uat"
sys.path.insert(0,str(ROOT))
sys.dont_write_bytecode = True
from testing_modules.pre_uat.integration_environment import ACTIVE, PrerequisiteBlocked, prepare, cleanup, proof
from testing_modules.pre_uat.run_phase2a import fingerprints, Result

BASELINE = HERE/"evidence/20261011T063734_111127Z/RESULTS.json"
OBJECTIVES = {"IT-007":"Real ETL job lifecycle", "IT-009":"Concurrent job isolation"}


def blocked(environment, command, reason):
    return [{"test_id":test_id,"objective":objective,"scenario":"Owned disposable local Redis prerequisite","expected":"Verified fresh local Redis before upload/worker execution","actual":reason,"status":"BLOCKED","executed":False,"timestamp":datetime.now(timezone.utc).isoformat(),"environment":environment,"script_function":"testing_modules.integration_test.test_pre_uat_integration.IntegrationPreUAT."+("test_it007_lifecycle" if test_id=="IT-007" else "test_it009_concurrency"),"command":command,"failures":[reason]} for test_id,objective in OBJECTIVES.items()]


def report(rows, environment, command, run_dir, manifest):
    for row in rows:
        row["evidence_path"] = (run_dir/(row["test_id"]+"_result.txt")).relative_to(ROOT).as_posix()
        (ROOT/row["evidence_path"]).write_text(json.dumps(row,indent=2),encoding="utf-8")
    (run_dir/"RESULTS.json").write_text(json.dumps({"timestamp":datetime.now(timezone.utc).isoformat(),"phase":"2B-1","implemented_ids":2,"executed_ids":sum(r["executed"] for r in rows),"counts":dict(Counter(r["status"] for r in rows)),"command":command,"environment":environment,"rows":rows},indent=2),encoding="utf-8")
    (run_dir/"ISOLATION.json").write_text(json.dumps(proof(),indent=2),encoding="utf-8")
    (run_dir/"SOURCE_MANIFEST.json").write_text(json.dumps(manifest,indent=2),encoding="utf-8")
    # Phase 2A evidence is carried forward with its original execution timestamps;
    # do not count it as newly executed or rewrite its per-case evidence files.
    previous = json.loads(BASELINE.read_text(encoding="utf-8"))
    combined = [r for r in previous["rows"] if r["test_id"] not in OBJECTIVES]+rows
    (run_dir/"CONSOLIDATED_RESULTS.json").write_text(json.dumps({"phase2a_source":str(BASELINE.relative_to(ROOT)),"phase2a_carried_forward":True,"counts":dict(Counter(r["status"] for r in combined)),"rows":combined},indent=2),encoding="utf-8")
    fields = ["test_id","objective","scenario","expected","actual","status","executed","timestamp","duration_seconds","environment","script_function","command","evidence_path","failures"]
    with (HERE/"PRE_UAT_RESULTS.csv").open("w",encoding="utf-8-sig",newline="") as stream:
        writer = csv.DictWriter(stream,fieldnames=fields,extrasaction="ignore")
        writer.writeheader()
        for row in combined: writer.writerow({k:json.dumps(v) if isinstance(v,(list,dict)) else v for k,v in row.items()})
    lines = ["# OBELISK consolidated Pre-UAT results - Phase 2B-1","",f"Integration prerequisite/execution record: {run_dir.name} (UTC).","",f"This invocation executed {sum(r['executed'] for r in rows)} integration IDs. Integration statuses: {dict(Counter(r['status'] for r in rows))}.","", "Phase 2A's 18 PASS results are carried forward from evidence/20261011T063734_111127Z with their original timestamps. They were not rerun in this phase. Six performance IDs remain SKIPPED, not authorized.","", "## Reproduction","","```powershell",command,"```","", "Exit 2 = BLOCKED prerequisite/isolation; exit 1 = assertions failed; exit 0 = both integration IDs passed and cleanup succeeded.","", "## Environment","","```json",json.dumps(environment,indent=2),"```","",f"[Isolation proof](evidence/{run_dir.name}/ISOLATION.json), [source hashes](evidence/{run_dir.name}/SOURCE_MANIFEST.json), [integration results](evidence/{run_dir.name}/RESULTS.json).","","The harness uses real upload/job routers through in-process HTTP ASGI, the real Redis queue and real worker/extractor/transformer/loader. It starts two workers explicitly; it does not verify app.main startup, auth, webapp persistence or frontend behavior. No live AI or performance/stress mode exists. Only a new owned container can be targeted; the configured Redis host is never loaded.",""]
    for title,prefix in [("Unit - carried forward","UT-"),("AI System - mocked, carried forward","ST-AI-"),("Integration - this phase","IT-"),("Performance - unexecuted","PT-")]:
        lines += ["## "+title,"","| ID | Status | Execution timestamp | Evidence |","| --- | --- | --- | --- |"]
        for row in combined:
            if row["test_id"].startswith(prefix):
                target = row["evidence_path"].replace("testing_modules/pre_uat/","")
                lines.append(f"| {row['test_id']} | {row['status']} | {row['timestamp']} | [result]({target}) |")
        lines.append("")
    for row in rows:
        if row["status"] in {"BLOCKED","FAIL"}: lines += [f"**{row['test_id']} {row['status']}**: "+str(row["actual"]),""]
    lines += ["Both prepared integration cases remain NOT YET VERIFIED until real isolated execution succeeds. No service-start or HTTP 202 claim substitutes for a completed result. Prior evidence is preserved. See [INTEGRATION_README.md](INTEGRATION_README.md) for prerequisites and safety.",""]
    (HERE/"PRE_UAT_RESULTS.md").write_text("\n".join(lines),encoding="utf-8")


def main():
    if len(sys.argv)>1: raise SystemExit("This runner accepts no host, URL, port, load or provider options")
    run_dir = HERE/"evidence"/datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S_%fZ")
    run_dir.mkdir(parents=True)
    command = f"& '{sys.executable}' -B testing_modules/pre_uat/run_phase2b1.py"
    environment = {"phase":"2B-1","python":platform.python_version(),"interpreter":sys.executable,"platform":platform.platform(),"cwd":str(ROOT),"redis":"owned disposable local container required; never configured/shared Redis","gemini":"denied","database":"not used","http_transport":"in-process ASGI with real routes","upload_concurrency":3,"workers":2,"terminal_timeout_seconds":15,"performance_tests":"not run"}
    before = fingerprints()
    sources = [HERE/"integration_environment.py",HERE/"run_phase2b1.py",ROOT/"testing_modules/integration_test/test_pre_uat_integration.py"]
    try:
        for source in sources: ast.parse(source.read_text(encoding="utf-8"),filename=str(source))
        environment["packages"] = {name:version(name) for name in ["fastapi","httpx","redis","orjson","aiofiles","python-multipart","openpyxl","pydantic","google-genai"]}
        prepare(run_dir)
        from testing_modules.integration_test.test_pre_uat_integration import IntegrationPreUAT
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(IntegrationPreUAT)
        if suite.countTestCases()!=2: raise PrerequisiteBlocked("Integration discovery must contain exactly two cases")
        result = Result(environment,command,None)
        suite.run(result)
        rows = result.rows
    except (PrerequisiteBlocked,PackageNotFoundError,ImportError) as exc:
        rows = blocked(environment,command,type(exc).__name__+": "+str(exc))
    except Exception as exc:
        rows = blocked(environment,command,"Harness prerequisite failure: "+type(exc).__name__)
    finally:
        try: cleanup()
        except Exception as exc:
            ACTIVE["cleanup_error"] = type(exc).__name__+": "+str(exc)
            for row in rows:
                row["status"] = "BLOCKED"
                row["failures"].append("Owned-resource cleanup was not verified")
    after = fingerprints()
    changed = [p for p in before.keys()|after.keys() if before.get(p)!=after.get(p)]
    ACTIVE["originals_unchanged"] = not changed
    if changed or ACTIVE["network_violations"]:
        for row in rows:
            row["status"] = "BLOCKED"
            row["failures"].append("Protected-file or network-isolation violation")
    manifest = {"before":before,"after":after,"changed_protected_files":changed,"harness_sources":{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources},"ast_syntax_checked":True,"integration_assertions_executed":sum(r["executed"] for r in rows)}
    logger = ACTIVE.get("logger")
    logs = [] if logger is None else [{"event":call.args[0] if call.args else "",**{k:v for k,v in call.kwargs.items() if k in {"job_id","worker_id","error_type"}}} for call in logger.method_calls]
    (run_dir/"SANITIZED_LOGS.json").write_text(json.dumps(logs,indent=2),encoding="utf-8")
    report(rows,environment,command,run_dir,manifest)
    print("Phase 2B-1: "+json.dumps(dict(Counter(r["status"] for r in rows))))
    print("Evidence: "+str(run_dir.relative_to(ROOT)))
    return 2 if any(r["status"]=="BLOCKED" for r in rows) else 1 if any(r["status"]=="FAIL" for r in rows) else 0


if __name__=="__main__": raise SystemExit(main())
