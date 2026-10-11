# Phase 2B-1 integration — executed PASS

**IT-007 PASS and IT-009 PASS** in `20261011T071933_296064Z`. Earlier Docker/image blockers are historical; see [TESTING_HISTORY.md](TESTING_HISTORY.md). Current package totals are 20 PASS, 0 FAIL, 5 BLOCKED and 1 SKIPPED, with only performance IDs blocked/deferred.

## Verified behavior

IT-007 asserts upload 202/UUID/queued state and absent stale result, worker-persisted running to completed or failed, independently correct six-record valid output, sanitized malformed numeric-cell error/no result, stable rereads and absent-job 404. The expected failed malformed job is a passing test assertion. HTTP polling may miss brief running states; evidence distinguishes HTTP observations from persisted updates.

IT-009 submits three distinct worst/mixed/ideal workbooks concurrently (correctness concurrency 3), requires unique IDs/upload paths, all terminal completion, 4/9/8 unique scenario-specific records, independent direct/indirect/composite values, disjoint identities and stable result fingerprints. This is not a throughput benchmark.

## Actual environment and isolation

Python 3.13.0; FastAPI/httpx in-process ASGI with real upload/job routers; real Redis queue, upload service, workers and full ETL. Docker Linux engine 29.7.2; fresh labelled cached Redis 7.4.11 container on random loopback port 2062, disabled snapshot/AOF persistence, no persistent mounts, unique namespace and temporary uploads. Exact image identity is in [ownership evidence](evidence/20261011T071933_296064Z/ISOLATION.json).

Test configuration: two explicit workers, queue limit 10, write concurrency 3, 1 MiB upload cap and 64 KiB chunks. These are isolated correctness settings, not source-default production capacity. Terminal polling deadline 15 seconds and case bound 30 seconds. Effective deployment configuration and `app.main` startup/middleware were not tested.

Configuration/import/network guards preceded application imports; encrypted env, databases/models, live Gemini and existing workbook/upload access were denied. Only the newly proven Redis instance and trusted asyncio wakeup pair were available. No existing application container or shared queue was targeted.

## Cleanup and evidence

Five jobs were accepted: four completed; one intentionally malformed job failed as expected. Workers were cancelled, BRPOP threads allowed to drain, owned keys/uploads removed between cases and empty Redis verified. Only the owned labelled container/temp directory was removed; no FLUSHDB/FLUSHALL. Source hashes confirm production/original sources unchanged during execution.

[Job-count summary](evidence/20261011T071933_296064Z/EXECUTION_SUMMARY.json), [exact assertions](evidence/20261011T071933_296064Z/RESULTS.json), [worker events](evidence/20261011T071933_296064Z/SANITIZED_LOGS.json), [source manifest](evidence/20261011T071933_296064Z/SOURCE_MANIFEST.json). The 18 earlier PASS IDs retain their original timestamps and were not rerun.

## Reproduction reference — not authorization to execute now

Use the configured SDK and existing packages. Docker Linux engine must already run and exact cached `redis:7-alpine` must exist. The runner neither pulls images nor substitutes existing Redis, and accepts no target override.

```powershell
& '.\.venv\Scripts\python.exe' -B testing_modules/pre_uat/run_phase2b1.py
```

Exit 0: two PASS IDs and verified cleanup; 1: assertions failed; 2: BLOCKED prerequisites/isolation. Run from the Python service root only through this runner. A rerun rewrites consolidated reports for its scope; preserve the final submission snapshot first. No rerun occurred in this documentation phase. Python has no application database; persistence/auth/approval/frontend verification belongs to the webapp team.
