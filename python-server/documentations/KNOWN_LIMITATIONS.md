# Known Limitations & Deferred Items

This document lists known limitations, design trade-offs, and deferred implementation details for the OBELISK ETL & Analytics Service.

1.  **LLM Integration Status**
    -   **Status**: Implemented (`google-genai` client, Debug/Mock Mode Currently Active by Default)
    -   **Details**: The AI-powered recommendation features are wired to Google's Gemini API (`gemini-3.6-flash` in `app/analytics/cqi_recommender.py`) using the new `google-genai` SDK. By default, `IS_DEBUG_MODE` is set to `True` to provide deterministic mock responses without requiring an active API key or incurring external latency. To activate live LLM generation, set `IS_DEBUG_MODE = False` in `cqi_recommender.py` and supply a valid `OBELISK_LLM_API_KEY` in `.env`.

2.  **Indirect Attainment Ingestion (v2 AUN-OBE Template)**
    -   **Status**: Implemented (Per-Student Direct Rating Recomputation)
    -   **Details**: The AUN-OBE template includes an "Indirect CLO" tab with raw 1–5 Likert survey ratings per student per CLO. The ETL pipeline independently recomputes `indirect_clo_attainment_pct = (rating / 5.0) * 100.0`. Composite (70/30) attainment or survey question breakdown remains downstream in the webapp.

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
