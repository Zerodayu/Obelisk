# Controlled Phase 2B-2 performance execution

Startup-only verification is available with `--startup-only`, which has no
workload-module execution path and does not rewrite the consolidated results.
See [STARTUP_DIAGNOSTIC_NOTES.md](STARTUP_DIAGNOSTIC_NOTES.md) for corrections and
the BLOCKED `20261011T075026_653371Z` diagnostic. HTTP 200 was observed but exact
PID ownership did not match the Windows SDK launcher. Graceful shutdown was not
verified; owned process-tree/Redis/temp cleanup succeeded. The intentional
failure-path check was not executed because normal verification failed. Do not
retry or run benchmarks until the remaining ownership correction is approved.

The first attempt, `20261011T073848_090587Z`, stopped before all workload
execution. PT-004/005/006/007/009 are BLOCKED, not failed benchmark assertions.
The fresh Redis prerequisite succeeded, but the HTTP ownership handshake was
not recorded and the server's graceful shutdown/isolation proof was absent.
The owned server process was terminated. Owned Redis/container/temp cleanup
succeeded. Captured server stderr was empty; the underlying startup cause is
not established. No automatic retry was attempted. Diagnose this prerequisite
before approving another execution. Consolidated results retain the prior
20 PASS timestamps/evidence and PT-008 remains SKIPPED.

Only PT-004, PT-005, PT-006, PT-007 and PT-009 are implemented for this phase.
PT-008 has no execution path. This command creates disposable local services
and runs the fixed approved workloads; it is an explicit opt-in, not generic
test discovery.

```powershell
& 'D:\Jetbrains_IDE_Projects\pycharm\Obelisk_FINAL\apps\python-server\.venv\Scripts\python.exe' -B testing_modules/pre_uat/run_phase2b2.py --approved-bounded-run
```

Use PyCharm's configured interpreter. Required packages are the existing
runtime packages plus httpx and uvicorn; no installation or image pull occurs.
Docker Desktop's Linux engine must be running and exact `redis:7-alpine` must
already be cached. No configurable target, worker tuning, duration increase,
live-provider mode or saturation option is accepted.

The runner reuses the Phase 2B-1 container ownership/identity/persistence checks
without changing that harness. New guards allow only its owned Redis endpoint
and a separately owned Uvicorn process on a random loopback HTTP port. Each
process installs guards before importing application modules; encrypted env,
database/model imports, existing uploads/templates and live Gemini construction
are denied. Denial self-checks are intercepted before a connection occurs.
Protected application and historical-script hashes must remain unchanged.

Performance settings are read from source defaults: 4 ETL workers, queue 200,
5 simultaneous file writes, 1 MiB chunks, 10 MiB upload limit. Only Redis address,
unique environment namespace and temporary upload directory are redirected.
Real routers, upload service, Redis queue, workers and complete ETL are used.
`app.main` and its encrypted startup are excluded; middleware/auth and production
deployment capacity are outside these measurements. Logging is captured with a
test logger, so deployment logging overhead is not measured.

| ID | Fixed workload |
| --- | --- |
| PT-004 | 20 uploads each at concurrency 1, 2, 4; wait for completion between batches |
| PT-005 | 10 uploads, each completes before the next dispatch |
| PT-006 | 20 sequential recommendation requests for a completed gap-producing job; mocked provider, no artificial delay |
| PT-007 | At most 60 uploads with at least two seconds between dispatches, within a 120-second submission window; one upload request at a time, below the approved cap of two |
| PT-009 | 3 excluded warm-ups and 100 measured analytics requests at each concurrency 1, 2, 4; two synthetic sections, 300 attainment records |

Requests have 30-second timeouts. Terminal observation has a 120-second bound;
whole-case guards prevent indefinite execution. Those bounds are safety limits,
not SLAs. Resource guards require at least 1 GiB free host RAM and disk and at
most 1 GiB working set per owned Python process. CPU >=90% at preflight blocks
execution. Host RAM/disk, owned process CPU-time/working-set and owned Redis
Docker CPU/RAM are sampled about every five seconds (3-second pause plus Docker
sampling overhead). Sampling gaps and short cases are visible in evidence.

All accepted jobs must complete with 150 unique, independently checked records.
Independent Decimal calculations verify direct, indirect, 70/30 composite,
threshold, level and completeness outputs. Analytics checks verify CLO means,
counts, mapped PLO means/completeness and program averages. ETL-derived analytics
payloads omit IDs and anonymize names. Evidence uses anonymous ordinal records
and hashes, not original student names/IDs. The workbook builder is reused from
the immutable restored historical unit helper through the existing safe AST
loader; historical stress-script code is not executed.

PASS means functional assertions, isolation and cleanup succeeded. Numeric
performance acceptance is NOT ASSESSED: no explicit SLA was found. PT-006
measures the mocked Python path only, not Gemini latency or rate-limit behavior.
PT-007 is a short stability exercise, not a long-duration soak test. Local host
background workloads remain a possible source of variation.

Acceptance throughput divides accepted uploads by the submission window.
Completed ETL throughput divides completed jobs by dispatch-to-final-terminal
observation time, including polling/validation overhead. Completion latencies
are upper-bound HTTP-poll observations; polling runs while paced uploads are
still being submitted. Mean, nearest-rank p95 (`ceil(0.95*n)-1`) and maximum are
reported separately. Poll requests are counted separately from workload requests.
Redis depth measures waiting jobs, excluding running or completed jobs. Samples
may miss brief peaks. Completed job records and files are retained until owned
cleanup; retained growth is not automatically a memory leak.

Evidence is written into a new UTC timestamp directory, with per-ID results,
HTTP logs, resource samples, source/fixture manifests, server worker-transition
proof and isolation/cleanup proof. Prior 20 PASS rows retain their original
timestamps/evidence. Cleanup gracefully stops the owned server and workers,
deletes only the owned Redis namespace, removes only the labelled owned container
and deletes its temporary uploads. Missing ownership/cleanup proof prevents PASS.
Exit 0 means five functional PASS results; 1 means FAIL; 2 means BLOCKED.
