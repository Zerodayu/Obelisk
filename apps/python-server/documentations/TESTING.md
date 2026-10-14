# Testing guide

Use this guide to choose a runner. For the service itself, use the [service README](../README.md); for real-model classification, use the separate [AI accuracy guide](AI_ACCURACY_EVALUATION.md).

## Environment and command location

Run all commands from `apps/python-server/` with the existing Python 3.13+ project environment and installed dependencies.

With Python in PowerShell, activate the project environment once:

```powershell
.\.venv\Scripts\Activate.ps1
```

Then use the `python` commands below. With uv, replace the initial `python` with `uv run --no-sync python`. For example:

```powershell
uv run --no-sync python -B testing_modules/old_test/run_all.py
```

`--no-sync` uses the existing project environment without synchronizing dependencies. It does not install missing prerequisites. `-B` suppresses bytecode files. Offline tests do not require you to start the application server or configure Gemini credentials.

## Choose the correct suite

| Goal | Entry point | Real services / writes |
| --- | --- | --- |
| Routine offline regression | `testing_modules/old_test/run_all.py` | Mock Gemini/queue; disposable temporary writes only; no persistent reports |
| Local Compose Redis connectivity only | `testing_modules/old_test/run_all.py --redis-live` | Only PING to verified local `127.0.0.1:6379`; offline tests and workers do not run |
| Complete applicable legacy suite, including real local pipeline | `testing_modules/old_test/run_all.py --all-live` | Offline suite plus original live upload/stress scripts; owned disposable HTTP server/Redis/uploads; Gemini mocked |
| Institutional deterministic Unit/ST-AI cases | `testing_modules/pre_uat/run_phase2a.py` | Mock Gemini, denied network; writes evidence and replaces consolidated reports |
| Real isolated upload/Redis/worker correctness | `testing_modules/pre_uat/run_phase2b1.py` | Creates an owned disposable Redis container and temporary uploads; replaces consolidated reports |
| Validate saved institutional live CQI responses | `testing_modules/pre_uat/run_live_ai_evidence.py` | Default is saved evidence only; creates a dated output directory |
| Score 150 real model classifications | `testing_modules/pre_uat/ai_accuracy_evaluation/evaluate.py` | `--responses` replays saved outputs; `--live` makes up to two Gemini generation attempts |
| Performance/startup harness | `testing_modules/pre_uat/run_phase2b2.py` | Starts owned processes/container; historical verification remains blocked; not routine regression |

Use the designated runners. Generic unittest discovery or direct imports can bypass guards that must be installed before application imports. Do not use configured/shared Redis or deployed services as substitutes for disposable test resources.

## Routine legacy regression

```powershell
python -B testing_modules/old_test/run_all.py
```

The default runs seven allowlisted unittest modules and two standalone offline checks. It reports the live upload and stress scripts as `NOT RUN`. This is the recommended starting point.

```powershell
python -B testing_modules/old_test/run_all.py --list
python -B testing_modules/old_test/run_all.py --suite unittest
python -B testing_modules/old_test/run_all.py --suite integration
```

Here `--suite integration` means the two standalone **offline** checks; it does not run Redis or the live upload workflow. Exit 0 means the selected checks succeeded; exit 1 means a selected test failed.

### Optional local Compose Redis PING

Run the default offline suite and the opt-in connectivity check as separate commands:

```powershell
python -B testing_modules/old_test/run_all.py
python -B testing_modules/old_test/run_all.py --redis-live
```

With uv:

```powershell
uv run --no-sync python -B testing_modules/old_test/run_all.py
uv run --no-sync python -B testing_modules/old_test/run_all.py --redis-live
```

The default remains offline: the same 50 unittest cases and two standalone checks, with mocked Redis/Gemini and unchanged network/write guards. `--redis-live` runs **only** the Redis connectivity check; it cannot be combined with `--suite` or `--list`, and its result is never counted as an offline test result.

Compose publishes the `obelisk-redis` service at `127.0.0.1:6379` for host-side Python. Inside the ETL container, Compose sets `OBELISK_REDIS_HOST=redis` and `OBELISK_REDIS_PORT=6379`; production `job_queue.py` uses redis-py with database 0. Local and production job keys are namespaced, but can share the Redis instance. This check neither selects an application namespace nor reads/writes keys.

The Docker CLI and the already running local Compose Redis container are prerequisites. The check starts no containers or services. Before connecting it verifies a local named-pipe/Unix-socket Docker context, Compose labels pointing to this checkout's root `docker-compose.yml`, the Redis service identity, running state and exclusive `127.0.0.1:6379` publication. Remote Docker contexts, `DOCKER_HOST` overrides, other checkouts and unverified bindings are BLOCKED before opening a Redis connection. No host/port override is accepted and root environment files/application settings are not loaded.

A raw RESP socket sends exactly one `PING` and expects `PONG`; redis-py is deliberately avoided so no client handshake commands are sent. There is no worker startup, enqueue, AUTH, SELECT, key access, deletion or flush. Socket operations have one-second timeouts and the response has a one-second overall deadline; each of the three read-only Docker inspections has a three-second timeout. There are no retries.

| Result | Meaning | Exit code |
| --- | --- | ---: |
| `REDIS LIVE: PASS` | Verified local target returned PONG | 0 |
| `REDIS LIVE: FAIL` | Verified target timed out, refused connection or did not return PONG | 1 |
| `REDIS LIVE: BLOCKED` | Docker/local ownership prerequisites could not be verified; no Redis connection attempted | 2 |

PING proves connectivity only, not queue/worker correctness, data isolation or Redis durability. The safety regressions are separate from the unchanged 50-case allowlist and use mocked sockets/Docker:

```powershell
python -B -m unittest testing_modules.old_test.test_redis_ping
```

### Complete local legacy run: `--all-live`

**Warning:** this mode creates an owned disposable Redis container, starts a loopback-only Python server with real workers, writes temporary upload files, enqueues jobs and generates bounded HTTP load. `--all-live` is the explicit opt-in for those effects. Gemini is always mocked and real clients are denied; there are no paid API calls and no target URL/host override.

From the service directory with the existing project environment:

```powershell
python -B testing_modules/old_test/run_all.py --all-live
```

Or:

```powershell
uv run --no-sync python -B testing_modules/old_test/run_all.py --all-live
```

The modes are separate and cannot be combined:

```powershell
# Default: unchanged offline regressions
python -B testing_modules/old_test/run_all.py
# Existing Compose container: PING only, without jobs/workers
python -B testing_modules/old_test/run_all.py --redis-live
# Full applicable legacy suite: disposable real HTTP/Redis/worker pipeline
python -B testing_modules/old_test/run_all.py --all-live
```

The all-live runner performs:

1. The unchanged 50-case offline allowlist and two standalone checks, in a separate process.
2. The separate mocked safety tests for Redis/live-mode dispatch, ownership and prerequisites.
3. Local Docker/fixture/dependency preflight, then a fresh Redis container with a unique owner label, random loopback port, no mounts, and snapshot/AOF persistence disabled.
4. An owned random-port Uvicorn server using the real `app.main` lifecycle, four workers, Redis queue, upload service and ETL. Root env loading is suppressed in that test process; uploads and multipart spool files stay in its disposable directory. Shared-secret checking is disabled only in this owned test server because the original live scripts do not supply that header. Offline tests retain shared-secret coverage.
5. Unmodified `test_upload_e2e.py` via `main(["--live"])`, for worst, mixed and ideal workbooks. The script has no URL argument; the wrapper sets its `BASE_URL` in memory to the owned server. Its assertions remain intact. HTTP requests and Redis/ETL processing are real; recommendation text is mock Gemini JSON.
6. Unmodified `test_stress_async.py` with `--live --url <owned-url> --mode all --concurrency 2 --requests 4`. Its minimums mean **4 health, 20 analytics and 15 upload requests**, not four requests in every category.
7. Additional completion checks: all 18 accepted valid jobs (three E2E plus 15 stress uploads) must complete, their polled results must match Redis-persisted results, record counts must match the fixture roster/CLO layout, upload paths must stay in the owned directory and the pending queue must drain. The original stress script checks HTTP acceptance alone; that is not sufficient for pipeline PASS.
8. A corrupted synthetic upload must receive 202, then fail in the real worker with structured `InvalidWorkbook` metadata and no result.
9. Graceful server shutdown and removal of only the owned Redis container and temporary directory. No shared keys are deleted or flushed; no existing application/container is stopped. Forced server termination marks cleanup BLOCKED.

Preflight requires the existing packages (`requests`, `httpx`, `uvicorn`, `redis`, `openpyxl` and application dependencies), all three `classrecord_templates/JMCFI_Class_Record_Template_AUN-OBE(worst|mixed|ideal).xlsx` fixtures, the Docker CLI/local engine and this checkout's running Compose Redis container. The latter is inspected read-only to prove locality and obtain its cached image ID; the worker test never connects to its port 6379. A separate container uses that immutable cached image with `--pull=never`. No dependency/image download or shared-service fallback occurs. Proxy settings, remote Docker contexts, missing prerequisites or invalid ownership block the live stages explicitly. No production environment files or deployed VPS are used.

Each requested stage/fixture reports PASS, FAIL or BLOCKED. Real-provider Gemini evaluation is explicitly SKIP because this mode mandates mock Gemini. Exit 0 means all applicable checks and cleanup passed; 1 means an assertion/execution failed; 2 means a prerequisite/isolation/cleanup blocker with no FAIL. BLOCKED is not converted into PASS. Every invocation prints results but writes no historical or persistent report.

This verifies the Python HTTP/Redis/worker pipeline. It does not test Bun/Next.js, application-database persistence, live Gemini quality/quotas, saturation, sustained load, or production performance. Small stress-run timings are smoke-test observations rather than deployment benchmarks.

### Directory structure

The [legacy directory](../testing_modules/old_test/) contains the original 11 Python files plus repair and connectivity support:

| Type | Files |
| --- | --- |
| Runner | `run_all.py` |
| Original unittest modules | `test_composite_attainment.py`, `test_etl_v2.py`, `test_institutional_summary_e2e.py`, `test_llm_failover.py`, `test_shared_secret_auth.py`, `test_unsupported_course_type.py` |
| Repair regression module | `test_legacy_runner.py` |
| Standalone offline checks | `test_validate.py`, `test_ai_module.py` |
| Live scripts | `test_upload_e2e.py`, `test_stress_async.py` |
| Shared fixture/isolation support | `_support.py` |
| Opt-in Redis PING helper and separate mocked safety tests | `_redis_ping.py`, `test_redis_ping.py` |
| Opt-in disposable all-live harness and safety tests | `_all_live.py`, `test_all_live_safety.py` |

### Isolation and fixtures

The runner suppresses encrypted root environment loading, Redis connection checks and background workers before imports. It mocks Gemini and blocks outbound connections, DNS, subprocesses and writes outside a disposable temporary directory. Windows asyncio's internal socketpair remains available. Configuration-test environment changes are process-local and restored. In-process FastAPI TestClient requests do not start a listening server. Failover tests inject fake clients while exercising retry/failover logic.

Required legacy fixtures, relative to the service root:

```text
classrecord_templates/Old/JMCFI_Class_Record_Template_AUN-OBE-base.xlsx
classrecord_templates/Old/E-classrecord(LECTURE ONLY).xlsx
```

Missing required fixtures produce explicit failures. Current mixed/worst/ideal workbooks remain in `classrecord_templates/`; do not rewrite historical workbooks. `test_validate.py` and `test_ai_module.py` also run offline directly, returning 0 on success and 1 on verification failure.

The October 13, 2026 repair verification recorded **50 passing unittest cases and two passing standalone checks**, with no failures, errors or skips. This is a historical result, not a test execution during this documentation consolidation. The original record remains in the [legacy README](../testing_modules/old_test/README.md).

The code-fence parsing regression checks that only an outer multiline JSON/plain fence is removed; embedded backticks, CRLF and case-insensitive `json` are handled without weakening the assertion. Unsupported/incomplete fences and surrounding prose remain unchanged. Mock responses are validated separately from real provider output. Formula and API definitions remain in [FORMULAS.md](FORMULAS.md) and [INTEGRATION.md](INTEGRATION.md).

### Legacy live scripts

These scripts are excluded from the default offline runner; `--all-live` integrates upload and stress against its owned disposable server with mocked Gemini. When invoking scripts directly, use a separately managed disposable server with explicit permission for the resulting network calls and writes.

| Script | Opt-in arguments | Effects / limits |
| --- | --- | --- |
| `test_ai_module.py` | `--live` | Loads runtime settings; may call Gemini |
| `test_upload_e2e.py` | `--live [worst\|mixed\|ideal\|path]` | HTTP uploads, files, Redis jobs and possible Gemini calls |
| `test_stress_async.py` | `--live --mode health\|analytics\|upload\|all` | HTTP load; upload modes write files and Redis jobs |

Upload/stress scripts return 2 without `--live` and 1 on failure. The upload script uses `requests`, present in the previously inspected environment but not declared in `pyproject.toml`; check its availability separately. These scripts do not send `X-Webapp-Secret`, so protected requests fail if the server enables that setting. Health-only stress requests are unprotected. Their success would not establish full webapp persistence, authentication or approval behavior.

## Institutional Pre-UAT runners

The preserved October 11 package records **20 PASS, 0 FAIL, 5 BLOCKED, 1 SKIPPED across 26 unique IDs**. These are institutional IDs, not legacy unittest cases. Read the [historical final summary](../testing_modules/pre_uat/PRE_UAT_FINAL_SUMMARY.md) and [evidence index](../testing_modules/pre_uat/EVIDENCE_INDEX.md) for attribution.

`run_phase2a.py` and `run_phase2b1.py` write new timestamped evidence but also replace `PRE_UAT_RESULTS.md`, `PRE_UAT_RESULTS.csv` and related consolidated reports. To preserve the submission package, run them in a separate disposable checkout/copy containing the required source and fixtures. They have no documented output-directory option that prevents these writes. Do not rerun them in the preserved evidence checkout simply to inspect historical results.

### Deterministic Unit/ST-AI suite

From the separate checkout's service directory:

```powershell
python -B testing_modules/pre_uat/run_phase2a.py
```

This selects 18 deterministic Unit/ST-AI IDs, with Gemini mocked/denied and no Redis. `--case UT-004`, `--case UT-008` or `--case UT-009` can focus an invocation; unselected IDs are recorded as SKIPPED. Exit 0 means no selected failure/blocker, 1 means FAIL, 2 means BLOCKED. A focused run does not reproduce the complete institutional result total.

### Disposable Redis integration

```powershell
python -B testing_modules/pre_uat/run_phase2b1.py
```

This runner accepts no target override. It requires an already running local Docker Linux engine and the cached `redis:7-alpine` image; it does not pull an image or fall back to shared Redis. It uses real upload/job routers through in-process ASGI, real Redis/workers/ETL, unique keys and disposable files, while denying Gemini/database access. It checks IT-007 and IT-009, including malformed-job failure as an expected assertion. Exit 0 means both IDs passed and cleanup verified, 1 means assertions failed, 2 means prerequisites/isolation were blocked.

The [integration record](../testing_modules/pre_uat/INTEGRATION_README.md) preserves the exact October 11 image, settings, timeouts and assertions. It is correctness evidence, not a throughput benchmark or verification of `app.main` startup, frontend or backend persistence.

### Saved live CQI evidence

```powershell
python -B testing_modules/pre_uat/run_live_ai_evidence.py
```

The default validates existing ST-AI-001/002 responses and supported numerical claims for ST-AI-004, creating a fresh evidence directory with **zero new provider calls**. It does not run the 150-case classification benchmark.

`--live-st-ai002` permits a bounded ST-AI-002 generation only when valid saved mixed evidence is absent; the existing response normally means no new call. Do not delete evidence to force generation. ST-AI-001 cannot be regenerated by this runner, and ST-AI-004 never generates. Read the [saved workflow/provenance record](../testing_modules/pre_uat/LIVE_AI_EVIDENCE_README.md) for its small-fixture ground truth and human review limits. Its recorded `gemini-3.5-flash-lite` model describes those historical calls, not the model a future invocation must use.

### Performance and documentation validation

Performance tests are not an ordinary test-suite step. The historical package has five BLOCKED performance IDs and PT-008 SKIPPED, with no accepted workload metrics. `run_phase2b2.py --startup-only` is a process/container diagnostic, not a benchmark. Workloads additionally require `--approved-bounded-run`; consult the [performance record](../testing_modules/pre_uat/PERFORMANCE_README.md), [diagnostic notes](../testing_modules/pre_uat/STARTUP_DIAGNOSTIC_NOTES.md) and [remediation review](../testing_modules/pre_uat/PERFORMANCE_HARNESS_REMEDIATION.md) before any separately authorized execution.

To inspect documentation against saved institutional records without importing the application or contacting services:

```powershell
python -B testing_modules/pre_uat/documentation_validation.py --check
```

Use `--check` for read-only validation. `--consolidate` regenerates submission documentation from saved records and must not be used in the preserved package merely to refresh navigation.

Offline passes establish bounded compute and mocked behavior. Real Gemini availability/quality, deployed Redis durability, performance, webapp persistence/RBAC, academic sign-off and deployment readiness require separate evidence.
