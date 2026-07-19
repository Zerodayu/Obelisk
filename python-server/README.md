## OBELISK ETL Foundation

Async-first FastAPI ETL service for OBELISK class-record processing.

This README is updated to reflect the new institutional CLO attainment formula.

---

## What's New

- **New CLO Attainment Formula**: The core transformation logic has been refactored to use the official institutional formula (Formula 1A from the OBE Assessment Plan manual). This replaces the previous weighted-category calculation with a simple pooling of all raw scores against all maximum scores for a given CLO.
- **Fixed Institutional Threshold**: The `met_threshold` field is now calculated against a fixed institutional benchmark of **70%**, not the per-course threshold from the workbook.
- **Descriptive CLO Levels**: The `clo_level` field is now a 4-tier descriptive string (`Exceptional`, `Proficient`, `Basic`, `Below Basic`) instead of a number.
- **AI-Powered CQI Recommendations**: A `GET /jobs/{job_id}/recommendation` endpoint provides AI-assisted CQI suggestions based on performance gaps.
- **Configurable CORS**: The server's CORS policy is configurable via environment variables.

---

## Data contract (share this with web app teammate)

**IMPORTANT**: The shape of the `StudentCLOAttainment` object in the final JSON result has changed.

### Final Job Result (`GET /jobs/{job_id}`)

When a job is `completed`, the `result.loaded.attainments` array will contain objects with the following new shape:
```json
{
  "status": "ok",
  "received_records": 150,
  "header": {
    "course_code": "CS101",
    "course_title": "Introduction to Computer Science",
    "section": "A",
    "threshold": 0.6, // The course-specific threshold from the file (for display only)
    "tla_at_exam_weights": null // This is no longer used for calculation
    // ... and other header fields
  },
  "attainments": [
    {
      "student_name": "DOE, JOHN",
      "clo_code": "CLO1",
      
      "tla_pct": 0.88, // Informational breakdown, not used in main calculation
      "at_pct": 0.90,
      "exam_pct": 0.80,
      "output_pct": null,

      "direct_clo_attainment_pct": 0.85, // RENAMED from clo_attainment_pct
      "met_threshold": true, // NOW compares against fixed 70% institutional threshold
      "clo_level": "Exceptional", // CHANGED from integer to 4-tier string
      "formula_version": "..."
    }
  ]
}
```

### CQI Recommendation (`GET /jobs/{job_id}/recommendation`)

This endpoint's output remains the same, but the underlying gap analysis now uses the new `direct_clo_attainment_pct` and the fixed 70% threshold.

---

## API endpoints

- `POST /upload`: Upload a class-record file to start an ETL job.
- `GET /jobs/`: List all job IDs.
- `GET /jobs/{job_id}`: Get the detailed status and result of a specific job.
- `GET /jobs/{job_id}/recommendation`: Get a CQI recommendation for a completed job.
- `GET /health/`: Health check endpoint.

---

## How to run

### Prerequisites

- Python 3.10+
- Poetry (for dependency management)

### Install dependencies

```powershell
poetry install
```

### Environment Variables (Optional)

Create a `.env` file in the project root to configure the service.

```env
# .env

# Comma-separated list of allowed origins for CORS
# Default: "http://localhost:3000,http://127.0.0.1:3000"
OBELISK_ALLOWED_ORIGINS="http://localhost:3000,http://your-webapp-domain.com"
```

### Start the API server

```powershell
poetry run uvicorn app.main:app --reload
```
The server will start on `http://localhost:8000`.

### Test the full pipeline via API

Use the end-to-end test script to upload a file and see the final output with the new formula:
```powershell
python test_upload_e2e.py
```
The script will print the job status and the final JSON result, including the CQI recommendation.

---

## Next recommended follow-ups

- Implement the real LLM API call in `app/analytics/cqi_recommender.py` and set `IS_DEBUG_MODE` to `False`.
- Add unit tests for the analytics module.
- Replace `DummyLoader` with a real persistence layer.
