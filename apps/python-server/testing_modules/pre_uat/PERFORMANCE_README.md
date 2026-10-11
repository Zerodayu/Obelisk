# Phase 2B-2 performance — prepared, not executed

**PT-004/005/006/007/009 BLOCKED; PT-008 SKIPPED.** No upload benchmark, analytics benchmark, AI latency workload, stability exercise or queue saturation ran. No PT metric or performance PASS exists. Further debugging/testing is paused for documentation consolidation.

## Read-only audit and proposed bounded workloads

| ID | Prepared behavior / workload | Intended metrics / assertions |
| --- | --- | --- |
| PT-004 | 20 synthetic uploads each at concurrency 1, 2, 4 | Acceptance versus completed ETL throughput; per-job independent outputs and terminal completion. |
| PT-005 | 10 sequential uploads, each reaching terminal state before the next | Dispatch-to-202 and dispatch-to-completion mean/p95/max. |
| PT-006 | 20 sequential course recommendations using deterministic mocked Gemini | Python AI-path overhead/content checks only; not live Gemini latency. |
| PT-007 | At most 120-second dispatch window, 60 uploads, >=2-second dispatch interval, maximum two requests in flight | Errors, backlog, terminal results, queue drain, owned CPU/RAM; short exercise, not long soak. |
| PT-008 | Queue saturation/recovery proposal only; execution not approved | Capacity/rejection/recovery/drain. No executed assertion or measurement. |
| PT-009 | Three excluded warm-ups then 100 measured analytics requests at each concurrency 1, 2, 4 | Independent CLO/PLO rollups; HTTP throughput and mean/p95/max. |

Prepared services: separate guarded Uvicorn process on random loopback port, new labelled cached Redis container, disabled persistence/no mounts, unique namespace and synthetic 30x5 workbook. Source-default intended settings: four workers, queue 200, write concurrency five, 1 MiB chunks and 10 MiB upload limit. These settings are preparation metadata, not benchmark validation of a deployment.

Thirty-second request and 120-second drain bounds are safety limits, not SLAs. Proposed metrics include requests/concurrency, accepted/completed/failed/rejected/unfinished counts, HTTP errors, mean/nearest-rank p95/max, distinct acceptance/completion throughput, sampled waiting depth/drain and owned CPU/RAM. Polling/validation overhead must be disclosed. Queue depth excludes running jobs; sampled peaks can be missed. Retained job keys/files require owned cleanup and should not automatically be called leaks.

The historical stress script only checks HTTP acceptance and can target an existing service; it was not run. Documentary historical throughput figures lack attributable raw evidence here and are not official thresholds. No numeric latency/throughput targets were found; performance acceptance remains unassessed.

## Actual attempts and unresolved blocker

Initial `20261011T073848_090587Z` stopped before workloads with absent HTTP ownership/shutdown proof; the primary startup error was obscured by cleanup handling. Owned process termination and Redis/temp cleanup were recorded.

Subsequent `20261011T075026_653371Z` startup-only mode reached HTTP 200 after guard initialization corrections. Exact PID ownership failed: launcher 13620 versus server 24656. The harness correctly withheld shutdown, forced owned process-job cleanup, and verified both PIDs absent. Graceful worker-stop proof is missing. Intentional pre-readiness failure mode exists but was not run, because normal verification failed. See [STARTUP_DIAGNOSTIC_NOTES.md](STARTUP_DIAGNOSTIC_NOTES.md).

## Commands retained for traceability — do not execute during this pause

```powershell
& '.\.venv\Scripts\python.exe' -B testing_modules/pre_uat/run_phase2b2.py --startup-only
```

The workload runner additionally requires `--approved-bounded-run`; that mode is not authorized in this documentation phase and cannot currently establish ownership. Do not use generic test discovery, alternate services, relaxed guards, tuned workers or live provider keys. Any future retry requires separate approval and verification of server PID membership in the owned process job.

No dependencies were downloaded; existing Python runtime/httpx/Uvicorn packages and cached Redis were used for preparation. Startup preflight CPU/RAM/disk readings are environmental observations, not workload measurements. [Evidence index](EVIDENCE_INDEX.md) preserves five original BLOCKED records plus later diagnostics, without retimestamping completed tests.
