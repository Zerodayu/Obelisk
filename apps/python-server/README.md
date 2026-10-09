# OBELISK Python ETL & Analytics Service

An authoritative, pure-compute backend microservice for Outcomes-Based Education (OBE) class record ingestion, attainment calculation, and AI-powered Continuous Quality Improvement (CQI) advisory generation.

Designed for **Jose Maria College Foundation, Inc. (JMCFI)**.

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

All environment configurations are managed via `.env` files located at the root of the repository or passed directly into the container/runtime environment.

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
| `OBELISK_LLM_MODEL` | `gemini-3.5-flash-lite` | Google Gemini model name used for AI recommendations. |

---

## 3. Architecture Overview

This microservice acts as a **pure computation engine**. It has:
- **No Direct Database Access**: All persistence is managed by the client webapp.
- **Asynchronous Task Queue**: Uses Redis lists (`BRPOP`) and hashes to manage ETL job state durability.
- **Independent Recomputation**: Recalculates direct and indirect attainment directly from raw Excel score cells, completely ignoring sheet formulas.
- **Multi-Key LLM Failover**: Sequential retry and failover across configured Gemini API keys with graceful exhaustion signaling.

For full architectural diagrams and specifications, refer to [`documentations/SYSTEM_PROCESS_EXPLAINED.md`](documentations/SYSTEM_PROCESS_EXPLAINED.md).

---

## 4. Testing Suite

The service features an automated test suite located in `testing_modules/`.

```bash
# Run all unit and integration tests
uv run python testing_modules/run_all.py
```

### Test Directory Manifest

| Script | Type | Focus / Description | Command |
| :--- | :---: | :--- | :--- |
| `run_all.py` | Runner | **Test Runner**: Discovers and runs all `unittest` suites in `testing_modules/`. | `uv run python testing_modules/run_all.py` |
| `test_etl_v2.py` | Unit | **AUN-OBE ETL Core & Edge Cases**: Tests dynamic CLO count discovery (synthetic 3-CLO and 7-CLO workbooks), formula tampering resilience (ignoring sheet formula columns and recalculating directly from raw cells), structured old-template rejection (`MissingWorksheet`), and indirect attainment math. | `uv run python -m unittest testing_modules/test_etl_v2.py` |
| `test_llm_failover.py` | Unit | **LLM Multi-Key Pool & Failover**: Verifies flexible `.env` parsing (JSON arrays and comma-separated strings), sequential key failover on quota/API errors, key exhaustion signaling, and endpoint error statuses. | `uv run python -m unittest testing_modules/test_llm_failover.py` |
| `test_institutional_summary_e2e.py` | Integration | **Multi-Course Analytics & Rollups**: Validates departmental, program, and AVP group rollups (Formulas 2A, 7A, 7C, Rule 3) and executive AI summary generation using FastAPI's `TestClient`. | `uv run python -m unittest testing_modules/test_institutional_summary_e2e.py` |
| `test_shared_secret_auth.py` | Unit | **Caller Security / Auth**: Validates `X-Webapp-Secret` enforcement and rejection (`401 UnauthorizedCaller`) across endpoints. | `uv run python -m unittest testing_modules/test_shared_secret_auth.py` |
| `test_unsupported_course_type.py` | Unit | **Course Type Gating**: Verifies that non-`LECTURE` courses (e.g., `RESEARCH`) fail gracefully with a structured `UnsupportedCourseType` error. | `uv run python -m unittest testing_modules/test_unsupported_course_type.py` |
| `test_ai_module.py` | Standalone | **AI Recommendation & Privacy**: Exercises `generate_cqi_recommendation()` using `google-genai`, verifying student anonymization, gap extraction, and Markdown formatting. | `uv run python testing_modules/test_ai_module.py` |
| `test_validate.py` | Standalone | **Extraction Smoke Test**: Runs direct CLI extraction and transformation sanity checks against `JMCFI_Class_Record_Template_AUN-OBE.xlsx`. | `uv run python testing_modules/test_validate.py` |
| `test_upload_e2e.py` | Live E2E | **Full Single-Course Flow**: Uploads class record workbooks to `POST /upload`, polls Redis job state until `completed`, verifies attainments, and fetches per-course AI recommendation with schema validation. *(Requires server running on port 8000)* | `uv run python testing_modules/test_upload_e2e.py` |
| `test_stress_async.py` | Load Test | **Async Stress & Capacity Test**: Benchmarks ASGI baseline (`GET /health/`), CPU rollups (`POST /analytics/summary`), and concurrent workbook ingestion (`POST /upload`) with latency percentiles and RPS metrics. | `uv run python testing_modules/test_stress_async.py --concurrency 25 --requests 100` |

---

## 5. API Endpoint Reference

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/upload` | Upload an AUN-OBE class-record `.xlsx` file to start a new ETL job. |
| `GET` | `/jobs` | Get a list of all jobs currently tracked in Redis. |
| `GET` | `/jobs/{job_id}` | Get the status and result of a specific ETL job. |
| `GET` | `/analytics/jobs/{job_id}/recommendation` | Generate a per-course AI CQI recommendation for a completed job. |
| `POST` | `/analytics/summary` | Generate pure mathematical department/program/AVP rollups (no AI call). |
| `POST` | `/analytics/institutional-summary` | Generate institutional rollups + executive VPAA AI recommendation. |
| `GET` | `/health` | Server health and service readiness check. |

---

## 6. Official Documentation Links

- [System Design & Architecture](documentations/SYSTEM_PROCESS_EXPLAINED.md)
- [Integration Contract & API Specs](documentations/INTEGRATION.md)
- [Mathematical Formulas](documentations/FORMULAS.md)
- [Constants & Configuration Specs](documentations/CONSTANTS.md)
- [Known Limitations & Performance Boundaries](documentations/KNOWN_LIMITATIONS.md)
- [Security & Performance Analysis](documentations/ANALYSIS_AND_RECOMMENDATIONS.md)
