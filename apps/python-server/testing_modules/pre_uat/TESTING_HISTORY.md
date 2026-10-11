# Chronological testing history — historical, not current statuses

Current consolidated status is 20 PASS, 0 FAIL, 5 BLOCKED and 1 SKIPPED. All directory labels below are original UTC run identifiers. Historical PASS/FAIL/BLOCKED counts refer to that run's scope, not the latest consolidated package.

## Phase 1: source audit, no execution

The first audit inspected repository structure, workbook/constants/formula contracts, historical test source and available fixtures. No passing execution evidence was available, so no ID qualified as EXISTING VERIFIED. Coverage was partial, not yet verified or missing; curriculum registry, persistence, auth/approval and UI responsibilities were external.

Eleven relocated `old_test/` files temporarily had zero bytes. The user confirmed a manual file-moving problem and restored their contents. This was neither an application defect nor evidence that historical tests had never existed. Committed source was inspected without restoring originals. Once restored, selected unchanged synthetic methods were reused safely; filenames alone were never treated as passing evidence. The initial audit prose and all intervening document versions are retained verbatim as [documentation snapshots](DOCUMENTATION_AUDIT.md).

## All saved runs

| UTC directory | Historical outcome / meaning | Primary artifact | Files |
| --- | --- | --- | --- |
| 20261011T060556_694484Z | Phase 2A bootstrap BLOCKED: Windows asyncio wakeup socketpair denied; zero test-body assertions. 18 BLOCKED, 8 SKIPPED. | [primary record](evidence/20261011T060556_694484Z/RESULTS.json) | 29 |
| 20261011T060651_997186Z | Initial deterministic execution: 15 PASS, 3 FAIL (UT-004/008/009), 8 SKIPPED. | [primary record](evidence/20261011T060651_997186Z/RESULTS.json) | 29 |
| 20261011T061026_592082Z | Repeated initial deterministic result: 15 PASS, 3 FAIL, 8 SKIPPED. | [primary record](evidence/20261011T061026_592082Z/RESULTS.json) | 29 |
| 20261011T062548_769685Z | After first approved validation corrections: 17 PASS, 1 FAIL (UT-004), 8 SKIPPED. | [primary record](evidence/20261011T062548_769685Z/RESULTS.json) | 29 |
| 20261011T062718_385853Z | Intermediate regression with restored helper reuse: 17 PASS, 1 FAIL (UT-004), 8 SKIPPED. | [primary record](evidence/20261011T062718_385853Z/RESULTS.json) | 29 |
| 20261011T063734_111127Z | Final Phase 2A: 18 PASS, 0 FAIL, 8 SKIPPED. UT-004: 98 PASS subchecks. Authoritative unit/mocked-AI execution. | [primary record](evidence/20261011T063734_111127Z/RESULTS.json) | 30 |
| 20261011T064937_069972Z | Integration prerequisite: Docker Linux engine unavailable. 2 BLOCKED; zero integration assertions. | [primary record](evidence/20261011T064937_069972Z/RESULTS.json) | 8 |
| 20261011T065517_011796Z | Integration prerequisite: exact redis:7-alpine image absent. 2 BLOCKED; zero integration assertions. | [primary record](evidence/20261011T065517_011796Z/RESULTS.json) | 8 |
| 20261011T065750_252644Z | Inspection-only Redis-image recheck: image absent; no harness execution or RESULTS.json. | [primary record](evidence/20261011T065750_252644Z/PREFLIGHT_INSPECTION.json) | 1 |
| 20261011T070935_324625Z | Integration prerequisite: exact redis:7-alpine absent; another tag was not substituted. 2 BLOCKED. | [primary record](evidence/20261011T070935_324625Z/RESULTS.json) | 8 |
| 20261011T071933_296064Z | Successful integration: IT-007/IT-009 PASS; 20 consolidated PASS and 6 then-SKIPPED performance IDs. | [primary record](evidence/20261011T071933_296064Z/RESULTS.json) | 8 |
| 20261011T073848_090587Z | Performance startup attempt: 5 BLOCKED, zero workloads. Prior 20 PASS retained, PT-008 SKIPPED. | [primary record](evidence/20261011T073848_090587Z/RESULTS.json) | 12 |
| 20261011T075026_653371Z | Startup-only diagnostic BLOCKED: HTTP 200, PID ownership mismatch; failure-path diagnostic not executed. No performance workload. | [primary record](evidence/20261011T075026_653371Z/DIAGNOSTIC_RESULTS.json) | 12 |

## Phase 2A corrective progression

Initial 15 PASS/3 FAIL concerned negative/malformed workbook values and collisions (UT-004), course JSON validation (UT-008), and blank AI response success (UT-009). Approved negative-period-score rejection and course/institutional AI-boundary validation produced 17 PASS/1 FAIL. Strict numeric parsing, within-sheet duplicate ID/CLO rejection and unambiguous fallback resolved retained UT-004 failures. The above-maximum rejection expectation was corrected to preserve existing extra-credit implementation behavior. Final execution reached 18 PASS with 98 UT-004 subchecks.

The final compatibility artifact confirms unchanged actual observations for the preceding 17 passing IDs and unchanged historical sources. The 70/30 formula, thresholds, rounding and tested valid/missing-data outputs remained compatible. This is not independent approval of an institutional extra-credit policy.

## Phase 2B-1 progression

Docker/image blockers were prerequisite failures, not failed ETL assertions. Once satisfied, a fresh loopback-only Redis container supported real upload/queue/worker/ETL checks. Five uploads were accepted: four completed and one deliberately malformed job failed as expected. IT-009's three simultaneous scenarios produced 4/9/8 unique independently checked records. HTTP acceptance and terminal completion were distinct assertions.

## Phase 2B-2 progression

A read-only audit proposed bounded workloads without numeric SLAs. Five workloads were prepared and approved at that time, but none executed because API ownership/readiness proof was absent. PT-008 was deliberately withheld. Subsequent harness corrections preserved startup errors separately, bounded readiness, added owned stdin control and Windows process-job cleanup, and improved sanitized diagnostics.

Caching the temporary directory before the file audit hook corrected a reentrancy/deadlock hazard. The new child cache was initially unset and then reached API HTTP 200. Original deadlock attribution is strongly supported by the code and new initialization evidence, but the original hang has no saved stack trace. The launcher/server PID mismatch remains unresolved. Graceful shutdown/worker-stop proof is absent; both tracked PIDs were absent after owned-job cleanup, and Redis/temp cleanup was recorded. The intentional failure-path mode is prepared, unexecuted. Further debugging and benchmarks are paused.
