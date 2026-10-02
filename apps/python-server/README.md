# OBELISK ETL & Analytics Service

This repository contains the OBELISK ETL & Analytics Service, a pure-compute Python microservice built with FastAPI. It serves as the core data processing engine for the OBELISK Outcomes-Based Education (OBE) system.

## 1. What This Service Is

This service has two primary responsibilities:

1.  **Per-Course ETL**: It receives an instructor-filled AUN-OBE class-record Excel workbook, validates it, and runs an Extract, Transform, Load (ETL) pipeline. This process computes Direct CLO Attainment and Indirect CLO Attainment for every student based on institutional formulas.
2.  **Institutional Analytics**: It accepts a consolidated payload containing the results of multiple course submissions from the main web application. It then performs higher-level aggregations, rolling up CLO attainment to the PLO (Program Learning Outcome) level for different organizational units (Program, Department, AVP Group) and generates AI-powered summaries for institutional quality improvement.

---

## 2. Architectural Boundary (IMPORTANT)

This service is intentionally designed with a strict architectural boundary that **must** be understood by any consuming application (e.g., the main webapp backend).

-   **No Database Access**: This service **never** connects to a database for application data (e.g., it does not store user info or attainment results). It is a stateless compute engine. All data is received via HTTP requests, and all results are returned as JSON in the HTTP response. The calling application is solely responsible for all data persistence.

-   **No Authentication/Authorization (RBAC)**: This service has **no concept of users, roles, or permissions**. It trusts every API call it receives. The calling application (the webapp backend) **MUST** perform all necessary authentication and authorization checks *before* calling any endpoint on this service. This is especially critical for the `POST /analytics/institutional-summary` endpoint, which should only be accessible to authorized roles like the VPAA.
    - *Note:* An optional caller check using `OBELISK_WEBAPP_SHARED_SECRET` (`X-Webapp-Secret` header) can be enabled to verify the caller is the legitimate backend server.

-   **Job Queue**: The service uses **Redis** as a durable, scalable job queue to manage background ETL tasks. This is an infrastructure dependency, not an application database.

---

## 3. Quickstart

There are two ways to run the service: locally with `uv` for development, or with Docker Compose for production or easy deployment. The compose file lives at the **repository root** (it builds this service as the `etl` target and also owns Redis), so Docker commands run from there.

### Option A: Running with Docker Compose (Recommended)

This is the simplest and most reliable way to run the service and all its dependencies.

**Prerequisites:**
-   Docker (with Compose v2) installed and running.
-   The root `.env.prod` **and** the gitignored `.env.keys` in place — compose bind-mounts both read-only and `app/core/env.py` decrypts the file inside the container (`OBELISK_ENV=prod`).
-   One or more LLM API keys (e.g., from Google AI Studio) if live LLM generation is desired.

**Instructions:**

1.  **Configure Environment:**
    All env lives in the **repository root** files — `.env.local` (dev) and `.env.prod` (Docker/production), the same single pair the backend and frontend read; there is no per-package env file anymore. Both are dotenvx-encrypted: get the root `.env.keys` from a maintainer and run `just env-decrypt` (repo root) to edit them. `OBELISK_ENV` selects which file is used (`local` by default, `prod` inside compose).
    ```env
    # .env.local (dev) / .env.prod (prod) — at the repository root
    OBELISK_ALLOWED_ORIGINS=["http://localhost:3000"]

    # Multiple LLM API Keys with Automatic Failover:
    # Supply as a JSON array or comma-separated string.
    # If one key reaches rate limits, quota limits, or errors, the service automatically fails over to the next key.
    OBELISK_LLM_API_KEYS=["AIzaSy...", "AIzaSy..."]

    # Legacy single key (also supported for backward compatibility):
    # OBELISK_LLM_API_KEY="your_api_key_here"

    # Optional shared secret to enforce caller authentication:
    # OBELISK_WEBAPP_SHARED_SECRET="your_shared_secret_here"
    ```

2.  **Build and start the services** (from the **repository root**):
    ```sh
    just docker-deploy                 # whole stack: caddy, backend, frontend, etl, redis, dozzle, umami (+ tailscale sidecars)
    docker compose up -d etl            # this service only (Redis starts as its dependency)
    ```

In Docker the service publishes no port — it is reached in-network at `http://etl:8000` (that is what the backend uses), and a bare `docker compose up` for the whole stack skips the dotenvx wrap that Caddy needs. For `http://localhost:8000` run Option B, or the root `just dev`.

### Option B: Running Locally with uv (for Active Development)

This method allows for faster iteration on the Python code but requires Redis to be running separately.

**Prerequisites:**
-   [uv](https://docs.astral.sh/uv/)
-   Docker installed and running.
-   The root `.env.local` in place (see above). `app/core/env.py` walks up from this package to find it; without the root `.env.keys` it logs a warning and runs on built-in defaults.

**Instructions:**

1.  **Start the Redis container:**
    In a separate terminal, run this command from the **repository root** to start the Redis service in the background. You only need to do this once.
    ```sh
    just redis        # or: docker compose up -d redis
    ```

2.  **Install dependencies:**
    ```sh
    uv sync
    ```

3.  **Start the development server:**
    The application loads the root `.env.local` (see above) and connects to the Redis container you started in step 1.
    ```sh
    uv run dev
    ```

---

## 4. Testing the Service

The project includes test modules in the `testing_modules/` directory covering unit logic, standalone component validation, and end-to-end HTTP flows for the **v2 AUN-OBE Template**.

### Running All Automated Tests (Batch)

To automatically discover and run all `unittest`-based suites:

```sh
python testing_modules/run_all.py
# or using uv:
uv run python testing_modules/run_all.py
```

### Active Test Modules

| Script | Type | Tested Aspect | How to Run |
| :--- | :---: | :--- | :--- |
| `run_all.py` | Runner | **Test Runner**: Discovers and runs all `unittest` suites in `testing_modules/`. | `uv run python testing_modules/run_all.py` |
| `test_etl_v2.py` | Unit | **AUN-OBE ETL Core & Edge Cases**: Tests dynamic CLO count discovery (synthetic 3-CLO and 7-CLO workbooks), formula tampering resilience (ignoring sheet formula columns and recalculating directly from raw cells), structured old-template rejection (`MissingWorksheet`), and indirect attainment math. | `uv run python -m unittest testing_modules/test_etl_v2.py` |
| `test_llm_failover.py` | Unit | **LLM Multi-Key Pool & Failover**: Verifies flexible `.env` parsing (JSON arrays and comma-separated strings), sequential key failover on quota/API errors, key exhaustion signaling, and endpoint error statuses. | `uv run python -m unittest testing_modules/test_llm_failover.py` |
| `test_institutional_summary_e2e.py` | Integration | **Multi-Course Analytics & Rollups**: Validates departmental, program, and AVP group rollups (Formulas 2A, 7A, 7C, Rule 3) and executive AI summary generation using FastAPI's `TestClient`. | `uv run python -m unittest testing_modules/test_institutional_summary_e2e.py` |
| `test_shared_secret_auth.py` | Unit | **Caller Security / Auth**: Validates `X-Webapp-Secret` enforcement and rejection (`401 UnauthorizedCaller`) across endpoints. | `uv run python -m unittest testing_modules/test_shared_secret_auth.py` |
| `test_unsupported_course_type.py` | Unit | **Course Type Gating**: Verifies that non-`LECTURE` courses (e.g., `RESEARCH`) fail gracefully with a structured `UnsupportedCourseType` error. | `uv run python -m unittest testing_modules/test_unsupported_course_type.py` |
| `test_ai_module.py` | Standalone | **AI Recommendation & Privacy**: Exercises `generate_cqi_recommendation()` using `google-genai`, verifying student anonymization, gap extraction, and Markdown formatting. | `uv run python testing_modules/test_ai_module.py` |
| `test_validate.py` | Standalone | **Extraction Smoke Test**: Runs direct CLI extraction and transformation sanity checks against `JMCFI_Class_Record_Template_AUN-OBE.xlsx`. | `uv run python testing_modules/test_validate.py` |
| `test_upload_e2e.py` | Live E2E | **Full Single-Course Flow**: Uploads `JMCFI_Class_Record_Template_AUN-OBE.xlsx` to `POST /upload`, polls Redis job state until `completed`, verifies 75 attainments with `indirect_clo_attainment_pct`, and fetches per-course AI recommendation. *(Requires server running on port 8000)* | `uv run python testing_modules/test_upload_e2e.py` |

---

## 5. API Endpoint Reference

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/upload` | Upload an AUN-OBE class-record `.xlsx` file to start a new ETL job. |
| `GET` | `/jobs` | Get a list of all jobs currently tracked in Redis. |
| `GET` | `/jobs/{job_id}` | Get the status and result of a specific ETL job. |
| `GET` | `/analytics/jobs/{job_id}/recommendation` | Get a per-course AI-generated CQI recommendation for a completed job (409 if pending). |
| `POST` | `/analytics/summary` | Get pure data rollups for a given set of course submissions (safe for any role; no AI call). |
| `POST` | `/analytics/institutional-summary` | Get a high-level, institution-wide CQI summary and AI recommendation (VPAA only). |
| `GET` | `/health` | A simple health check endpoint. |

### Output Data Shape Notes for Webapp Consumers

- **`indirect_clo_attainment_pct`**: Newly added to each student attainment row (`0.0`–`100.0%`), independently recomputed from the Indirect CLO rating: `(rating / 5.0) * 100.0`.
- **`direct_clo_attainment_pct`**: Independently recomputed from the 6 raw score/max cells ($\frac{\text{Prelim}+\text{Midterm}+\text{Final}}{\text{Prelim Max}+\text{Midterm Max}+\text{Final Max}}$). Excel formula columns in the workbook are completely bypassed and ignored.
- **`excluded_reason`**: Always `null`. CLO-PLO mapping in Excel is permanently retired; correlation matrices are managed entirely within the webapp backend. `clo_plo_mapping` is returned as `[]`.
- **Category breakdowns (`tla_pct`, `at_pct`, `exam_pct`, `output_pct`)**: Always `null` in the AUN-OBE format, as scores arrive pre-summed into grading period subtotals per CLO.
- **Extraction Validation**: The ETL extractor currently supports `LECTURE` class records only. If a workbook declares any other course type in `SETUP`, extraction stops immediately with a structured `UnsupportedCourseType` error. Older non-AUN-OBE templates raise structured `MissingWorksheet` errors.
- **AI Recommendation Failover & Error Reporting**:
  - The service iterates through all API keys in `OBELISK_LLM_API_KEYS`.
  - If a key fails (e.g., quota exceeded / 429), it immediately retries with the next available key.
  - If all keys fail, the endpoint returns `"status": "error"`, includes a top-level `"error"` explanation, and provides an explanatory recommendation message beginning with `[LLM API ERROR: All N configured API key(s) were exhausted...]`.

---

## 6. Known Limitations and Deferred Items

For a detailed list of known implementation gaps, trade-offs, and unresolved client questions, please see [**documentations/KNOWN_LIMITATIONS.md**](./documentations/KNOWN_LIMITATIONS.md).
