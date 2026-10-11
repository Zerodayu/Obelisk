# Phase 2B-1: IT-007 and IT-009 only

The integration harness executed successfully in run 20261011T071933_296064Z: IT-007 PASS and IT-009 PASS. This is correctness testing: three concurrent uploads, two explicit workers, 15-second terminal polling deadlines, 30-second case bounds. It has no load/stress or AI mode.

## Prerequisites and execution

Use PyCharm's configured Python SDK from apps/python-server. Existing runtime/test packages must include fastapi, httpx, redis, orjson, aiofiles, python-multipart, openpyxl, pydantic and google-genai. No dependencies were installed for this task.

Docker Desktop's **local Linux engine** must already be running at `npipe:////./pipe/dockerDesktopLinuxEngine`, and `redis:7-alpine` must already be cached locally. The runner does not start Docker Desktop or pull an image. It ignores configured Docker hosts/contexts and never accepts a Redis host, URL or port override. A WSL distribution or existing Redis listener alone does not establish isolation and is not substituted.

```powershell
& 'D:\Jetbrains_IDE_Projects\pycharm\Obelisk_FINAL\apps\python-server\.venv\Scripts\python.exe' -B testing_modules/pre_uat/run_phase2b1.py
```

Exit 2 means BLOCKED prerequisites/isolation; 1 means assertion failure; 0 means both IDs passed with verified cleanup. Do not run the test module through generic discovery: prerequisites must be proved before imports of queue/worker modules.

The latest workstation execution verified local Docker 29.7.2 and the exact cached redis:7-alpine image. The runner created and removed its own disposable Redis 7.4.11 container on loopback port 2062. Earlier missing-engine/image evidence remains preserved. Image provisioning is not performed by this runner.

## Production path and isolation

The harness creates a new labelled Redis container by cached image ID with `--pull=never`, no persistent mounts, loopback-only random host port, read-only filesystem, temporary /data, and Redis snapshot/AOF persistence disabled. It proves its ownership label, loopback binding, fresh empty database and Redis run_id before any application import. Database 0 is safe only because the entire instance is new and disposable; production's hardcoded db=0 is unchanged.

Test-only config/logger modules are installed before queue import. Root encrypted environment loading, app.main/database/model imports, live AI construction, credential-file reads and existing workbook/upload reads are denied. Network audit permits only the proven Redis loopback port plus asyncio's trusted internal wakeup pipe. Uploads use a new temporary folder; ENV is a unique preuat UUID, producing `obelisk:preuat_<UUID>:job_queue` and per-job keys. No production config file is edited.

FastAPI ASGI requests use the real upload and job routers. The production save_upload_file, Redis enqueue/get/update, workers and complete ETL pipeline run without numerical/result mocks. Workers start explicitly after queued state is read. A wrapper observes actual persisted running/terminal updates; it neither generates statuses nor substitutes results. Fast jobs can make intermediate states hard to observe through HTTP, so evidence separates HTTP observations from persisted worker observations. No app.main startup/auth/webapp claim is made.

IT-007 submits valid and malformed synthetic workbooks, checks UUID/queued/null-result states, then requires completed accurate unique records and failed sanitized WorkbookValidationError respectively. It rereads results to rule out stale/cross-job output and checks an absent UUID returns 404. The malformed workbook contains invalid nonblank numeric data rather than a corrupt ZIP, so its structured validation error can be checked without exposing file-path/provider exception contents.

IT-009 concurrently submits worst/mixed/ideal synthetic workbooks with disjoint synthetic IDs and different record counts. It requires three distinct IDs/upload paths, terminal completion, independently calculated direct/indirect/composite outputs, unique student-CLO pairs, correct course headers, disjoint records and unchanged per-job result fingerprints on reread.

## Cleanup and evidence

Production currently leaves Redis job records and upload files after processing; no TTL/removal occurs in the inspected worker. The harness owns cleanup: cancel workers, wait for the fixed BRPOP timeout thread to drain, remove only tracked jobs/owned queue entries and temporary uploads, verify empty Redis, then remove only the container whose ownership label matches this run. No FLUSHDB/FLUSHALL is used. Cleanup failure prevents a passing result.

Each invocation creates timestamped IT result files, RESULTS.json, ISOLATION.json, SOURCE_MANIFEST.json, SANITIZED_LOGS.json and CONSOLIDATED_RESULTS.json. BLOCKED prerequisites have executed=false and no fabricated logs/assertions. The consolidated markdown/CSV carry forward Phase 2A's 18 PASS entries with their original timestamps and evidence; they were not rerun. IT statuses reflect this phase; PT-004 through PT-009 remain SKIPPED.

All previous evidence and old_test originals are preserved. Source hashes detect changes to production/original files during execution. The latest timestamped run supplies passing integration evidence for both IDs within this documented scope. Phase 2B-1 stops after these two IDs; performance and live Gemini require separate approval.
