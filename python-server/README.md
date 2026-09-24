# OBELISK ETL & Analytics Service

This repository contains the OBELISK ETL & Analytics Service, a pure-compute Python microservice built with FastAPI. It serves as the core data processing engine for the OBELISK Outcomes-Based Education (OBE) system.

## 1. What This Service Is

This service has two primary responsibilities:

1.  **Per-Course ETL**: It receives a single, instructor-filled class-record Excel workbook, validates it, and runs an Extract, Transform, Load (ETL) pipeline. This process computes the Direct CLO (Course Learning Outcome) Attainment for every student based on institutional formulas.
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

The project includes test modules in the `testing_modules/` directory covering unit logic, standalone component validation, and end-to-end HTTP flows.

### Running All Automated Tests (Batch)

To automatically discover and run all `unittest`-based suites:

```sh
python testing_modules/run_all.py
# or using uv:
uv run python testing_modules/run_all.py
```

### Individual Test Modules

#### Unit & Standalone Tests (No running server required)

| Script | Purpose | How to Run (from project root) |
| :--- | :--- | :--- |
| `run_all.py` | **Test Runner**: Discovers and runs all `unittest` test suites in `testing_modules/`. | `python testing_modules/run_all.py` |
| `test_validate.py` | **ETL Logic Validation**: Tests `ExcelExtractor` and `SimpleTransformer` directly against sample workbooks (Formula 1A, Rule 1, roster extraction). | `python testing_modules/test_validate.py` |
| `test_ai_module.py` | **Standalone AI/CQI Module**: Exercises `generate_cqi_recommendation()` with sample data, verifying student anonymization, gap extraction, and prompt formatting. | `python testing_modules/test_ai_module.py` |
| `test_shared_secret_auth.py` | **Shared-Secret Auth Suite**: Validates `X-Webapp-Secret` enforcement and rejection (`401 UnauthorizedCaller`) via FastAPI's `TestClient`. | `python testing_modules/test_shared_secret_auth.py` |
| `test_unsupported_course_type.py` | **Course Type Enforcement**: Verifies that unsupported course types (e.g. `RESEARCH`) fail gracefully with a structured `UnsupportedCourseType` error. | `python testing_modules/test_unsupported_course_type.py` |
| `test_indirect_attainment.py` | **Indirect Attainment Formulas**: Unit tests for the `compute_indirect_clo_attainment` scaling and boundary validation. | `python testing_modules/test_indirect_attainment.py` |

#### End-to-End Tests (Require running server + Redis at `http://localhost:8000`)

| Script | Purpose | How to Run (from project root) |
| :--- | :--- | :--- |
| `test_upload_e2e.py` | **Single-Course E2E Test**: Uploads a real workbook to `POST /upload`, polls `GET /jobs/{job_id}`, and verifies attainment results and recommendations. | `python testing_modules/test_upload_e2e.py` |
| `test_institutional_summary_e2e.py` | **Institutional Summary E2E Test**: Posts a multi-course payload to `/analytics/summary` and `/analytics/institutional-summary`, verifying rollups and executive recommendations. | `python testing_modules/test_institutional_summary_e2e.py` |
| `test_error_handling_e2e.py` | **Error Handling E2E Test**: Uploads a malformed workbook (e.g., missing sheets) to confirm the worker fails gracefully and stores a structured `MissingWorksheet` error. | `python testing_modules/test_error_handling_e2e.py` |

---

## 5. API Endpoint Reference

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/upload` | Upload a class-record `.xlsx` file to start a new ETL job. |
| `GET` | `/jobs` | Get a list of all jobs currently tracked in Redis. |
| `GET` | `/jobs/{job_id}` | Get the status and result of a specific ETL job. |
| `GET` | `/analytics/jobs/{job_id}/recommendation` | Get a per-course AI-generated CQI recommendation for a completed job (409 if pending). |
| `POST` | `/analytics/summary` | Get pure data rollups for a given set of course submissions. |
| `POST` | `/analytics/institutional-summary` | Get a high-level, institution-wide CQI summary and AI recommendation. |
| `GET` | `/health` | A simple health check endpoint. |

### Output compatibility note

ETL results remain backward-compatible, but `attainments[]` may now include an additive `excluded_reason` field. When `excluded_reason == "no_plo_mapping"`, the CLO was intentionally skipped because the workbook's CLO-PLO mapping table did not contain a valid non-zero mapping for that CLO. In that case, the attainment-related fields are returned as `null` for that row.

### Extraction validation note

The ETL extractor currently supports `LECTURE` class records only. If a workbook declares any other course type, extraction stops with a structured `UnsupportedCourseType` error so the job is marked failed instead of producing partial output.

---

## 6. Known Limitations and Deferred Items

For a detailed list of known implementation gaps, trade-offs, and unresolved client questions, please see [**documentations/KNOWN_LIMITATIONS.md**](./documentations/KNOWN_LIMITATIONS.md).
