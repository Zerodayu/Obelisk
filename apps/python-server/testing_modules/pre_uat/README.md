# OBELISK Python Pre-UAT evidence package

Current usage: [documentation index](../../documentations/README.md) and [testing guide](../../documentations/TESTING.md). The results below are historical institutional evidence, separate from later legacy and AI accuracy runs.

Team **4th Dimension** · target submission **October 13, 2026** · Python ETL/analytics service.

Current evidence-supported status: **20 PASS, 0 FAIL, 5 BLOCKED, 1 SKIPPED; 26 unique Python-relevant IDs**. No tests or services were executed during this documentation consolidation.

Start with [PRE_UAT_FINAL_SUMMARY.md](PRE_UAT_FINAL_SUMMARY.md), [PRE_UAT_RESULTS.md](PRE_UAT_RESULTS.md) / [CSV](PRE_UAT_RESULTS.csv), and [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md). [TESTING_HISTORY.md](TESTING_HISTORY.md) preserves every saved run's meaning. [COVERAGE_AUDIT.md](COVERAGE_AUDIT.md), [DEFECTS.md](DEFECTS.md) and [REGRESSION_NOTES.md](REGRESSION_NOTES.md) distinguish historical gaps, corrected defects and remaining limitations. [DOCUMENTATION_AUDIT.md](DOCUMENTATION_AUDIT.md) records consolidation checks and preserved snapshots.

## Scope and ownership

Python parsing, independent attainment calculations, deterministic mocked-AI behavior and isolated Redis job correctness were tested. Python is a pure-compute service; this package does not verify application-database persistence, backend/frontend workflows, RBAC, approvals, institutional sign-off or entire-webapp readiness. Refer to current [formula documentation](../../documentations/FORMULAS.md) and [integration contract](../../documentations/INTEGRATION.md); do not infer current implementation from a stale agent-guide description.

All fixtures were generated temporarily with synthetic identities/metadata; saved class-record templates/uploads were not used. The 30x5 count applies only to its designated fixture. Gemini was mocked or denied; no live keys/services, production database or shared Redis were used. Original `old_test/` scripts were restored manually by the user after a file-moving problem and were never modified by this testing work. Selected unchanged synthetic assertions were reused; historical source presence is not evidence of PASS.

## Running or reproducing tests

Current operating instructions are consolidated in the [testing guide](../../documentations/TESTING.md). It explains Python/uv commands, runner selection, isolation, exit codes and the separate-copy requirement for runners that replace consolidated submission reports. For the distinct 150-case real-model benchmark, use the [AI accuracy guide](../../documentations/AI_ACCURACY_EVALUATION.md).

This README describes the saved October 11 institutional package. Fixture, source-hash and original-test statements below refer to those executions, before later legacy repairs. Historical performance pauses and prior authorizations are not instructions to run current services. Do not rerun report-writing harnesses in this preserved package simply to read the evidence.

## Evidence and interpretation

UTC timestamped directories contain original objective/scenario, expected/actual, status, environment, exact function, command and failure details. Source/compatibility manifests establish source provenance; they do not prove unexecuted behavior. The final deterministic run has 18 PASS; integration adds two PASS. Five performance IDs are BLOCKED and PT-008 deliberately SKIPPED. Startup-only HTTP 200 is not ownership verification or performance success.

UT-004 has 98 passing subchecks; all preceding 17 passing IDs retain matching observations in the compatibility comparison. Extra credit is existing implementation compatibility, not independently verified grading policy. ST-AI-004 machine-checks the supported claim grammar only; unsupported numbers, causal explanations and educational quality require manual review. ST-AI-006 checks Python advisory behavior; backend approval enforcement remains external.

## Documentation validation

Use the [testing guide](../../documentations/TESTING.md) for the read-only `documentation_validation.py --check` command and its limitations. `--consolidate` regenerates saved submission documentation and is not needed for normal test execution. The [prior documentation audit](DOCUMENTATION_AUDIT.md) preserves its original validation record.
