"""Only deterministic unit/mocked-AI execution; emits honest per-case evidence.

Run with PyCharm's configured interpreter: python -B testing_modules/pre_uat/run_phase2a.py
No integration, load, or live-provider mode is available in this runner.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import csv
import hashlib
import importlib
from importlib.metadata import version
import io
import json
from pathlib import Path
import platform
import subprocess
import sys
import time
import traceback
import unittest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0,str(ROOT))
from testing_modules.pre_uat.isolation import STATE, IsolationViolation, bootstrap

ALL_IDS = [f"UT-{i:03d}" for i in range(1,11)]+["UT-014"]+[f"ST-AI-{i:03d}" for i in range(1,8)]
DEFERRED = {"IT-007":"Background ETL lifecycle", "IT-009":"Concurrent job isolation", "PT-004":"Upload throughput", "PT-005":"Completion latency", "PT-006":"AI latency", "PT-007":"Sustained stability", "PT-008":"Queue saturation/recovery", "PT-009":"Analytics throughput/p95"}


def fingerprints():
    files = sorted((ROOT/"app").rglob("*.py"))+sorted((ROOT/"testing_modules/old_test").glob("*"))
    return {p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file()}


class Result(unittest.TestResult):
    def __init__(self, environment, command, selected):
        super().__init__()
        self.environment,self.command,self.selected = environment,command,selected
        self.rows = []

    def startTest(self,test):
        super().startTest(test)
        self.started = time.perf_counter()
        self.current = {**getattr(test,test._testMethodName).pre_uat,
            "status":"PASS", "executed":True, "timestamp":datetime.now(timezone.utc).isoformat(),
            "environment":self.environment,"script_function":test.id(),"command":self.command,
            "failures":[],"subchecks":[]}

    def addFailure(self,test,err):
        super().addFailure(test,err)
        self.current["status"] = "FAIL"
        self.current["failures"].append(self._exc_info_to_string(err,test))

    def addError(self,test,err):
        super().addError(test,err)
        self.current["status"] = "BLOCKED" if isinstance(err[1],(IsolationViolation,ModuleNotFoundError)) else "FAIL"
        if self.current["status"] == "BLOCKED" and not getattr(test,"observations",[]):
            self.current["executed"] = False
        self.current["failures"].append(self._exc_info_to_string(err,test))

    def addSkip(self,test,reason):
        super().addSkip(test,reason)
        self.current.update(status="SKIPPED",actual=reason,executed=False)

    def addSubTest(self,test,subtest,err):
        super().addSubTest(test,subtest,err)
        check = {"scenario":str(subtest),"status":"PASS" if err is None else "FAIL"}
        self.current["subchecks"].append(check)
        if err:
            self.current["status"] = "BLOCKED" if isinstance(err[1],IsolationViolation) else "FAIL"
            self.current["failures"].append(self._exc_info_to_string(err,test))

    def stopTest(self,test):
        self.current["duration_seconds"] = round(time.perf_counter()-self.started,6)
        self.current["actual"] = getattr(test,"observations",[])
        if not self.current["actual"] and self.current["status"] == "PASS":
            self.current.update(status="FAIL",failures=["No actual-output evidence recorded"])
        self.rows.append(self.current)
        print(self.current["test_id"]+": "+self.current["status"])
        super().stopTest(test)


def reports(rows, environment, command, run_dir, manifest):
    run_dir.mkdir(parents=True,exist_ok=True)
    for row in rows:
        path = run_dir/(row["test_id"]+"_result.txt")
        row["evidence_path"] = path.relative_to(ROOT).as_posix()
        path.write_text(json.dumps(row,indent=2,ensure_ascii=False),encoding="utf-8")
    (run_dir/"ISOLATION.json").write_text(json.dumps(STATE,indent=2),encoding="utf-8")
    (run_dir/"SOURCE_MANIFEST.json").write_text(json.dumps(manifest,indent=2),encoding="utf-8")
    counts = dict(Counter(row["status"] for row in rows))
    summary = {"timestamp":datetime.now(timezone.utc).isoformat(),"counts":counts,"implemented_ids":18,"executed_ids":sum(row["executed"] for row in rows),"environment":environment,"command":command,"rows":rows}
    (run_dir/"RESULTS.json").write_text(json.dumps(summary,indent=2,ensure_ascii=False),encoding="utf-8")
    with (HERE/"PRE_UAT_RESULTS.csv").open("w",encoding="utf-8-sig",newline="") as handle:
        fields = ["test_id","objective","scenario","expected","actual","status","executed","timestamp","duration_seconds","environment","script_function","command","evidence_path","failures"]
        writer = csv.DictWriter(handle,fieldnames=fields,extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(list,dict)) else v for k,v in row.items()})
    lines = ["# OBELISK Pre-UAT results — Phase 2A", "",f"Execution timestamp (UTC): {summary['timestamp']}","",
        "Results count requested test IDs, not individual assertions or subtests. Any failed subcheck fails its parent ID. Nothing is marked expected-failure or converted to PASS.","",
        f"Implemented: 18 Unit/AI test IDs. Executed in this run: {summary['executed_ids']}. Status counts: `{json.dumps(counts,sort_keys=True)}`.","",
        "## Environment and isolation","", "```json",json.dumps(environment,indent=2),"```","",
        "Configuration/environment loading and application logging are replaced only in the test process. Real extractor/transformer/calculation/CQI code runs; service sockets, credential files, Redis/worker imports, and existing workbook data are blocked. Windows asyncio uses the stdlib socketpair internally; only that trusted zero-argument loopback wakeup pipe is permitted. Gemini's Client is denied by default and explicitly mocked for provider-failure cases. No server, database, Redis, live Gemini or stress test was run.","",
        f"Isolation proof: [{run_dir.name}/ISOLATION.json](evidence/{run_dir.name}/ISOLATION.json). Source hashes, original-file preservation and reused-method provenance: [SOURCE_MANIFEST.json](evidence/{run_dir.name}/SOURCE_MANIFEST.json).","",
        "## Reproduction","","From `apps/python-server`, using PyCharm's configured interpreter:","","```powershell",command,"```","",
        "Exit code 1 means an assertion failure, 2 means isolation/setup is blocked. The runner still saves evidence. Per-run directories are retained; consolidated files refer to the latest invocation. `--case UT-005` selects a single case and marks other cases SKIPPED for that run.","",
        "## Existing-test reuse","",
        "All eleven originals in `old_test/` now contain restored code. Fourteen unchanged synthetic/calculation methods and the workbook helper from two allowlisted restored scripts are evaluated in memory. No original script is modified or run as a standalone program. Exact methods and original-file hashes are in the source manifest.","",
        "## Approved production corrections","",
        "`transformer.py` rejects negative non-null v2 period scores with TransformationError containing only field/value. `cqi_recommender.py` checks nonempty boundary text and validates the course JSON fields/types, allowed recipients and exact schema keys, preserving fenced JSON, nullable pattern, single recommendations and the string response. `institutional_summary.py` uses the nonempty text check without imposing JSON on prose. Shared provider/failover, formulas, settings and deployment configuration are unchanged.","",
        "The final UT-004 correction adds strict score/rating cell parsing and collision checks in `extractor.py`, with identity-free WorkbookValidationError in `exceptions.py`. Invalid nonblank text, Excel errors, booleans and nonfinite values are rejected; blanks, zero and numeric strings are preserved. Repeated IDs/CLO codes are rejected within each worksheet and ambiguous name fallback is rejected before dictionaries overwrite data. Metadata parsing is unchanged. The former above-maximum rejection assertion was corrected by explicit approval: extra credit is accepted and independently calculated, including direct attainment above 100%.","",
    ]
    for title,prefix in [("Unit","UT-"),("AI System","ST-AI-"),("Integration — Phase 2B","IT-"),("Performance — Phase 2B","PT-")]:
        lines += ["## "+title,"","| Test ID | Objective | Status | Evidence |","| --- | --- | --- | --- |"]
        for row in rows:
            if row["test_id"].startswith(prefix):
                lines.append(f"| {row['test_id']} | {row['objective']} | {row['status']} | [result](evidence/{run_dir.name}/{row['test_id']}_result.txt) |")
        lines.append("")
    lines += ["## Failures and limitations",""]
    for row in rows:
        if row["status"] in {"FAIL","BLOCKED"}:
            # Full traceback and numerical actual results are in each linked evidence file.
            lines += [f"- **{row['test_id']} — {row['status']}**: {row['failures'][0].splitlines()[-1] if row['failures'] else row.get('actual')}"]
    lines += ["","UT-003 verifies required sheets and marker fields. Current SETUP metadata is intentionally optional; any different required-header policy needs clarification. UT-004 does not establish that IDs/CLOs are registered in the webapp; those checks are EXTERNAL.","",
        "ST-AI-004 verifies 12 numerical fields in controlled response sentences against independently checked ETL data, detects an intentionally wrong claim and flags unsupported numeric wording for manual review. This verifies the evidence checker and deterministic data flow; live model truthfulness remains unverified. All educational usefulness, inferred causes and arbitrary free-text numerical claims need human review.","",
        "ST-AI-006 verifies Python input immutability and advisory prompt rules. It does not verify webapp approval/RBAC/persistence, and it does not certify the safety or quality of provider wording. The mock malicious advice is returned as text without executing an action; semantic advice review remains required.","",
        "The eight integration/performance cases are SKIPPED because Phase 2B is not authorized. Live Gemini is unexecuted. Only approved validation corrections were made; no dependencies, original tests or deployment settings changed. Prior failed-run evidence remains in its timestamped directory. Valid zero/blanks, numeric strings, optional IDs and unambiguous name fallback are exercised alongside structured invalid-input rejection. Extra credit acceptance corrects the test policy; it does not fix an application defect. See REGRESSION_NOTES.md for exact changes and compatibility limits.","",
        "See [README.md](README.md) for safe execution, [COVERAGE_AUDIT.md](COVERAGE_AUDIT.md) for historical/current coverage, and [DEFECTS.md](DEFECTS.md) for scoped reproduction instructions.",""]
    (HERE/"PRE_UAT_RESULTS.md").write_text("\n".join(lines),encoding="utf-8")
    print("Report counts: "+json.dumps(counts,sort_keys=True))
    print("Evidence: "+str(run_dir.relative_to(ROOT)))


def main():
    parser = argparse.ArgumentParser(description="Offline Phase 2A unit and mocked AI tests only")
    parser.add_argument("--case",choices=ALL_IDS,help="Run one requested test ID")
    args = parser.parse_args()
    command = f"& '{sys.executable}' -B testing_modules/pre_uat/run_phase2a.py"+(" --case "+args.case if args.case else "")
    environment = {"python":platform.python_version(),"interpreter":sys.executable,"platform":platform.platform(),"cwd":str(ROOT),"phase":"2A","network":"denied","provider":"mocked offline-test-model","database":"not used","redis":"not used","workers":"not started","synthetic_data":True}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S_%fZ")
    run_dir = HERE/"evidence"/stamp
    before = fingerprints()
    try:
        bootstrap()
        from testing_modules.pre_uat.support import REUSED, REVISION
        environment["packages"] = {name:version(name) for name in ["openpyxl","pydantic","google-genai"]}
        environment["case_timeout_seconds"] = 30
        environment["git_head"] = subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()
        suite = unittest.TestSuite()
        for module_name in ["testing_modules.unit_test.test_pre_uat_unit","testing_modules.ai_system_test.test_pre_uat_ai"]:
            loaded = unittest.defaultTestLoader.loadTestsFromModule(importlib.import_module(module_name))
            for group in loaded:
                for test in group:
                    metadata = getattr(getattr(test,test._testMethodName),"pre_uat",None)
                    if metadata and (not args.case or metadata["test_id"]==args.case): suite.addTest(test)
        expected_count = 1 if args.case else 18
        if suite.countTestCases()!=expected_count:
            raise IsolationViolation("Unexpected test discovery count; refusing empty/incomplete PASS")
        result = Result(environment,command,args.case)
        suite.run(result)
        rows = result.rows
        after = fingerprints()
        changed = [name for name in before.keys()|after.keys() if before.get(name)!=after.get(name)]
        STATE["originals_unchanged"] = not changed
        if changed or STATE["violations"]:
            for row in rows:
                row["status"] = "BLOCKED"
                row["failures"].append("Isolation violation or protected file modification detected")
        manifest = {"before":before,"after":after,"changed_protected_files":changed,"historical_revision":REVISION,"reused_methods":REUSED,
            "suite_sources":{p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for folder in [HERE,ROOT/"testing_modules/unit_test",ROOT/"testing_modules/ai_system_test"] for p in folder.glob("*.py")}}
    except Exception as exc:
        STATE["verified"] = False
        rows = [{"test_id":test_id,"objective":"Phase 2A prerequisite isolation", "scenario":"Bootstrap/discovery prerequisite", "expected":"Verified safe isolation and complete discovery", "actual":type(exc).__name__+": "+str(exc),"status":"BLOCKED","executed":False,"timestamp":datetime.now(timezone.utc).isoformat(),"environment":environment,"script_function":"run_phase2a.main","command":command,"failures":[traceback.format_exc()]} for test_id in ALL_IDS if not args.case or test_id==args.case]
        manifest = {"before":before,"bootstrap_error":type(exc).__name__}
    present = {row["test_id"] for row in rows}
    for test_id in ALL_IDS+list(DEFERRED):
        if test_id not in present:
            rows.append({"test_id":test_id,"objective":DEFERRED.get(test_id,"Phase 2A case not selected"),"scenario":"Outside selected run scope","expected":"Explicit approval/selection before execution","actual":"Phase 2B not authorized" if test_id in DEFERRED else "Not selected by --case","status":"SKIPPED","executed":False,"timestamp":datetime.now(timezone.utc).isoformat(),"environment":environment,"script_function":"not executed","command":"not authorized" if test_id in DEFERRED else command+" (not selected)","failures":[]})
    reports(rows,environment,command,run_dir,manifest)
    return 2 if any(row["status"]=="BLOCKED" for row in rows) else 1 if any(row["status"]=="FAIL" for row in rows) else 0


if __name__=="__main__":
    raise SystemExit(main())
