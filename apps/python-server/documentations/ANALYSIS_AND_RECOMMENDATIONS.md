# OBELISK Service Analysis & Recommendations

This document summarizes the findings from a review of the OBELISK ETL & Analytics Service, based on its source code and official documentation (`SYSTEM-DESIGN.md`, `FORMULAS.md`, etc.).

Current implementation descriptions were synchronized on October 13, 2026 by
source inspection only. Recommendations are proposals, not completed work or
new security/performance measurements. Historical testing remains in the
[Pre-UAT package](../testing_modules/pre_uat/README.md); the separate
[legacy verification](../testing_modules/old_test/README.md) uses offline mocks.

---

## 1. Security Analysis

### 1.1. Service-to-Service Caller Authentication (Resolved)

-   **Observation**: The service originally trusted all incoming requests unconditionally, delegating all user-level authentication and authorization to the client (the Elysia webapp backend).
-   **Risk**: If the service was exposed on an internal network, unauthorized clients could invoke compute-heavy or sensitive endpoints such as `POST /analytics/institutional-summary`.
-   **Resolution**: An optional shared-secret caller authentication mechanism has been implemented via the `X-Webapp-Secret` header (`OBELISK_WEBAPP_SHARED_SECRET`). When configured, requests missing or failing this check receive `401 Unauthorized` (`UnauthorizedCaller`). User-facing RBAC remains the responsibility of the webapp backend.

### 1.2. File Upload Vulnerabilities

-   **Observation**: The service accepts `.xlsx` file uploads, which are parsed by `openpyxl`.
-   **Risk**: Maliciously crafted Excel files (e.g., using XML entity expansion attacks, or "billion laughs") could exploit vulnerabilities in the parsing library, leading to a Denial of Service (DoS) by consuming excessive memory or CPU, thus tying up a worker.
-   **Recommendation (Medium Priority)**: Keep the `openpyxl` library updated to the latest version to ensure all known security patches are applied. The existing file size limit is a good first-line defense.

### 1.3. Log Content and PII

-   **Observation**: The service uses structured logging, which is excellent. However, detailed error messages and file paths are logged.
-   **Risk**: A bug in an error handler or a change in a logged object could inadvertently cause Personally Identifiable Information (PII) from a class record (e.g., student names) to be written to the logs.
-   **Recommendation (Low Priority)**: Periodically audit logging statements, especially in error-handling blocks, to ensure that raw data from the source files is not leaked into logs. Confirm that the `anonymize_students()` function is used wherever student-level data might be processed for logging or analytics.

---

## 2. Potential Bottlenecks & Performance

### 2.1. Job Queue Durability & Scaling (Resolved / Evolving)

-   **Observation**: The original queue was an in-memory `asyncio.Queue`, which lost all state upon container restart.
-   **Resolution**: The queue uses an environment-prefixed Redis list (`obelisk:<OBELISK_ENV>:job_queue`) and JSON string values (`obelisk:<OBELISK_ENV>:job:*`, stored with `SET`). Worker `BRPOP` calls remove jobs before execution. Pending state survives Python restarts while Redis is retained; already-popped interrupted jobs have no acknowledgement/requeue recovery. Redis restart durability depends on its storage configuration.
-   **Future Consideration**: For full production durability, ensure the Redis container has a persistent data volume or AOF (`--appendonly yes`) enabled in `docker-compose.yml`. For extreme scale, worker execution could be extracted from FastAPI `asyncio.Task` into dedicated worker processes (e.g., Celery, RQ, or ARQ).

### 2.2. Synchronous File I/O

-   **Observation**: The core `openpyxl.load_workbook` function is synchronous and is run in a thread pool via `asyncio.to_thread`.
-   **Risk**: While the use of a thread pool is the correct pattern for handling blocking I/O in an async application, the number of available threads is finite. A high volume of simultaneous, large file uploads could exhaust the thread pool, temporarily blocking all new ETL tasks from starting.
-   **Recommendation**: The current implementation is a good compromise. No immediate action is needed unless performance testing under high load reveals this to be a major bottleneck.

### 2.3. CPU-Bound Transformations

-   **Observation**: The data transformation (`SimpleTransformer`) and aggregation (`institutional_summary.py`) logic is CPU-bound (performing calculations in loops).
-   **Risk**: Due to Python's Global Interpreter Lock (GIL), only one thread can execute Python bytecode at a time in a single process. A very large and complex workbook could monopolize the CPU and block the worker's event loop, reducing the responsiveness of that worker.
-   **Recommendation (Medium Priority)**: If processing very large datasets becomes a requirement, consider moving the most intensive calculations to a separate process pool (`concurrent.futures.ProcessPoolExecutor`). This would allow the work to run on different CPU cores, bypassing the GIL and preventing the main application workers from being blocked.

---

## 3. Overall Design Strengths

The following design choices are significant strengths of the service:

1.  **Pure-Compute Ownership**: The webapp owns domain persistence and user auth/RBAC. Python owns computation, upload files/Redis processing state and optional service-to-service caller-secret validation. These responsibilities can be tested separately.
2.  **Centralized Constants & Formulas**: The use of `etl_const.py` and clear documentation in `CONSTANTS.md` and `FORMULAS.md` is a best practice that makes the system highly maintainable and transparent.
3.  **Structured Error Handling**: The custom `OBELISKError` hierarchy provides structured, machine-readable error details, enabling the client to give clear and specific feedback to the end-user.

---

## 4. Summary of Recommendations

-   **Completed / Implemented**:
    1.  ✅ Implemented shared-secret service-to-service authentication (`X-Webapp-Secret`).
    2.  ✅ Migrated in-memory job queue to durable Redis queue.
-   **Medium Priority**:
    1.  Consider using a `ProcessPoolExecutor` for CPU-bound tasks if performance with large files becomes an issue.
    2.  Keep `openpyxl` and other dependencies updated to mitigate security risks.
    3.  Add volume persistence or AOF to the Redis service in `docker-compose.yml`.
-   **Low Priority**:
    1.  Periodically audit logging to prevent accidental PII leakage.
