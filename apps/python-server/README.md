# OBELISK Python ETL & Analytics Service

An authoritative, pure-compute backend microservice for Outcomes-Based Education (OBE) class record ingestion, attainment calculation, and AI-powered Continuous Quality Improvement (CQI) advisory generation.

Designed for **Jose Maria College Foundation, Inc. (JMCFI)**.

Start with the [documentation index](documentations/README.md) for usage guides and historical evidence.

---

## 1. Quick Start

Ensure you have [uv](https://docs.astral.sh/uv/) installed (recommended) or standard Python 3.13+.

```bash
# 1. Install dependencies
uv sync

# 2. Run background Redis (required for job queues)
docker compose up -d redis

# 3. Start development server with reload
uv run dev
# The service runs on http://127.0.0.1:8000
```

---

## 2. Environment Configuration

`app/core/env.py` decrypts the repo-root `.env.local` or `.env.prod` selected by
`OBELISK_ENV` before `Settings()` reads the process environment. There is no
per-package `.env`. Pre-set process/container values take precedence
(`override=False`); `OBELISK_ENV_FILE` can select an explicit root-file path.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `OBELISK_ENV` | `local` | Environment profile (`local` or `prod`). Namespaces Redis keys. |
| `OBELISK_DEBUG` | `False` | Enables verbose debug outputs and relaxed logging. |
| `OBELISK_JOB_WORKER_COUNT` | `4` | Number of concurrent ETL background worker coroutines. |
| `OBELISK_JOB_QUEUE_MAXSIZE` | `200` | Maximum pending jobs allowed in Redis before rejecting with 503. |
| `OBELISK_REDIS_HOST` | `localhost` | Redis server hostname. |
| `OBELISK_REDIS_PORT` | `6379` | Redis server port. |
| `OBELISK_MAX_CONCURRENT_UPLOAD_WRITES` | `5` | Maximum simultaneous chunked file writes to disk. |
| `OBELISK_MAX_UPLOAD_SIZE` | `10485760` (10MB) | File size ceiling for uploaded `.xlsx` files. |
| `OBELISK_WEBAPP_SHARED_SECRET` | `None` | Shared secret key for service-to-service auth (`X-Webapp-Secret`). |
| `OBELISK_LLM_API_KEYS` | `[]` | Comma-separated or JSON array of Gemini API keys for failover. |
| `OBELISK_LLM_API_KEY` | `None` | Backward-compatible single Gemini API key. |
| `OBELISK_LLM_MODEL` | `gemini-3.5-flash-lite` | Current source default; root env or pre-set runtime values may override the effective model. |

`IS_DEBUG_MODE=False` in `app/analytics/cqi_recommender.py` enables the real
Gemini path; it is a code toggle, separate from `OBELISK_DEBUG` logging. Missing
valid API keys produce HTTP 501 at AI routes, except the course no-gap shortcut
which makes no provider call. Course recommendations are validated JSON encoded
as a string; institutional recommendations require nonempty text and may be
prose. Outer JSON/plain Markdown fences are removed without truncating embedded
backticks. See [INTEGRATION.md](documentations/INTEGRATION.md). The default model
is a configuration value, not evidence of live availability or deployment.

---

## 3. Architecture Overview

This microservice acts as a **pure computation engine**. It has:
- **No Direct Database Access**: Application-domain persistence is managed by the webapp; this service saves uploads and job results for processing.
- **Asynchronous Task Queue**: Uses Redis lists (`BRPOP`) and JSON string values (`SET`) for job state, with environment-prefixed keys. Redis durability depends on its deployment; popped jobs have no acknowledgement/requeue recovery.
- **Independent Recomputation**: Recalculates direct and indirect attainment directly from raw Excel score cells, completely ignoring sheet formulas.
- **Multi-Key LLM Failover**: Sequential retry and failover across configured Gemini API keys with graceful exhaustion signaling.

For full architectural diagrams and specifications, refer to [`documentations/SYSTEM_PROCESS_EXPLAINED.md`](documentations/SYSTEM_PROCESS_EXPLAINED.md).

The current webapp upload flow is **Upload → Python processing → Bun ready/preview → explicit Save → database persistence**. Python `completed` means ETL results are available in Redis; it does not mean application attainments have been saved. The browser polls Bun, reviews its `ready` preview, then explicitly Saves. Upload/history metadata may already exist before that step. See [the integration contract](documentations/INTEGRATION.md#webapp-preview-and-explicit-persistence).

---

## 4. Testing Suite

Start with the [testing guide](documentations/TESTING.md) for Python/uv commands, legacy regression structure, fixture paths, isolation and Pre-UAT runner selection. Use the separate [AI accuracy guide](documentations/AI_ACCURACY_EVALUATION.md) for the 150-case live/replay benchmark and verification of the actual Gemini model.

The **October 13, 2026 legacy repair verification** recorded **50 passing unittest cases and two passing standalone checks**, with no failures or skips. This historical record is retained in the [legacy README](testing_modules/old_test/README.md); no tests were rerun for this documentation consolidation.

The separate [October 11 Pre-UAT package](testing_modules/pre_uat/README.md) records **20 PASS, 0 FAIL, 5 BLOCKED, 1 SKIPPED across 26 institutional IDs**. Those IDs are not legacy unittest counts or 150-case AI classifications. Preserve original dates, model IDs and source manifests. Mocked regressions do not establish real Gemini availability, Redis/upload operation, performance, deployment or whole-webapp acceptance.

---

## 5. API Endpoint Reference

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/upload` | Send multipart `file` to save/enqueue an ETL job; HTTP 202 precedes asynchronous workbook validation. |
| `GET` | `/jobs/` | List jobs tracked in Redis; `/jobs` redirects to the canonical route. |
| `GET` | `/jobs/{job_id}` | Get the status and result of a specific ETL job. |
| `GET` | `/analytics/jobs/{job_id}/recommendation` | Generate a per-course AI CQI recommendation for a completed job. |
| `POST` | `/analytics/summary` | Generate pure mathematical department/program/AVP rollups (no AI call). |
| `POST` | `/analytics/institutional-summary` | Generate institutional rollups + executive VPAA AI recommendation. |
| `GET` | `/health/` | Hardcoded status with a TODO timestamp, not a Redis/worker readiness probe. `/health` redirects. |

---

Job timestamps currently represent UTC without a `Z`/offset. HTTP errors may use string-valued `detail`, while worker failures are structured objects in the polled job's `error` field. See [the integration error contract](documentations/INTEGRATION.md#http-errors-versus-worker-errors) before implementing client error handling.

## 6. Official Documentation Links

- [Documentation index](documentations/README.md)
- [Testing guide](documentations/TESTING.md)
- [AI accuracy evaluation guide](documentations/AI_ACCURACY_EVALUATION.md)
- [System Design & Architecture](documentations/SYSTEM-DESIGN.md)
- [System Process Explained](documentations/SYSTEM_PROCESS_EXPLAINED.md)
- [Integration Contract & API Specs](documentations/INTEGRATION.md)
- [Mathematical Formulas](documentations/FORMULAS.md)
- [Constants & Configuration Specs](documentations/CONSTANTS.md)
- [Known Limitations & Performance Boundaries](documentations/KNOWN_LIMITATIONS.md)
- [Security & Performance Analysis](documentations/ANALYSIS_AND_RECOMMENDATIONS.md)
