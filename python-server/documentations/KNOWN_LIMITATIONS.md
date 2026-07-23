# Known Limitations & Deferred Items

This document lists known limitations, design trade-offs, and deferred implementation details for the OBELISK ETL & Analytics Service.

1.  **No Real LLM Integration**
    -   **Status**: Not Implemented
    -   **Details**: The AI-powered recommendation features (`GET /jobs/{job_id}/recommendation` and `POST /analytics/institutional-summary`) are currently hardcoded to return a static placeholder response. The `IS_DEBUG_MODE` flag in `app/analytics/cqi_recommender.py` is globally set to `True`, preventing any real outbound API calls. A real integration with an LLM provider (e.g., Gemini, OpenAI) is required to generate dynamic insights.

2.  **Indirect Attainment Not Computed**
    -   **Status**: Not Implemented
    -   **Details**: The service only computes **Direct Attainment** based on student scores from class records. It does not compute the 30% "Indirect Attainment" portion of the composite formulas (Formula 13A/13B), as there is currently no data pipeline for ingesting the required survey data (F12 CLO Perception Survey, F17 Exit Survey). Per the OBE Assessment Plan, reporting Direct Attainment alone is the correct interim behavior until survey data becomes available.

3.  **Correlation Strength Not Used as a Weight**
    -   **Status**: Resolved / Implemented as Metadata Only
    -   **Details**: An earlier informal client description suggested `correlation_strength` might need to weight PLO calculations. However, the OBE Assessment Plan's written formula reference (§3.5.7) was directly reviewed and confirmed that `correlation_strength` is **never** specified as a weight anywhere in the formal formulas — only credit units (Formula 7B, currently unused) are ever described as a weighting mechanism. Formula 7A is confirmed unweighted, matching the current implementation. `correlation_strength` is retained as metadata for reference but is not expected to become a weight based on the written source material. This is considered resolved unless the client explicitly says otherwise in a future clarification.

4.  **Data Completeness (Rule 1) Interpretive Gap**
    -   **Status**: Implemented, with Known Issue
    -   **Details**: The data completeness check (Rule 1 / §3.6) correctly flags a student's CLO record as incomplete if they do not have a score in all three grading periods (Prelim, Midterm, Final). However, this can produce a false negative (`rule1_met: false`) for courses where a CLO is *intentionally* not assessed in all three periods (e.g., a CLO that only applies to Final-term projects). This has been flagged for client clarification.

5.  **Unused Database Scaffolding**
    -   **Status**: Implemented, but Unused
    -   **Details**: The `app/database/__init__.py` file contains SQLAlchemy code for setting up a database engine and session. As this service operates as a pure compute engine with no direct database access, this code is currently unused. It has been kept in place pending a final decision with the webapp team on whether it can be safely removed.
