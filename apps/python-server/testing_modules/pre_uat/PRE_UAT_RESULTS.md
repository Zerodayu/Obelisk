# OBELISK Python Pre-UAT consolidated results

Current evidence-supported status: **20 PASS, 0 FAIL, 5 BLOCKED, 1 SKIPPED; 26 unique Python-relevant IDs**. No tests or services were executed during this documentation consolidation.

| Category | Total IDs | PASS | FAIL | BLOCKED | SKIPPED |
| --- | --- | --- | --- | --- | --- |
| Unit | 11 | 11 | 0 | 0 | 0 |
| Integration | 2 | 2 | 0 | 0 | 0 |
| AI System (mocked) | 7 | 7 | 0 | 0 | 0 |
| Performance | 6 | 0 | 0 | 5 | 1 |
| Total | 26 | 20 | 0 | 5 | 1 |

The 18 deterministic PASS rows originate from `20261011T063734_111127Z`; two integration PASS rows originate from `20261011T071933_296064Z`. Five performance BLOCKED records originate from `20261011T073848_090587Z` and are supplemented by the startup-only diagnostic `20261011T075026_653371Z`. PT-008 remains SKIPPED. The passing tests were not rerun or retimestamped.

## Latest per-ID results

| ID | Category | Status | Original execution timestamp | Evidence |
| --- | --- | --- | --- | --- |
| UT-001 | Unit | PASS | 2026-10-11T06:37:35.603608+00:00 | [record](evidence/20261011T063734_111127Z/UT-001_result.txt) |
| UT-002 | Unit | PASS | 2026-10-11T06:37:35.850073+00:00 | [record](evidence/20261011T063734_111127Z/UT-002_result.txt) |
| UT-003 | Unit | PASS | 2026-10-11T06:37:36.215346+00:00 | [record](evidence/20261011T063734_111127Z/UT-003_result.txt) |
| UT-004 | Unit | PASS | 2026-10-11T06:37:37.000258+00:00 | [record](evidence/20261011T063734_111127Z/UT-004_result.txt) |
| UT-005 | Unit | PASS | 2026-10-11T06:37:49.659761+00:00 | [record](evidence/20261011T063734_111127Z/UT-005_result.txt) |
| UT-006 | Unit | PASS | 2026-10-11T06:37:49.761813+00:00 | [record](evidence/20261011T063734_111127Z/UT-006_result.txt) |
| UT-007 | Unit | PASS | 2026-10-11T06:37:49.856417+00:00 | [record](evidence/20261011T063734_111127Z/UT-007_result.txt) |
| UT-008 | Unit | PASS | 2026-10-11T06:37:49.955436+00:00 | [record](evidence/20261011T063734_111127Z/UT-008_result.txt) |
| UT-009 | Unit | PASS | 2026-10-11T06:37:50.080054+00:00 | [record](evidence/20261011T063734_111127Z/UT-009_result.txt) |
| UT-010 | Unit | PASS | 2026-10-11T06:37:50.231465+00:00 | [record](evidence/20261011T063734_111127Z/UT-010_result.txt) |
| UT-014 | Unit | PASS | 2026-10-11T06:37:50.463172+00:00 | [record](evidence/20261011T063734_111127Z/UT-014_result.txt) |
| IT-007 | Integration | PASS | 2026-10-11T07:19:37.862828+00:00 | [record](evidence/20261011T071933_296064Z/IT-007_result.txt) |
| IT-009 | Integration | PASS | 2026-10-11T07:19:39.938492+00:00 | [record](evidence/20261011T071933_296064Z/IT-009_result.txt) |
| ST-AI-001 | AI System | PASS | 2026-10-11T06:37:50.637036+00:00 | [record](evidence/20261011T063734_111127Z/ST-AI-001_result.txt) |
| ST-AI-002 | AI System | PASS | 2026-10-11T06:37:50.741729+00:00 | [record](evidence/20261011T063734_111127Z/ST-AI-002_result.txt) |
| ST-AI-003 | AI System | PASS | 2026-10-11T06:37:50.844220+00:00 | [record](evidence/20261011T063734_111127Z/ST-AI-003_result.txt) |
| ST-AI-004 | AI System | PASS | 2026-10-11T06:37:50.943553+00:00 | [record](evidence/20261011T063734_111127Z/ST-AI-004_result.txt) |
| ST-AI-005 | AI System | PASS | 2026-10-11T06:37:51.043560+00:00 | [record](evidence/20261011T063734_111127Z/ST-AI-005_result.txt) |
| ST-AI-006 | AI System | PASS | 2026-10-11T06:37:51.146554+00:00 | [record](evidence/20261011T063734_111127Z/ST-AI-006_result.txt) |
| ST-AI-007 | AI System | PASS | 2026-10-11T06:37:51.251051+00:00 | [record](evidence/20261011T063734_111127Z/ST-AI-007_result.txt) |
| PT-004 | Performance | BLOCKED | — not executed | [record](evidence/20261011T073848_090587Z/PT-004_result.txt) |
| PT-005 | Performance | BLOCKED | — not executed | [record](evidence/20261011T073848_090587Z/PT-005_result.txt) |
| PT-006 | Performance | BLOCKED | — not executed | [record](evidence/20261011T073848_090587Z/PT-006_result.txt) |
| PT-007 | Performance | BLOCKED | — not executed | [record](evidence/20261011T073848_090587Z/PT-007_result.txt) |
| PT-008 | Performance | SKIPPED | — not executed | [record](evidence/20261011T063734_111127Z/PT-008_result.txt) |
| PT-009 | Performance | BLOCKED | — not executed | [record](evidence/20261011T073848_090587Z/PT-009_result.txt) |

## Interpretation

PASS concerns automated functional assertions within the documented Python scope. An intentionally malformed job reaching failed is an expected integration success. HTTP 202 alone was never sufficient for completion. No current test ID is FAIL; historical failures remain in [TESTING_HISTORY.md](TESTING_HISTORY.md) and immutable run artifacts.

No performance workload completed or began. There are no measured PT throughput, latency, p95, queue-drain or sustained-load results. Startup timings/resource preflights and old documentary throughput figures are not benchmark results. No numeric performance SLA was established. The API's diagnostic HTTP 200 was not an ownership PASS or a performance PASS.

See [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md) for exact functions, objectives, original timestamps, limitations and links; [PRE_UAT_RESULTS.csv](PRE_UAT_RESULTS.csv) for spreadsheet import; [PRE_UAT_FINAL_SUMMARY.md](PRE_UAT_FINAL_SUMMARY.md) for submission guidance. Reproduction commands are documented in the category READMEs; do not execute them as part of this documentation-only phase.
