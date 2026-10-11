# Phase 2B final verification — 2026-10-11

**Assigned scope: IT-007 PASS, IT-009 PASS; PT-004/005/006/007/009 BLOCKED; PT-008 SKIPPED. Eight unique IDs. No new test, startup diagnostic, provider request, or performance workload executed.** IT-008 is outside this assignment and was neither executed nor claimed.

Audit HEAD: `66cf2e0cb8402e97926747558c9f4be954835de1`. This identifies this review, not the historical integration execution. Pre-existing root environment/IDE changes and untracked evidence were left untouched.

## Evidence inventory and provenance

[Full inventory](evidence/20261011T103309_745090Z_phase2b_verification/EVIDENCE_INVENTORY.json) records exact relative/absolute paths, per-row UTC timestamps, phase, status, executed field, command, recorded Git commit or explicit absence, script/function, expected result, assertion observations, failures, supporting reports, evidence target, and SHA-256. [Readable inventory](evidence/20261011T103309_745090Z_phase2b_verification/EVIDENCE_INVENTORY.md) lists the metadata. There are **69 primary per-ID records and 109 result/consolidation rows**; carried-forward rows are not additional executions.

All directory names below are under `testing_modules/pre_uat/evidence/`. Exact per-case timestamps/commands are in the inventory; directory timestamps are not substituted for execution timestamps.

| Historical directory | Scoped primary records | Meaning |
| --- | --- | --- |
| `20261011T060556_694484Z` | 8 | Phase 2A SKIPPED, executed=false, “Phase 2B not authorized” |
| `20261011T060651_997186Z` | 8 | Same unexecuted Phase 2A placeholders |
| `20261011T061026_592082Z` | 8 | Same unexecuted Phase 2A placeholders |
| `20261011T062548_769685Z` | 8 | Same unexecuted Phase 2A placeholders |
| `20261011T062718_385853Z` | 8 | Same unexecuted Phase 2A placeholders |
| `20261011T063734_111127Z` | 8 | Same unexecuted Phase 2A placeholders |
| `20261011T064937_069972Z` | 2 | IT prerequisites BLOCKED: Docker unavailable; executed=false |
| `20261011T065517_011796Z` | 2 | IT prerequisites BLOCKED: exact cached image absent; executed=false |
| `20261011T070935_324625Z` | 2 | IT prerequisites BLOCKED: exact cached image absent; executed=false |
| `20261011T071933_296064Z` | 2 | Genuine Phase 2B-1 PASS; executed=true; actual assertions |
| `20261011T073848_090587Z` | 5 | Phase 2B-2 BLOCKED before workloads; executed=false |
| `20261011T085439_489884Z` | 8 | Later Phase 2A SKIPPED placeholders; do not supersede verified Phase 2B execution |

Additional relevant artifacts: `20261011T065750_252644Z/PREFLIGHT_INSPECTION.json` is inspection only; `20261011T075026_653371Z/DIAGNOSTIC_RESULTS.json` is a BLOCKED startup diagnostic with zero workload requests. The inventory includes scoped carried-forward rows in each RESULTS/CONSOLIDATED_RESULTS file, including PT-008's explicit nonapproval in the Phase 2B-2 consolidated report. These copies are not primary new test results.

Inspected `run_phase2b1.py`, `run_phase2b2.py`, integration assertions, controlled workloads, isolation/environment/server/lifecycle helpers, relevant READMEs, evidence index, history, summaries, source manifests, worker logs, startup stages, readiness attempts, process cleanup and exit proof. Also searched relevant repository testing/documentation directories and repository document filenames for an institutional specification. No separate institutional performance specification, numeric SLA, approved soak duration, or workload-to-institutional-form mapping was located. The project proposals below are not institutional acceptance requirements. Historical rates in [KNOWN_LIMITATIONS.md](../../documentations/KNOWN_LIMITATIONS.md) have no attributable raw results for these IDs and cannot serve as thresholds.

The Phase 2B-1 PASS records and Phase 2B-2 blocker/diagnostic records **do not record their execution Git commit**. Commit fields on carried-forward Phase 2A rows belong to those rows; they cannot establish Phase 2B provenance. [Source corroboration](evidence/20261011T103309_745090Z_phase2b_verification/SOURCE_CORROBORATION.json) independently matches all 60 saved protected-source/harness hashes from the integration manifest against current files. This supports credible execution evidence but does not reconstruct a missing commit. Institutional submission is substantively supported for the two Python integration cases, with this provenance limitation explicitly disclosed; a form requiring an execution commit needs an independently attributable historical log/CI record. Do not invent it or rerun verified PASS cases solely to fill that field.

## Verified integration

Exact historical command for both cases:

```powershell
& 'D:\Jetbrains_IDE_Projects\pycharm\Obelisk_FINAL\apps\python-server\.venv\Scripts\python.exe' -B testing_modules/pre_uat/run_phase2b1.py
```

**IT-007 PASS**, executed=true at `2026-10-11T07:19:37.862828+00:00`, duration 2.074539 seconds. [Original result](evidence/20261011T071933_296064Z/IT-007_result.txt) proves two synthetic XLSX submissions accepted with distinct UUIDs, persisted queued states and no stale result. Real worker updates were observed after persistence: running→completed for valid input and running→failed for malformed input. HTTP polling observed the valid running state; malformed running was brief and is supported by persisted update observations rather than claimed as an HTTP observation. Valid output has six unique student/CLO pairs with independent decimal numerical checks. Malformed numeric input returns sanitized `WorkbookValidationError`, null result and the correct field/sheet metadata. Source assertions additionally verify stable rereads and missing-job 404. The intentionally failed malformed job is a passing negative-input assertion.

**IT-009 PASS**, executed=true at `2026-10-11T07:19:39.938492+00:00`, duration 2.165149 seconds. [Original result](evidence/20261011T071933_296064Z/IT-009_result.txt) and source assertions prove three simultaneous submissions, unique IDs and upload paths, two real workers, completed results for worst/mixed/ideal fixtures, respectively 4/9/8 unique independently calculated records, disjoint identities, three distinct stable result fingerprints and zero cross-job pairs. Workers start after concurrent submissions; this verifies concurrent queued-job isolation, not submission while workers are already processing or deployment throughput.

Supporting paths in that same directory: [RESULTS.json](evidence/20261011T071933_296064Z/RESULTS.json), [SANITIZED_LOGS.json](evidence/20261011T071933_296064Z/SANITIZED_LOGS.json), [ISOLATION.json](evidence/20261011T071933_296064Z/ISOLATION.json), [SOURCE_MANIFEST.json](evidence/20261011T071933_296064Z/SOURCE_MANIFEST.json), [EXECUTION_SUMMARY.json](evidence/20261011T071933_296064Z/EXECUTION_SUMMARY.json).

Scope: Python 3.13, real upload/job routes through in-process ASGI, real Redis and full ETL, explicit workers. New labelled Redis 7.4.11 container, random loopback port 2062, unique namespace, disabled persistence, no persistent mounts and temporary synthetic uploads. Configuration: two workers, queue 10, write concurrency 3, 1 MiB upload cap, 64 KiB chunks, 15-second terminal deadline and 30-second case bound. Guards denied existing workbook/uploads, credentials, databases and Gemini. Five accepted jobs: four completed and one expected failure. Case cleanup asserts queue depth/key count zero; owned namespace/container/temp cleanup recorded with no network violations or protected-source changes. This excludes `app.main` lifecycle/middleware, deployed configuration, webapp persistence/auth/UI and institutional sign-off.

## Performance objectives, workloads and criteria

Every PT workload is **unexecuted**; no latency, throughput, error-rate, backlog, or workload CPU/RAM measurement exists. Shared blocker: actual server-process ownership and graceful worker shutdown are not verified. Missing institutional criteria independently prevent an institutional performance PASS. Existing runner semantics would call successful functional checks PASS while marking performance acceptance NOT ASSESSED; those two conclusions must not be conflated in the form.

| ID | Verified status | Prepared workload / intended measurement | Additional limitation |
| --- | --- | --- | --- |
| PT-004 | BLOCKED | 20 synthetic uploads at each concurrency 1/2/4 (60 total); acceptance and terminal-completion throughput, latency, errors, correct per-job 150-record results | No approved throughput/latency target; identical fixture does not replace IT-009's distinct-fixture isolation proof |
| PT-005 | BLOCKED | 10 uploads sequential through terminal completion; dispatch→202 and dispatch→terminal latency | Runner emits ten count-one batches; aggregate mean/p95/max across all ten must be computed and preserved before institutional use |
| PT-006 | BLOCKED | 20 sequential course recommendation requests; deterministic provider mock with zero artificial delay; path latency, schema/content/privacy checks and exact mock-call count | Requires preceding completed fixture job. This cannot measure real Gemini latency; Gemini requests prohibited in this task |
| PT-007 | BLOCKED | At most 60 uploads, ≥2 seconds between dispatches, 120-second dispatch window, concurrency cap 2; errors, drain, backlog, owned CPU/RAM | Actual paced submission loop is sequential. Short exercise cannot establish an unspecified long-duration soak/stability requirement |
| PT-008 | SKIPPED | Queue saturation/recovery only proposed; no execution path in bounded runner | Explicitly not authorized; no approved saturation workload or acceptance criteria |
| PT-009 | BLOCKED | Three excluded warmups plus 100 measured analytics requests at each concurrency 1/2/4 (309 requests total); independent CLO/PLO rollups, HTTP throughput and nearest-rank p95 | Requires ETL-derived anonymized payload; no approved analytics capacity/latency target |

Historical blocker files: `testing_modules/pre_uat/evidence/20261011T073848_090587Z/PT-004_result.txt`, `PT-005_result.txt`, `PT-006_result.txt`, `PT-007_result.txt`, `PT-009_result.txt`. PT-008 original placeholder: `testing_modules/pre_uat/evidence/20261011T063734_111127Z/PT-008_result.txt`; explicit nonapproval is recorded in `20261011T073848_090587Z/EXECUTION_SUMMARY.json` and its `CONSOLIDATED_RESULTS.json`. Later `20261011T085439_489884Z/PT-004_result.txt` through `PT-009_result.txt` are out-of-scope Phase 2A placeholders, not evidence that performance blockers were resolved.

Prepared resource requirements from runner/helpers: Windows process metrics/job objects, configured SDK with existing httpx/Uvicorn/runtime dependencies, running local Docker Linux engine, exact cached `redis:7-alpine` (no pulls), fresh owned Redis container, separate guarded loopback API, unique namespace and temporary uploads. Source-default settings: four workers, queue 200, write concurrency 5, 1 MiB chunks and 10 MiB file cap. Safety bounds: ≥1 GiB free RAM/disk; ≤1 GiB working set per owned Python process; preflight host CPU below 90%; 30-second request timeout, 120-second per-job/drain bounds, 180-second case bound except PT-007's 260 seconds; readiness 20 seconds with attempts ≤2 seconds; graceful exit wait 12 seconds plus forced-exit wait 10 seconds. These are harness safety limits, **not acceptance SLAs**. Samples every three seconds may miss peaks; queue depth excludes running jobs; timing includes polling/validation overhead. Source-default settings are not proof of effective deployed settings.

## Runner root cause and remediation outcome

[Original attempt](evidence/20261011T073848_090587Z/EXECUTION_SUMMARY.json) stopped before workloads with missing ownership/shutdown proof; original primary startup cause was not retained. Subsequent historical harness changes moved readiness under cleanup, retained primary and cleanup errors separately, bounded attempts and added private stdin control/Windows job cleanup.

Static code confirms the old temporary-directory audit-hook reentrancy hazard: `gettempdir()` can probe using `open` while holding a nonreentrant discovery lock, reentering the hook. Current performance guards cache the temp directory before hook installation. The later child reached Uvicorn; attribution of the original hang remains inferential because no original hang stack was captured.

[Latest diagnostic](evidence/20261011T075026_653371Z/DIAGNOSTIC_RESULTS.json) reached HTTP 200, then failed equality of serving PID with launcher PID: launcher 13620, server 24656. [CHILD_CONTROL.json](evidence/20261011T075026_653371Z/normal_startup/CHILD_CONTROL.json) confirms the serving PID; `performance_lifecycle.ready/control_proof` still require launcher equality. A Windows interpreter launcher/server distinction is consistent with this evidence; an HTTP body was not saved, so other handshake fields cannot be independently claimed verified. The benchmark resource target is also the launcher PID in current runner code.

**No new lifecycle fix was applied and no diagnostic was retried.** Relaxing PID equality without independent Windows job membership proof would violate the ownership requirement. Safe remediation remains: retain launcher identity; prove and hold the actual server handle as a member of the newly owned job (e.g. `IsProcessInJob`); check exact nonce/Redis/default identities across HTTP and child control; address the launch-before-job-assignment race; monitor the proven serving process; verify graceful worker-stop proof and both normal/intentional-failure cleanup before any workload. This is a proposed correction, not a tested implementation. The user permits safe harness remediation, but a source-only ownership relaxation is insufficient safety evidence.

Historical cleanup forced only the owned process job; [exit check](evidence/20261011T075026_653371Z/OWNED_PROCESS_EXIT_CHECK.json) records both historical PIDs absent at that time. Redis/temp cleanup is recorded in both historical isolation files. Graceful worker shutdown remains **NOT VERIFIED**; forced cleanup and an exit code of zero do not prove it. Historical PIDs may later be reused and must never be killed by their saved numbers.

## Current safety inspection, execution and preservation

[Read-only safety snapshot](evidence/20261011T103309_745090Z_phase2b_verification/SAFETY_INSPECTION.json), `2026-10-11T10:33:15.1182363Z`: explicit local Docker named pipe, Linux engine 29.7.2 and cached exact image available. Existing `obelisk-etl` and `obelisk-redis` containers active; Redis loopback 6379 and local PostgreSQL port 5432 listening; no host Python API process or host port-8000 connection observed. ETL container exposes 8000 internally. Internal worker state/count and effective encrypted/container environment were not probed. Environment variable names only were inventoried; credentials were not decrypted or printed. No DB queries, Redis commands against existing instances, container exec, API requests, stop/delete/flush/reconfigure operations or Gemini requests occurred. Approximately 2.84 GiB free RAM and 17% CPU are audit observations, not workload metrics or benchmark readiness certification.

Executed only the PowerShell evidence-audit script:

```powershell
& powershell -NoProfile -File testing_modules/pre_uat/audit_phase2b_evidence.ps1
```

Exit 0. It reads saved records and local metadata and writes a fresh timestamped audit directory; it never imports Python, launches services or runs workloads. [Actual terminal summary](evidence/20261011T103309_745090Z_phase2b_verification/TERMINAL_SUMMARY.txt) is suitable for screenshot capture and clearly labels historical verification versus zero newly executed tests. [Preservation proof](evidence/20261011T103309_745090Z_phase2b_verification/PRESERVATION.json) verifies **all 311 pre-existing evidence files unchanged**. No disposable resources were started, so no new service cleanup was necessary. No production or existing harness source changed; mutable institutional result reports were not regenerated.

Created this report, `audit_phase2b_evidence.ps1`, and six audit artifacts under `evidence/20261011T103309_745090Z_phase2b_verification/`: `EVIDENCE_INVENTORY.json`, `EVIDENCE_INVENTORY.md`, `SOURCE_CORROBORATION.json`, `SAFETY_INSPECTION.json`, `PRESERVATION.json`, `TERMINAL_SUMMARY.txt`. No new per-ID execution result files were created because no test executed; original PASS and blocker files remain authoritative.

## Ready-to-copy institutional form entries

Expected entries below describe supported objectives. Numeric performance acceptance must come from the institution rather than these proposed workloads.

| Test ID | Expected Result | Actual Result | Status |
| --- | --- | --- | --- |
| IT-007 | Valid upload creates a queued background job, progresses through running to completed with correct output; malformed workbook reaches failed with structured error and no result. | Isolated real Redis/worker/ETL execution verified: two uploads; valid completed with six independently checked records; malformed failed with sanitized WorkbookValidationError and null result; stable rereads and cleanup passed. In-process ASGI/explicit-worker scope; historical commit not recorded. Evidence: testing_modules/pre_uat/evidence/20261011T071933_296064Z/IT-007_result.txt. | PASS |
| IT-009 | Concurrent synthetic jobs retain separate IDs, paths, states and correct fixture-specific results without contamination; completion and cleanup verified. | Three concurrent jobs completed through two workers with distinct IDs/paths/fingerprints, correct 4/9/8 records, no cross-job pairs and empty owned Redis after cleanup. Historical commit not recorded. Evidence: testing_modules/pre_uat/evidence/20261011T071933_296064Z/IT-009_result.txt. | PASS |
| PT-004 | Measure concurrent upload acceptance and completed-ETL throughput, latency/errors and correct per-job output against institutional criteria. | Not executed. Owned server identity/graceful shutdown unresolved; no institutional numeric target available. No throughput/latency measurement. | BLOCKED |
| PT-005 | Measure end-to-end upload-to-terminal latency against institutional criteria. | Not executed. Owned server identity/graceful shutdown unresolved; acceptance target and aggregate latency report outstanding. | BLOCKED |
| PT-006 | Measure the required recommendation-path latency and errors against institutional criteria. | Not executed. Owned server identity/graceful shutdown unresolved; proposed mock measures Python overhead only; real Gemini latency unverified and Gemini requests prohibited. | BLOCKED |
| PT-007 | Verify sustained-load stability, errors, resource use, backlog and recovery for an approved duration and workload. | Not executed. Owned server identity/graceful shutdown unresolved; prepared short bounded exercise has no confirmed institutional duration/criteria. | BLOCKED |
| PT-008 | Verify queue saturation, controlled rejection, recovery and drain under a separately approved isolated workload. | Not executed. Queue saturation explicitly not authorized; no saturation/recovery measurements. | SKIPPED |
| PT-009 | Measure analytics throughput/latency and verify rollup correctness against institutional criteria. | Not executed. Owned server identity/graceful shutdown unresolved; no institutional numeric target available. No analytics benchmark measurement. | BLOCKED |

## Remaining actions before submission

1. Copy the eight entries above and attach this report plus exact historical integration results/cleanup/source evidence. Disclose the missing historical execution commit rather than substituting current HEAD. Obtain independent execution provenance if the form mandates it.
2. Obtain the institutional performance specification: exact payload/size, concurrence, duration, percentile/throughput/error/resource targets, timeout interpretation, and whether PT-006 permits mock-only evidence. The current user authorization supports isolated safe work; unavailable criteria and ownership proof are the actual present blockers, not the old documentation pause.
3. Review/implement the serving-process ownership and resource-target correction, then run only isolated startup/cleanup diagnostics with normal and intentional failure paths, preserving new primary/cleanup errors and process-membership proof. Recheck resources and active services immediately beforehand.
4. Once ownership, cleanup and approved workload mapping are established, execute only eligible bounded PT cases with real raw timings/statuses/job outputs/resource samples and an attributable Git commit. Report functional checks separately from performance acceptance; retain actual failures.
5. PT-008 needs explicit separate queue-saturation authorization and a bounded resource/recovery/cleanup plan. Do not infer this approval from permission for other tests. Do not include IT-008 in this team's completed results.
