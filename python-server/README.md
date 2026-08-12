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

-   **No Authentication/Authorization**: This service has **no concept of users, roles, or permissions**. It trusts every API call it receives. The calling application (the webapp backend) **MUST** perform all necessary authentication and authorization checks *before* calling any endpoint on this service. This is especially critical for the `POST /analytics/institutional-summary` endpoint, which should only be accessible to authorized roles like the VPAA.

-   **Job Queue**: The service uses **Redis** as a durable, scalable job queue to manage background ETL tasks. This is an infrastructure dependency, not an application database.

---

## 3. Quickstart

There are two ways to run the service: locally with `uv` for development, or with Docker Compose for production or easy deployment.

### Option A: Running with Docker Compose (Recommended)

This is the simplest and most reliable way to run the service and all its dependencies.

**Prerequisites:**
-   Docker Desktop (with Compose) installed and running.
-   An LLM API key (e.g., from Google AI Studio).

**Instructions:**

1.  **Configure Environment:**
    Create a `.env` file in the project root.
    ```env
    # .env
    OBELISK_ALLOWED_ORIGINS=["http://localhost:3000"]
    OBELISK_LLM_API_KEY="your_api_key_here"
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

The project includes several scripts in the `testing_modules/` directory to validate its functionality. Before running any test, ensure the application is running using one of the methods above.

| Script | Purpose | How to Run (from project root) |
| :--- | :--- | :--- |
| `test_validate.py` | **Low-Level Validation**: Tests the `extractor` and `transformer` logic directly without the web server. | `python testing_modules/test_validate.py` |
| `test_upload_e2e.py` | **Single-Course E2E Test**: Validates the full HTTP flow for one course, including a real LLM call. | `python testing_modules/test_upload_e2e.py` |
| `test_institutional_summary_e2e.py` | **Institutional Summary E2E Test**: Validates the high-level analytics endpoint, including a real LLM call. | `python testing_modules/test_institutional_summary_e2e.py` |

---

## 5. API Endpoint Reference

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/upload` | Upload a class-record `.xlsx` file to start a new ETL job. |
| `GET` | `/jobs` | Get a list of all jobs currently tracked in Redis. |
| `GET` | `/jobs/{job_id}` | Get the status and result of a specific ETL job. |
| `GET` | `/analytics/jobs/{job_id}/recommendation` | Get a per-course AI-generated CQI recommendation for a completed job. |
| `POST` | `/analytics/summary` | Get pure data rollups for a given set of course submissions. |
| `POST` | `/analytics/institutional-summary` | Get a high-level, institution-wide CQI summary and AI recommendation. |
| `GET` | `/health` | A simple health check endpoint. |

---

## 6. Known Limitations and Deferred Items

For a detailed list of known implementation gaps, trade-offs, and unresolved client questions, please see [**documentations/KNOWN_LIMITATIONS.md**](./documentations/KNOWN_LIMITATIONS.md).
