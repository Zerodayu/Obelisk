# OBELISK ETL & Analytics Service

This repository contains the OBELISK ETL & Analytics Service, a pure-compute Python microservice built with FastAPI. It serves as the core data processing engine for the OBELISK Outcomes-Based Education (OBE) system.

## 1. What This Service Is

This service has two primary responsibilities:

1.  **Per-Course ETL**: It receives a single, instructor-filled class-record Excel workbook, validates it, and runs an Extract, Transform, Load (ETL) pipeline. This process computes the Direct CLO (Course Learning Outcome) Attainment for every student based on institutional formulas.
2.  **Institutional Analytics**: It accepts a consolidated payload containing the results of multiple course submissions from the main web application. It then performs higher-level aggregations, rolling up CLO attainment to the PLO (Program Learning Outcome) level for different organizational units (Program, Department, AVP Group) and generates AI-powered summaries for institutional quality improvement.

---

## 2. Architectural Boundary (IMPORTANT)

This service is intentionally designed with a strict architectural boundary that **must** be understood by any consuming application (e.g., the main webapp backend).

-   **No Database Access**: This service **never** connects to a database. It is a stateless compute engine. All data is received via HTTP requests, and all results are returned as JSON in the HTTP response. The job queue is in-memory and is wiped on every server restart. The calling application is solely responsible for all data persistence.

-   **No Authentication/Authorization**: This service has **no concept of users, roles, or permissions**. It trusts every API call it receives. The calling application (the webapp backend) **MUST** perform all necessary authentication and authorization checks *before* calling any endpoint on this service. This is especially critical for the `POST /analytics/institutional-summary` endpoint, which should only be accessible to authorized roles like the VPAA.

---

## 3. Quickstart

There are two ways to run the service: locally with uv for development, or with Docker Compose for production or easy deployment.

### Option A: Running with Docker Compose (Recommended)

This is the simplest way to run the service without managing Python environments.

**Prerequisites:**
-   Docker Desktop (with Compose) installed and running.
-   An LLM API key (e.g., from Google AI Studio).

**Instructions:**

1.  **Configure Environment:**
    Create a `.env` file in the project root. The `ALLOWED_ORIGINS` value must be a valid JSON array (without outer quotes). `.env` is read by Compose and passed to the container.
    ```env
    # .env
    OBELISK_ALLOWED_ORIGINS=["http://localhost:3000"]
    OBELISK_LLM_API_KEY="your_api_key_here"
    ```

2.  **Build and start the service:**
    Open a terminal in the project root and run:
    ```sh
    docker compose up --build -d
    ```

The API will be available at `http://localhost:8000`.

### Option B: Running Locally with uv

This method is ideal for active development.

**Prerequisites:**
-   [uv](https://docs.astral.sh/uv/)
-   A `.env` file in the project root containing your `OBELISK_LLM_API_KEY`.

**Instructions:**

1.  **Install dependencies:**
    ```sh
    uv sync
    ```

2.  **Configure Environment:**
    Create a `.env` file in the project root. The `ALLOWED_ORIGINS` value must be a valid JSON array (without outer quotes).
    ```env
    # .env
    OBELISK_ALLOWED_ORIGINS=["http://localhost:3000"]
    OBELISK_LLM_API_KEY="your_api_key_here"
    ```

3.  **Start the development server:**
    The application will automatically load the `.env` file.
    ```sh
    uv run dev
    ```

---

## 4. Testing the Service

The project includes several scripts in the `testing_modules/` directory to validate its functionality.

| Script | Purpose | How to Run (from project root) |
| :--- | :--- | :--- |
| `test_validate.py` | **Low-Level Validation**: Tests the `extractor` and `transformer` logic directly without the web server. | `python testing_modules/test_validate.py` |
| `test_upload_e2e.py` | **Single-Course E2E Test**: Validates the full HTTP flow for one course, including a real LLM call. Requires the server to be running. | `python testing_modules/test_upload_e2e.py` |
| `test_institutional_summary_e2e.py` | **Institutional Summary E2E Test**: Validates the high-level analytics endpoint, including a real LLM call. Requires the server to be running. | `python testing_modules/test_institutional_summary_e2e.py` |

---

## 5. API Endpoint Reference

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/upload` | Upload a class-record `.xlsx` file to start a new ETL job. |
| `GET` | `/jobs` | Get a list of all jobs currently in memory. |
| `GET` | `/jobs/{job_id}` | Get the status and result of a specific ETL job. |
| `GET` | `/analytics/jobs/{job_id}/recommendation` | Get a per-course AI-generated CQI recommendation for a completed job. |
| `POST` | `/analytics/summary` | Get pure data rollups for a given set of course submissions. |
| `POST` | `/analytics/institutional-summary` | Get a high-level, institution-wide CQI summary and AI recommendation. |
| `GET` | `/health` | A simple health check endpoint. |

---

## 6. Known Limitations and Deferred Items

For a detailed list of known implementation gaps, trade-offs, and unresolved client questions, please see [**documentations/KNOWN_LIMITATIONS.md**](./documentations/KNOWN_LIMITATIONS.md).