# OBELISK Python Pre-UAT evidence package

Team **4th Dimension** · target submission **October 13, 2026** · Python ETL/analytics service.

Current evidence-supported status: **20 PASS, 0 FAIL, 5 BLOCKED, 1 SKIPPED; 26 unique Python-relevant IDs**. No tests or services were executed during this documentation consolidation.

Start with [PRE_UAT_FINAL_SUMMARY.md](PRE_UAT_FINAL_SUMMARY.md), [PRE_UAT_RESULTS.md](PRE_UAT_RESULTS.md) / [CSV](PRE_UAT_RESULTS.csv), and [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md). [TESTING_HISTORY.md](TESTING_HISTORY.md) preserves every saved run's meaning. [COVERAGE_AUDIT.md](COVERAGE_AUDIT.md), [DEFECTS.md](DEFECTS.md) and [REGRESSION_NOTES.md](REGRESSION_NOTES.md) distinguish historical gaps, corrected defects and remaining limitations. [DOCUMENTATION_AUDIT.md](DOCUMENTATION_AUDIT.md) records consolidation checks and preserved snapshots.

## Scope and ownership

Python parsing, independent attainment calculations, deterministic mocked-AI behavior and isolated Redis job correctness were tested. Python is a pure-compute service; this package does not verify application-database persistence, backend/frontend workflows, RBAC, approvals, institutional sign-off or entire-webapp readiness. Refer to current [formula documentation](../../documentations/FORMULAS.md) and [integration contract](../../documentations/INTEGRATION.md); do not infer current implementation from a stale agent-guide description.

All fixtures were generated temporarily with synthetic identities/metadata; saved class-record templates/uploads were not used. The 30x5 count applies only to its designated fixture. Gemini was mocked or denied; no live keys/services, production database or shared Redis were used. Original `old_test/` scripts were restored manually by the user after a file-moving problem and were never modified by this testing work. Selected unchanged synthetic assertions were reused; historical source presence is not evidence of PASS.

## Safe reproduction references — not commands for this documentation phase

Run from `apps/python-server` with PyCharm's configured SDK (recorded Python 3.13.0). Existing locked runtime packages plus httpx/Uvicorn are prerequisites where relevant; no dependencies were introduced. Recheck the SDK before any future Python command. The current phase permits documentation validation only; new service/test execution needs separate authorization.

```powershell
# Deterministic unit and mocked-AI suite; no Redis or live provider
& '.\.venv\Scripts\python.exe' -B testing_modules/pre_uat/run_phase2a.py

# Isolated integration correctness; cached image/local engine required
& '.\.venv\Scripts\python.exe' -B testing_modules/pre_uat/run_phase2b1.py
```

Use `--case UT-004`, `--case UT-008` or `--case UT-009` only for an authorized focused deterministic run. That run will mark other IDs SKIPPED and replace the mutable consolidated reports for its scope. All older timestamped evidence remains. Preserve this submission package before any future rerun; the immutable evidence, not a runner's latest mutable CSV, determines history.

Never run test modules by direct/generic discovery: guards must precede application imports. No configured/shared service is a fallback. [INTEGRATION_README.md](INTEGRATION_README.md) documents successful isolated correctness and cleanup. [PERFORMANCE_README.md](PERFORMANCE_README.md) and [STARTUP_DIAGNOSTIC_NOTES.md](STARTUP_DIAGNOSTIC_NOTES.md) explain why no benchmark result exists and further debugging is paused.

## Evidence and interpretation

UTC timestamped directories contain original objective/scenario, expected/actual, status, environment, exact function, command and failure details. Source/compatibility manifests establish source provenance; they do not prove unexecuted behavior. The final deterministic run has 18 PASS; integration adds two PASS. Five performance IDs are BLOCKED and PT-008 deliberately SKIPPED. Startup-only HTTP 200 is not ownership verification or performance success.

UT-004 has 98 passing subchecks; all preceding 17 passing IDs retain matching observations in the compatibility comparison. Extra credit is existing implementation compatibility, not independently verified grading policy. ST-AI-004 machine-checks the supported claim grammar only; unsupported numbers, causal explanations and educational quality require manual review. ST-AI-006 checks Python advisory behavior; backend approval enforcement remains external.

## Documentation validation only

```powershell
& '.\.venv\Scripts\python.exe' -B testing_modules/pre_uat/documentation_validation.py --check
```

This standard-library validator reads saved JSON/CSV/Markdown/source files; it does not import application modules, run tests or contact services. Its `--consolidate` option regenerates documentation from saved records and is a documentation mutation, not test execution. [Documentation quality record](DOCUMENTATION_AUDIT.md) lists the current check outcome.
