# OBELISK Pre-UAT results — Phase 2A

Execution timestamp (UTC): 2026-10-11T08:54:56.015547+00:00

Results count requested test IDs, not individual assertions or subtests. Any failed subcheck fails its parent ID. Nothing is marked expected-failure or converted to PASS.

Implemented: 18 Unit/AI test IDs. Executed in this run: 18. Status counts: `{"PASS": 18, "SKIPPED": 8}`.

## Environment and isolation

```json
{
  "python": "3.13.0",
  "interpreter": "D:\\Jetbrains_IDE_Projects\\pycharm\\Obelisk_FINAL\\apps\\python-server\\.venv\\Scripts\\python.exe",
  "platform": "Windows-11-10.0.26200-SP0",
  "cwd": "D:\\Jetbrains_IDE_Projects\\pycharm\\Obelisk_FINAL\\apps\\python-server",
  "phase": "2A",
  "network": "denied",
  "provider": "mocked offline-test-model",
  "database": "not used",
  "redis": "not used",
  "workers": "not started",
  "synthetic_data": true,
  "packages": {
    "openpyxl": "3.1.5",
    "pydantic": "2.13.4",
    "google-genai": "2.25.0"
  },
  "case_timeout_seconds": 30,
  "git_head": "04c8a22f6e9ed5394784bae023c6ecb0bb6801d0"
}
```

Configuration/environment loading and application logging are replaced only in the test process. Real extractor/transformer/calculation/CQI code runs; service sockets, credential files, Redis/worker imports, and existing workbook data are blocked. Windows asyncio uses the stdlib socketpair internally; only that trusted zero-argument loopback wakeup pipe is permitted. Gemini's Client is denied by default and explicitly mocked for provider-failure cases. No server, database, Redis, live Gemini or stress test was run.

Isolation proof: [20261011T085439_489884Z/ISOLATION.json](evidence/20261011T085439_489884Z/ISOLATION.json). Source hashes, original-file preservation and reused-method provenance: [SOURCE_MANIFEST.json](evidence/20261011T085439_489884Z/SOURCE_MANIFEST.json).

## Reproduction

From `apps/python-server`, using PyCharm's configured interpreter:

```powershell
& 'D:\Jetbrains_IDE_Projects\pycharm\Obelisk_FINAL\apps\python-server\.venv\Scripts\python.exe' -B testing_modules/pre_uat/run_phase2a.py
```

Exit code 1 means an assertion failure, 2 means isolation/setup is blocked. The runner still saves evidence. Per-run directories are retained; consolidated files refer to the latest invocation. `--case UT-005` selects a single case and marks other cases SKIPPED for that run.

## Existing-test reuse

All eleven originals in `old_test/` now contain restored code. Fourteen unchanged synthetic/calculation methods and the workbook helper from two allowlisted restored scripts are evaluated in memory. No original script is modified or run as a standalone program. Exact methods and original-file hashes are in the source manifest.

## Approved production corrections

`transformer.py` rejects negative non-null v2 period scores with TransformationError containing only field/value. `cqi_recommender.py` checks nonempty boundary text and validates the course JSON fields/types, allowed recipients and exact schema keys, preserving fenced JSON, nullable pattern, single recommendations and the string response. `institutional_summary.py` uses the nonempty text check without imposing JSON on prose. Shared provider/failover, formulas, settings and deployment configuration are unchanged.

The final UT-004 correction adds strict score/rating cell parsing and collision checks in `extractor.py`, with identity-free WorkbookValidationError in `exceptions.py`. Invalid nonblank text, Excel errors, booleans and nonfinite values are rejected; blanks, zero and numeric strings are preserved. Repeated IDs/CLO codes are rejected within each worksheet and ambiguous name fallback is rejected before dictionaries overwrite data. Metadata parsing is unchanged. The former above-maximum rejection assertion was corrected by explicit approval: extra credit is accepted and independently calculated, including direct attainment above 100%.

## Unit

| Test ID | Objective | Status | Evidence |
| --- | --- | --- | --- |
| UT-001 | Parse valid Excel class record | PASS | [result](evidence/20261011T085439_489884Z/UT-001_result.txt) |
| UT-002 | Reject corrupted/unsupported workbook | PASS | [result](evidence/20261011T085439_489884Z/UT-002_result.txt) |
| UT-003 | Reject missing required workbook fields | PASS | [result](evidence/20261011T085439_489884Z/UT-003_result.txt) |
| UT-004 | Validate scores/IDs/CLO values while preserving extra credit | PASS | [result](evidence/20261011T085439_489884Z/UT-004_result.txt) |
| UT-005 | Independently verify 70/30 composite calculation | PASS | [result](evidence/20261011T085439_489884Z/UT-005_result.txt) |
| UT-006 | Exactly 70% attainment boundary | PASS | [result](evidence/20261011T085439_489884Z/UT-006_result.txt) |
| UT-007 | Numerical CLO data prepared for AI | PASS | [result](evidence/20261011T085439_489884Z/UT-007_result.txt) |
| UT-008 | Validate AI recommendation response schema | PASS | [result](evidence/20261011T085439_489884Z/UT-008_result.txt) |
| UT-009 | Handle invalid/unavailable AI responses | PASS | [result](evidence/20261011T085439_489884Z/UT-009_result.txt) |
| UT-010 | Independent full-record calculation oracle | PASS | [result](evidence/20261011T085439_489884Z/UT-010_result.txt) |
| UT-014 | 150 unique student-CLO records | PASS | [result](evidence/20261011T085439_489884Z/UT-014_result.txt) |

## AI System

| Test ID | Objective | Status | Evidence |
| --- | --- | --- | --- |
| ST-AI-001 | Worst-case attainment dataset | PASS | [result](evidence/20261011T085439_489884Z/ST-AI-001_result.txt) |
| ST-AI-002 | Mixed attainment dataset | PASS | [result](evidence/20261011T085439_489884Z/ST-AI-002_result.txt) |
| ST-AI-003 | Ideal attainment dataset | PASS | [result](evidence/20261011T085439_489884Z/ST-AI-003_result.txt) |
| ST-AI-004 | Numerical grounding against actual ETL | PASS | [result](evidence/20261011T085439_489884Z/ST-AI-004_result.txt) |
| ST-AI-005 | AI unavailable or rate-limited | PASS | [result](evidence/20261011T085439_489884Z/ST-AI-005_result.txt) |
| ST-AI-006 | CQI recommendations remain advisory | PASS | [result](evidence/20261011T085439_489884Z/ST-AI-006_result.txt) |
| ST-AI-007 | Truly zero attainment gaps | PASS | [result](evidence/20261011T085439_489884Z/ST-AI-007_result.txt) |

## Integration — Phase 2B

| Test ID | Objective | Status | Evidence |
| --- | --- | --- | --- |
| IT-007 | Background ETL lifecycle | SKIPPED | [result](evidence/20261011T085439_489884Z/IT-007_result.txt) |
| IT-009 | Concurrent job isolation | SKIPPED | [result](evidence/20261011T085439_489884Z/IT-009_result.txt) |

## Performance — Phase 2B

| Test ID | Objective | Status | Evidence |
| --- | --- | --- | --- |
| PT-004 | Upload throughput | SKIPPED | [result](evidence/20261011T085439_489884Z/PT-004_result.txt) |
| PT-005 | Completion latency | SKIPPED | [result](evidence/20261011T085439_489884Z/PT-005_result.txt) |
| PT-006 | AI latency | SKIPPED | [result](evidence/20261011T085439_489884Z/PT-006_result.txt) |
| PT-007 | Sustained stability | SKIPPED | [result](evidence/20261011T085439_489884Z/PT-007_result.txt) |
| PT-008 | Queue saturation/recovery | SKIPPED | [result](evidence/20261011T085439_489884Z/PT-008_result.txt) |
| PT-009 | Analytics throughput/p95 | SKIPPED | [result](evidence/20261011T085439_489884Z/PT-009_result.txt) |

## Failures and limitations


UT-003 verifies required sheets and marker fields. Current SETUP metadata is intentionally optional; any different required-header policy needs clarification. UT-004 does not establish that IDs/CLOs are registered in the webapp; those checks are EXTERNAL.

ST-AI-004 verifies 12 numerical fields in controlled response sentences against independently checked ETL data, detects an intentionally wrong claim and flags unsupported numeric wording for manual review. This verifies the evidence checker and deterministic data flow; live model truthfulness remains unverified. All educational usefulness, inferred causes and arbitrary free-text numerical claims need human review.

ST-AI-006 verifies Python input immutability and advisory prompt rules. It does not verify webapp approval/RBAC/persistence, and it does not certify the safety or quality of provider wording. The mock malicious advice is returned as text without executing an action; semantic advice review remains required.

The eight integration/performance cases are SKIPPED because Phase 2B is not authorized. Live Gemini is unexecuted. Only approved validation corrections were made; no dependencies, original tests or deployment settings changed. Prior failed-run evidence remains in its timestamped directory. Valid zero/blanks, numeric strings, optional IDs and unambiguous name fallback are exercised alongside structured invalid-input rejection. Extra credit acceptance corrects the test policy; it does not fix an application defect. See REGRESSION_NOTES.md for exact changes and compatibility limits.

See [README.md](README.md) for safe execution, [COVERAGE_AUDIT.md](COVERAGE_AUDIT.md) for historical/current coverage, and [DEFECTS.md](DEFECTS.md) for scoped reproduction instructions.
