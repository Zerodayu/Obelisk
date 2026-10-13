# Known Limitations & Deferred Items

This document lists known limitations, design trade-offs, and deferred implementation details for the OBELISK ETL & Analytics Service.

1.  **LLM Integration Status**
    -   **Status**: Implemented (`google-genai` client, Live Multi-Key Gemini API Enabled by Default)
    -   **Details**: The source default in `app/core/config.py` is `gemini-3.6-flash`, overridden by `OBELISK_LLM_MODEL` from root env/runtime configuration. `IS_DEBUG_MODE=False` enables the real `google-genai` path with sequential key failover. It is separate from logging `OBELISK_DEBUG`. Missing valid keys raise `NotImplementedError` (HTTP 501 at AI routes); there is no automatic mock fallback. Course no-gap results avoid the provider. Course output is validated JSON encoded as a string; institutional output may be nonempty prose. The legacy runner patches mock mode in memory. See [INTEGRATION.md](INTEGRATION.md).

2.  **Indirect Attainment Ingestion (v2 AUN-OBE Template)**
    -   **Status**: Implemented (Per-Student Indirect Rating and 70/30 Composite Recomputation)
    -   **Details**: The AUN-OBE template includes an "Indirect CLO" tab with raw 1–5 Likert survey ratings per student per CLO. The ETL pipeline independently recomputes `indirect_clo_attainment_pct = (rating / 5.0) * 100.0`, then computes and rounds the `composite_clo_attainment_pct` using the 70/30 formula. Survey question breakdown is not exposed by this service.

3.  **CLO-PLO Correlation Mapping**
    -   **Status**: Retired from Python Server (Moved to Webapp Backend)
    -   **Details**: In the v2 AUN-OBE template, CLO-PLO correlation matrices are no longer read or validated from Excel spreadsheets. The webapp backend is the sole source of truth for curriculum mapping via Prisma and `curriculum_map`. The ETL pipeline discovers CLOs dynamically and reports their attainment as-is, leaving reconciliation to the webapp.

4.  **No Granular Assessment Breakdown (TLA/AT/EXAM/OUTPUT)**
    -   **Status**: Layout Decision in v2 Template
    -   **Details**: In the AUN-OBE template, scores arrive pre-summed into Prelim, Midterm, and Final subtotals per CLO. Individual activity rows (quizzes, exercises, specific exam items) are not present in this template. Consequently, the informational `tla_pct`, `at_pct`, `exam_pct`, and `output_pct` fields are returned as `null`.

5.  **Data Completeness (Rule 1) Interpretive Gap**
    -   **Status**: Implemented, with Known Clarification Item
    -   **Details**: The data completeness check (Rule 1 / §3.6) flags a student's CLO record as incomplete if they do not have a score in all three grading periods (Prelim, Midterm, Final). For courses where a CLO is intentionally assessed in fewer than three periods (e.g., a capstone CLO evaluated only in Finals), this flags `is_record_complete: false`. This remains the standard until institution-level criteria for period-specific CLOs are finalized.

6.  **Unused Database Scaffolding**
    -   **Status**: Implemented, but Unused
    -   **Details**: The `app/database/__init__.py` file contains SQLAlchemy scaffolding. As this service operates as a pure compute engine with no direct database access, this code is unused and retained only for backwards repository compatibility.

7.  **Asynchronous Capacity, Concurrency Limits & Stress Performance**
    -   **Status**: Historical documentary figures, not current verified benchmarks. The present script is `testing_modules/old_test/test_stress_async.py` and requires `--live`. It was not executed in the October 13 legacy repair or this documentation audit.
    -   **Provenance limitation**: The original date/build/raw artifacts for the figures below are not recorded here. They are retained verbatim rather than assigned invented provenance. [Pre-UAT performance documentation](../testing_modules/pre_uat/PERFORMANCE_README.md) does not accept them as executed PT evidence; its performance workloads remain blocked/skipped in the preserved package.
    -   **Historical Capacity Profile (unverified attribution)**:
        -   **Baseline ASGI Concurrency (`GET /health/`, `GET /jobs`)**: Achieves ~91 RPS at 25 concurrent connections (mean latency ~133 ms, p95 ~344 ms). Scales to 50 concurrent connections with 100% success rate (~23 RPS, mean latency ~1.7 s).
        -   **CPU-Bound Analytics Rollups (`POST /analytics/summary`)**: Handles ~42 RPS under 25–30 concurrent connections (mean latency ~294 ms, p95 ~516 ms). Because Python executes bytecode under the GIL in a single process, high-volume multi-submission mathematical rollups are CPU-bound; horizontal scaling (e.g. multi-process Uvicorn or container replicas) is required for higher aggregate throughput.
        -   **File Ingestion Pipeline (`POST /upload` -> Redis Queue)**:
            -   **Disk Write Concurrency Throttling**: Regulated by `_upload_write_semaphore = asyncio.Semaphore(5)` based on `MAX_CONCURRENT_UPLOAD_WRITES: int = 5` in `app/core/config.py`. Prevents disk I/O thrashing during simultaneous multi-file uploads. Under 20 concurrent uploads, achieves ~3.4–3.5 workbooks/sec (mean response latency ~3.8 s, p95 ~5.3 s).
            -   **Queue Saturation Boundary**: Bounded by `JOB_QUEUE_MAXSIZE: int = 200`. Ingestion bursts that cause unconsumed Redis queue depth to exceed 200 reject excess requests with HTTP 503 `QueueOverloadedError`.
            -   **Background Processing Throughput**: Bounded by `JOB_WORKER_COUNT: int = 4` parallel background worker coroutines. Excel extraction (`openpyxl`) executes off the event loop via `asyncio.to_thread` using Python's default thread pool.
        -   **AI Recommendations (`GET /analytics/jobs/{job_id}/recommendation`)**: Concurrency is limited by external Google Gemini rate limits (RPM/TPM on `gemini-3.5-flash-lite`). Sequentially fails over through `OBELISK_LLM_API_KEYS`; exhausts with structured error when all keys exceed rate quotas.
    -   **Recommended Configuration Scaling (`app/core/config.py`)**:
        -   These are historical tuning suggestions, not verified capacity or deployment recommendations for the current build.
        -   For term-end high-volume batch uploads: increase `JOB_WORKER_COUNT` (e.g., 8–16) and `JOB_QUEUE_MAXSIZE` (e.g., 500–1000).
        -   For fast NVMe storage environments: increase `MAX_CONCURRENT_UPLOAD_WRITES` (e.g., 10–20).

8. **Legacy offline verification boundaries**
    - The [legacy README](../testing_modules/old_test/README.md) records the October 13 repair run: 50 passing unittest cases and two passing standalone checks. Mocked Gemini/client failures, mocked Redis/workers and in-process API requests do not verify real provider model availability, upload/Redis operation, AI accuracy or performance. Live scripts are excluded by default and require `--live`; `requests` is an undeclared optional live-upload dependency, and the scripts do not send shared-secret headers.

9. **Upload and queue lifecycle**
    - Upload files and JSON job state are stored for processing; there is no automatic completed-job file cleanup or processing timeout in `worker.py`. Redis uses an environment-prefixed list and JSON string keys, not hashes. `BRPOP` removes an item before processing; there is no acknowledgement/requeue mechanism for interrupted running jobs. Durability across Redis restarts depends on Redis storage configuration. These are implementation limitations, not newly executed failure results.

10. **Cross-submission aggregation and institutional policy review**
    - Group rollups consolidate bare CLO codes across submissions and use the first eligible record's `rule1_met` for a group's CLO completeness flag. The retained PLO field name `plo_attainment_direct_only` can carry composite-based means. Whether those grouping/completeness semantics match intended institutional policy needs manual review; offline success does not certify it. `CourseSubmission`/`Period` also use default extra-field ignoring rather than the new-schema `extra="forbid"` convention. This audit changed neither implementation nor policy.
