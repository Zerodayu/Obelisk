# OBELISK Pre-UAT — safe Phase 2A execution

This package runs only deterministic Unit and mocked AI System tests. It uses real Python extractor, transformer, calculation and CQI functions in an isolated subprocess. It does not start FastAPI, workers, Redis, a database, live Gemini, integration tests or performance tests. Phase 2B needs explicit approval.

## Prerequisites

- Run from `D:\Jetbrains_IDE_Projects\pycharm\Obelisk_FINAL\apps\python-server`.
- Use PyCharm's configured Python interpreter, verified for this run as `.venv\Scripts\python.exe`, Python 3.13.0. Recheck the interpreter if the IDE configuration changes. Do not use a random system Python.
- Existing locked runtime packages must be installed (`openpyxl`, Pydantic and `google-genai`). No new dependencies were added; tests use standard-library `unittest`, `unittest.mock`, `decimal`, `csv` and `json`. Do not install packages merely to hide an application failure.
- Git and the restored `old_test/test_etl_v2.py` and `old_test/test_composite_attainment.py` must be available. Missing packages or helper sources report BLOCKED rather than fabricating a pass.
- No Redis, API key, `.env`, `.env.keys`, saved upload or real workbook is required. Do not provide credentials.

## Commands

Run the full authorized Phase 2A scope:

```powershell
& 'D:\Jetbrains_IDE_Projects\pycharm\Obelisk_FINAL\apps\python-server\.venv\Scripts\python.exe' -B testing_modules/pre_uat/run_phase2a.py
```

Reproduce a single result:

```powershell
& 'D:\Jetbrains_IDE_Projects\pycharm\Obelisk_FINAL\apps\python-server\.venv\Scripts\python.exe' -B testing_modules/pre_uat/run_phase2a.py --case UT-004
& 'D:\Jetbrains_IDE_Projects\pycharm\Obelisk_FINAL\apps\python-server\.venv\Scripts\python.exe' -B testing_modules/pre_uat/run_phase2a.py --case UT-008
& 'D:\Jetbrains_IDE_Projects\pycharm\Obelisk_FINAL\apps\python-server\.venv\Scripts\python.exe' -B testing_modules/pre_uat/run_phase2a.py --case UT-009
```

Other IDs are accepted by `--case`, including `ST-AI-004`. A single-case run marks other cases SKIPPED in that run and updates the consolidated reports. Run the full command again when you want the consolidated table to cover all 18 implemented IDs. Exit codes: `0` = executed cases passed; `1` = failed assertions (including documented defects); `2` = isolation/dependency/setup blocked. Failures are retained as FAIL; no expected-failure decorator changes their status.

Do not run these files directly or via generic IDE unittest discovery. The explicit runner must establish isolation before any application import. An attempted direct import fails the bootstrap precondition; the historical scripts are not a substitute for this runner.

## Folder layout

- `testing_modules/unit_test/test_pre_uat_unit.py`: eleven requested UT IDs, including UT-014.
- `testing_modules/ai_system_test/test_pre_uat_ai.py`: seven requested ST-AI IDs.
- `testing_modules/integration_test/`: IT-007/IT-009 prepared under the Phase 2B-1 approval; their current execution is BLOCKED by local Redis prerequisites. See INTEGRATION_README.md. `performance_test/` and `old_test/` remain preserved.
- `testing_modules/pre_uat/`: runner, offline guards, fixture/oracle/evidence helpers, audit, README, defect documentation, consolidated reports and execution evidence.

The eleven historical originals in `old_test/` now contain code. The user confirmed the earlier empty-file state came from a file-moving issue and manually restored them. It was not an application defect or evidence that tests never existed. No original was restored, edited or relocated by this task.

Fourteen selected unchanged historical methods and the configurable synthetic workbook helper are loaded into memory from the two restored allowlisted scripts. Only imports and class definitions are evaluated; no standalone runner/live script is executed. Passing assertions, exact methods, original SHA-256 hashes and before/after preservation checks are recorded in the evidence. Reused methods are constituent checks, not additional requested IDs. Unexecuted originals remain NOT YET VERIFIED.

## Isolation and fixture design

Before discovery, `isolation.py` installs a test-only configuration module and silent in-memory application logger. It clears service/provider environment variables in this process and never imports/decrypts the real environment loader. Import guards prohibit Redis queue, workers, database/models and FastAPI startup; audit hooks deny service network access, credential-file access, existing class-record/upload reads and writes outside evidence/temporary files. Gemini `Client` is denied unless explicitly replaced by the SDK mock inside a test. Synthetic key-slot strings never represent real credentials and are not written to evidence.

The guard self-tests attempted DNS/network lookup, `.env` read and queue import, verifying rejection before executing application code. The run's `ISOLATION.json` contains those probe results and unexpected violations (which must be empty). Windows asyncio requires a stdlib socketpair wakeup mechanism; the only permitted socket exception is its zero-argument internal loopback pair construction, without a caller-selected service endpoint. This does not connect to Redis or any deployment service. The first harness attempt blocked this mechanism before test-body assertions; that blocked attempt is retained separately and corrected to zero executed test IDs.

All workbooks are generated temporarily using synthetic IDs, names and instructor metadata and cleaned up by `TemporaryDirectory`. Existing worst/mixed/ideal workbooks are not read because their privacy/synthetic provenance has not been established. Workbook metadata and scores are deterministic; the 30×5 fixture applies only to UT-014. Dynamic 3/7-CLO historical checks and other student/CLO counts establish that no universal 30×5 assumption is used.

The expected-value oracle uses independent Decimal arithmetic and explicit institutional values rather than importing production formula helpers. Formula columns are intentionally spoofed. Raw cells are checked against fixture values, and all outputs are checked for direct/indirect/composite attainment, threshold, level and completeness. Test cases have a 30-second coroutine deadline; timings in these reports are execution durations, **not performance benchmarks**. The deployed server configuration is neither loaded nor tested.

## Evidence and interpretation

Every invocation creates `evidence/<UTC timestamp>/`. Per-ID `*_result.txt` files contain JSON: objective, input scenario, expected result, actual recorded observations, PASS/FAIL/SKIPPED/BLOCKED, timestamp/environment, script/function, reproduction command, file path and failure tracebacks. The run also includes `RESULTS.json`, `ISOLATION.json` and `SOURCE_MANIFEST.json`. Both executed and unexecuted IDs have honest status; the eight unauthorized Phase 2B cases are SKIPPED with `executed=false`.

`PRE_UAT_RESULTS.md` and UTF-8-with-BOM `PRE_UAT_RESULTS.csv` summarize the latest invocation. Counts refer to test IDs, not subtests. A failed subtest fails its parent ID; successful constituent checks remain visible in its observations. Historical run directories are retained, so setup failures are not hidden by later success. Source hashes allow you to distinguish older evidence from the final suite version.

Schema assertions use an independent evidence validator; its rejection of a bad response does not mean production enforces that schema. UT-008 explicitly checks the actual service's rejection behavior and passes in the final approved regression. Similarly, ST-AI-004 checks a documented numerical-claim grammar, including a deliberately incorrect response and unsupported numeric wording; it does not certify arbitrary live model claims. Educational usefulness, inferred causes and unsupported claims require MANUAL REVIEW. ST-AI-006 verifies only Python immutability/advisory behavior; approval, RBAC, persistence and curriculum registry validation require the webapp team.

See [COVERAGE_AUDIT.md](COVERAGE_AUDIT.md), [PRE_UAT_RESULTS.md](PRE_UAT_RESULTS.md), [PRE_UAT_RESULTS.csv](PRE_UAT_RESULTS.csv) and [DEFECTS.md](DEFECTS.md). The approved negative-score, AI boundary and final workbook-data corrections are implemented. Final full execution reports 18 PASS, 0 FAIL, 0 BLOCKED, eight deferred SKIPPED and exits 0. UT-004 retains invalid-input rejection assertions and has 98 passing subchecks; the extra-credit assertion was corrected by explicit approval to verify acceptance/calculations rather than rejection. The unchanged 70/30 formula and missing-data behavior are independently checked. Phase 2B remains unauthorized.

## Phase 2B-1 update

IT-007 and IT-009 now have a separate owned-container integration runner. Its prerequisite check is BLOCKED; no integration assertions executed. Consolidated reports carry forward the 18 Phase 2A PASS results and show 2 BLOCKED integration IDs plus 6 SKIPPED performance IDs. See [INTEGRATION_README.md](INTEGRATION_README.md). Re-running the Phase 2A runner replaces the consolidated summary with that invocation's scope; earlier evidence directories remain preserved.
# Phase 2B-2 controlled performance preparation

See [PERFORMANCE_README.md](PERFORMANCE_README.md) for the five fixed approved
workloads and isolated runner. Attempt `20261011T073848_090587Z` stopped before
workload execution because owned HTTP server isolation/shutdown proof was not
obtained. The five performance IDs are BLOCKED, PT-008 remains SKIPPED, and the
earlier 20 PASS results retain their original timestamps and evidence. No
performance measurements are claimed for this attempt.
