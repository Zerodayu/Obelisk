## OBELISK ETL Foundation

Async-first FastAPI ETL service for OBELISK class-record processing.

This README is updated to include the AI/CQI recommendation endpoint and configurable CORS.

---

## What's New

- **AI-Powered CQI Recommendations**: A new endpoint `GET /jobs/{job_id}/recommendation` provides AI-assisted Continuous Quality Improvement suggestions based on student performance gaps. This is currently in a safe, non-production mode using a placeholder response.
- **Configurable CORS**: The server's Cross-Origin Resource Sharing (CORS) policy is now configurable via environment variables to securely allow requests from the web application frontend.

---

## What the service can do now

- Accept uploaded class-record Excel files and queue ETL jobs.
- Extract real raw score records from the template.
- Compute per-student per-CLO attainment objects (`StudentCLOAttainment`).
- **On-demand, generate AI-powered CQI recommendations** for completed jobs.

---

## Data contract (share this with web app teammate)

### Input file dependency

The extractor is tied to the **class-record workbook layout** and expects these sheets:
- Required: `COVERPAGE`, `Database (LECTURE-RES-PRAC)`, `Exam (LECTURE ONLY)`
- Optional: `OUTPUT`

### Final Job Result (`GET /jobs/{job_id}`)

When a job is `completed`, the `result.loaded` field will contain:
```json
{
  "status": "ok",
  "received_records": 150,
  "header": {
    "course_code": "CS101",
    "course_title": "Introduction to Computer Science",
    "section": "A",
    "threshold": 0.75,
    "tla_at_exam_weights": {"TLA": 0.4, "AT": 0.2, "EXAM": 0.4}
    // ... and other header fields
  },
  "attainments": [
    {
      "student_name": "DOE, JOHN",
      "clo_code": "CLO1",
      "clo_attainment_pct": 0.85,
      "met_threshold": true
      // ... and other attainment fields
    }
  ]
}
```

### CQI Recommendation (`GET /jobs/{job_id}/recommendation`)

For a `completed` job, this endpoint returns a CQI analysis:
```json
{
  "course_code": "CS101",
  "status": "ok",
  "gaps": [
    {
      "clo_code": "CLO2",
      "num_students_below_threshold": 2,
      "total_students": 30,
      "attainment_values": [0.45, 0.6],
      "threshold": 0.75
    }
  ],
  "prompt_used": "Course: CS101...",
  "recommendation": "[PLACEHOLDER RESPONSE...]"
}
```
If a job is not yet complete, this endpoint will return a `409 Conflict`. If no students fell below the threshold, `status` will be `no_gaps_found`.

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

# Number of parallel workers to process jobs
# Default: 4
OBELISK_JOB_WORKER_COUNT=4
```

### Start the API server

```powershell
poetry run uvicorn app.main:app --reload
```
The server will start on `http://localhost:8000`.

### Test the full pipeline via API

#### 1. Upload a class-record file

```powershell
# Using curl
curl -X POST "http://localhost:8000/upload" -F "file=@path\to\your\E-classrecord(LECTURE ONLY).xlsx"

# Using the test script
python test_upload_e2e.py
```
The response will include a `job_id`.

#### 2. Check job status

Poll `GET http://localhost:8000/jobs/{job_id}` until the status is `completed`.

#### 3. Get CQI Recommendation

Once the job is complete, call the new endpoint:
```powershell
curl "http://localhost:8000/jobs/{job_id}/recommendation"
```

### Verify CORS Configuration

To test that the CORS configuration is working correctly for a webapp running on `http://localhost:3000`, use this `curl` command to simulate a browser's preflight request:

```powershell
# On Windows PowerShell, use curl.exe to avoid the alias
curl.exe -i -X OPTIONS http://localhost:8000/upload -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: POST"
```

A successful response will include the header `access-control-allow-origin: http://localhost:3000`.

---

## Next recommended follow-ups

- Implement the real LLM API call in `app/analytics/cqi_recommender.py` and set `IS_DEBUG_MODE` to `False`.
- Add unit tests for the analytics module.
- Replace `DummyLoader` with a real persistence layer.
