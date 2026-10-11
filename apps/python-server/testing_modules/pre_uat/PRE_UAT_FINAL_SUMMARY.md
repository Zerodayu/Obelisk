# OBELISK — Python Pre-UAT submission summary

**Project:** Outcomes-Based Educational Learning and Intelligent System Kit (OBELISK)  
**Team:** 4th Dimension  
**Submission target:** October 13, 2026  
**Scope:** Python spreadsheet ETL, attainment analytics, mocked AI service behavior and isolated Redis job processing. This is component evidence, not whole-webapp acceptance.

## Executive summary

Twenty executed Python-side test IDs passed. Approved validation corrections resolved the observed unit/AI failures without changing the tested 70/30 formula, thresholds or valid outputs. Two integration IDs verified real job processing and concurrent isolation. Performance workloads remain unexecuted: five IDs are BLOCKED by harness ownership verification and queue saturation is SKIPPED. Historical evidence and original successful execution timestamps are preserved.

## Final status

| Category | Total IDs | PASS | FAIL | BLOCKED | SKIPPED |
| --- | --- | --- | --- | --- | --- |
| Unit | 11 | 11 | 0 | 0 | 0 |
| Integration | 2 | 2 | 0 | 0 | 0 |
| AI System (mocked) | 7 | 7 | 0 | 0 | 0 |
| Performance | 6 | 0 | 0 | 5 | 1 |
| Total | 26 | 20 | 0 | 5 | 1 |

PASS is supported by saved assertions; BLOCKED/SKIPPED are not performance successes. No current ID is FAIL. Detailed one-row-per-ID results are in [PRE_UAT_RESULTS.md](PRE_UAT_RESULTS.md), [CSV](PRE_UAT_RESULTS.csv), and [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md).

## Testing chronology

Phase 1 audited source and historical coverage without test execution. Temporary zero-byte originals were traced to the user's file-moving/restoration issue; it was not an application defect. Historical assertions had no attributable passing evidence then.

Phase 2A progressed from 15 PASS/3 FAIL/8 SKIPPED, through 17 PASS/1 FAIL/8 SKIPPED, to 18 PASS/0 FAIL/8 SKIPPED. UT-004/008/009 corrective work and the approved extra-credit expectation correction produced the final deterministic evidence. UT-004 has 98 passing subchecks; 14 selected unchanged historical methods were reused as constituent assertions.

Phase 2B-1 initially blocked on Docker and the exact cached Redis image. Once available, IT-007 and IT-009 passed. Five jobs were accepted: four completed and one deliberately malformed job reached failed, as expected. Three concurrent distinct scenarios produced isolated 4/9/8-record results. Acceptance 202 and terminal completion were verified separately.

Phase 2B-2 began with a read-only workload audit; five prepared workloads never executed. Startup cleanup/error-reporting defects were corrected in the harness. A temporary-directory audit-hook deadlock hazard was addressed; the latest startup-only attempt reached HTTP 200 but failed exact launcher/server PID ownership. Graceful shutdown remains unverified; owned-resource forced cleanup is recorded. The intentional failure-path diagnostic was not executed. [Complete run history](TESTING_HISTORY.md) includes all 13 saved directories.

## Defects and corrective actions

Workbook validation now rejects negative scores, malformed nonblank numeric cells, within-sheet duplicate IDs/CLOs and ambiguous fallback using structured errors. Course recommendations validate successful JSON and preserve the compatible string/fenced/single-item/nullable-pattern behavior. Both AI boundaries reject blank/non-string text; institutional prose remains supported. [DEFECTS.md](DEFECTS.md) distinguishes corrected application defects from harness defects and policy clarification.

Above-maximum acceptance was already extra-credit implementation behavior; its rejection expectation was corrected. This package does not independently establish institutional extra-credit policy. No schema/database, Redis worker defaults, formula or Gemini settings were changed to obtain these results.

## Verified regression and integration evidence

[Final deterministic results](evidence/20261011T063734_111127Z/RESULTS.json) and [compatibility comparison](evidence/20261011T063734_111127Z/COMPATIBILITY.json) establish 18 PASS and unchanged observations for the preceding 17 passing IDs. The 70% boundary, independent numerical calculations, record uniqueness, missing-data and AI input/error behavior are checked with synthetic fixtures. Compatibility does not extend to every real workbook layout.

[Integration assertions](evidence/20261011T071933_296064Z/RESULTS.json) and [job/cleanup summary](evidence/20261011T071933_296064Z/EXECUTION_SUMMARY.json) support two PASS IDs using real queue/worker/ETL through ASGI. Docker 29.7.2 and a fresh Redis 7.4.11 instance were isolated on loopback with persistence disabled. Tests used two explicit workers and smaller correctness limits; deployment startup/auth/performance were not verified. No application database was used.

## Performance preparation and current blocker

PT-004/005/006/007/009 are prepared and BLOCKED; PT-008 is deliberately SKIPPED. No throughput, latency/p95, sustained-load, saturation or recovery measurements exist for these IDs. Historical documentary figures are not current benchmarks or acceptance thresholds. PT-006 would measure mocked Python AI-path overhead only, not live Gemini latency.

[Startup-only result](evidence/20261011T075026_653371Z/DIAGNOSTIC_RESULTS.json) documents HTTP ownership mismatch. [Startup notes](STARTUP_DIAGNOSTIC_NOTES.md) explain the remaining launcher/server PID issue, missing graceful worker-stop proof and proposed ownership-preserving correction. Debugging and test execution are paused. No performance readiness claim is made.

## Remaining limitations and risks

- Synthetic-only workbook coverage; no claim about all real instructor records, every template layout or production environment.
- Mocked Gemini only. Live provider latency, quotas and generated recommendation quality require separately approved evidence and human review.
- AI numbers outside the checker grammar are flagged for manual review; Python advisory behavior does not prove backend approval enforcement.
- Production deployment startup/middleware, auth/security, persistence, frontend rendering and end-to-end webapp behavior are not covered here.
- Performance targets are undocumented; benchmark execution and acceptance decisions remain outstanding. Queue saturation and potential multi-process capacity races are unverified.
- Retained Redis job records/uploads and logging/resource overhead require future operational assessment. No production capacity or readiness is certified.

## Evidence index

| Evidence | Relative path |
| --- | --- |
| Every Python-relevant ID, exact function/status/timestamp/limitations | [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md) |
| All runs and historical failures/blockers | [TESTING_HISTORY.md](TESTING_HISTORY.md) |
| Final unit/mocked-AI run | [20261011T063734_111127Z](evidence/20261011T063734_111127Z/RESULTS.json) |
| Successful integration run | [20261011T071933_296064Z](evidence/20261011T071933_296064Z/RESULTS.json) |
| Initial blocked performance prerequisite run | [20261011T073848_090587Z](evidence/20261011T073848_090587Z/RESULTS.json) |
| Latest startup-only diagnostic | [20261011T075026_653371Z](evidence/20261011T075026_653371Z/DIAGNOSTIC_RESULTS.json) |
| Document/evidence integrity and link checks | [DOCUMENTATION_AUDIT.md](DOCUMENTATION_AUDIT.md) |

## Institutional submission mapping and teammate deliverables

Use the 11 UT IDs for Python unit evidence, two IT IDs for isolated Python integration, and seven ST-AI IDs for mocked AI/system-related behavior. Submit the six PT IDs explicitly as five BLOCKED/one SKIPPED; do not present startup observations as performance results. The actual institutional form/template and numeric acceptance criteria were not supplied for independent verification, so this package is an evidence mapping aid rather than a completed institutional approval.

Backend/frontend teammates must supply authenticated upload UX, RBAC, approval/rejection/audit workflows, database persistence/linkage, report/export and end-to-end integration evidence. Reviewers/instructors must supply actual review/sign-off and consultant approval if required by the official form. Human AI evaluation, privacy-safe screenshots, deployment details, agreed performance targets and completed performance evidence remain separate deliverables; none is inferred here. IoT tests are not applicable to this Python compute service, subject to confirmation against the full project scope; this does not reclassify any of the 26 IDs.

## Readiness statement

The executed Python-side unit, mocked-AI and isolated integration tests passed within their documented scope. Performance execution remains incomplete. This package supports a qualified component-level Pre-UAT submission with disclosed blockers; it does not establish whole-OBELISK webapp acceptance, production readiness, consultant approval or instructor sign-off.
