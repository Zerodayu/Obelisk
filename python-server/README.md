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

There are two ways to run the service: locally with `uv` for development, or with Docker Compose for production or easy deployment.

### Option A: Running with Docker Compose (Recommended)

This is the simplest and most reliable way to run the service and all its dependencies.

**Prerequisites:**
-   Docker Desktop (with Compose) installed and running.
-   An LLM API key (e.g., from Google AI Studio) if live LLM generation is desired.

**Instructions:**

1.  **Configure Environment:**
    Create a `.env` file in the project root.
    ```env
    # .env
    OBELISK_ALLOWED_ORIGINS=["http://localhost:3000"]
    OBELISK_LLM_API_KEY="your_api_key_here"
    # Optional shared secret to enforce caller authentication:
    # OBELISK_WEBAPP_SHARED_SECRET="your_shared_secret_here"
    ```

2.  **Build and start the services:**
    This command will build the Python application, download the official Redis image, and start both containers.
    ```sh
    docker compose up --build -d
    ```

The API will be available at `http://localhost:8000`.

### Option B: Running Locally with uv (for Active Development)

This method allows for faster iteration on the Python code but requires Redis to be running separately.

**Prerequisites:**
-   [uv](https://docs.astral.sh/uv/)
-   Docker Desktop installed and running.
-   A `.env` file in the project root (see above).

**Instructions:**

1.  **Start the Redis container:**
    In a separate terminal, run this command to start the Redis service in the background. You only need to do this once.
    ```sh
    docker compose up -d redis
    ```

2.  **Install dependencies:**
    ```sh
    uv sync
    ```

3.  **Start the development server:**
    The application will automatically load the `.env` file and connect to the Redis container you started in step 1.
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

---

## 6. Known Limitations and Deferred Items

For a detailed list of known implementation gaps, trade-offs, and unresolved client questions, please see [**documentations/KNOWN_LIMITATIONS.md**](./documentations/KNOWN_LIMITATIONS.md).
