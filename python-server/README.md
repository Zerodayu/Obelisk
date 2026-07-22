## OBELISK ETL Foundation

Async-first FastAPI ETL service for OBELISK class-record processing.

This README is updated to reflect the new institutional CLO attainment formula and PLO rollups from real workbook data.

---

## What's New

- **New CLO Attainment Formula**: The core transformation logic uses the official institutional formula (Formula 1A) by pooling all raw scores for a CLO.
- **Real CLO-PLO Mapping**: The service now extracts the CLO-PLO correlation table directly from the `COVERPAGE` of each uploaded workbook.
- **PLO Attainment Rollup**: The institutional summary endpoint computes PLO attainment by averaging the attainment rates of their mapped CLOs (Formula 7A).
- **Fixed Institutional Threshold**: The `met_threshold` field is now calculated against a fixed institutional benchmark of **70%**.
- **Descriptive CLO Levels**: The `clo_level` field is now a 4-tier descriptive string (`Exceptional`, `Proficient`, `Basic`, `Below Basic`).
- **AI-Powered CQI Recommendations**: Endpoints are available for both per-course and institution-wide AI-assisted CQI summaries.
- **Configurable CORS**: The server's CORS policy is configurable via environment variables.

---

## Data contract (share this with web app teammate)

**IMPORTANT**: The shape of the final job result and the institutional summary have changed.

### Final Job Result (`GET /jobs/{job_id}`)

The `result.loaded` object will now contain a `clo_plo_mapping` field, extracted directly from the workbook:
```json
{
  "status": "ok",
  "received_records": 150,
  "header": { ... },
  "attainments": [ ... ],
  "clo_plo_mapping": [
    { "clo_code": "CLO1", "plo_code": "PLO1", "correlation_strength": 3 },
    { "clo_code": "CLO2", "plo_code": "PLO2", "correlation_strength": 2 }
  ]
}
```
**Note on `correlation_strength`**: This is a real weighting factor (1-3 scale) intended for cross-course PLO merging (Formula 7C). The current PLO computation (Formula 7A) is an unweighted average and does not yet use this field as a weight.

### Institutional Summary (`POST /analytics/institutional-summary`)

The `clos` and `plos` objects in the summary response now use `mean_attainment_pct` to more accurately describe the data.
```json
{
  "program_summary": {
    "BS Information Technology": {
      "total_attainment_records": 300,
      "clos": {
        "CLO1": { "mean_attainment_pct": 0.92, "record_count": 150 },
        "CLO3": { "mean_attainment_pct": 0.85, "record_count": 150 }
      },
      "plos": {
        "PLO1": {
          "plo_attainment_direct_only": 0.885,
          "mapped_clos": [
            { "clo_code": "CLO1", "mean_attainment_pct": 0.92, "correlation_strength": 3 },
            { "clo_code": "CLO3", "mean_attainment_pct": 0.85, "correlation_strength": 2 }
          ]
        }
        // ... other PLOs
      }
    }
    // ... other programs
  }
}
```

---

## API endpoints

- `POST /upload`: Upload a class-record file to start an ETL job.
- `GET /jobs/{job_id}`: Get the detailed status and result of a specific job.
- `GET /jobs/{job_id}/recommendation`: Get a CQI recommendation for a single completed job.
- `POST /analytics/institutional-summary`: Get a high-level CQI summary for the entire institution.
- `GET /health/`: Health check endpoint.

---

## How to run

(This section is unchanged)

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

### Testing the Service

This project includes several scripts to validate its functionality.

#### Low-Level Validation
This script tests the `extractor` and `transformer` logic directly without running the web server. It's useful for quickly checking the core data processing.
```powershell
python test_validate.py
```

#### End-to-End API Tests
These scripts test the live server and require it to be running (`uvicorn app.main:app --reload`).

**1. Single-File Upload and Per-Course CQI**
This test validates the entire flow for a single course: uploading a file, polling the job to completion, and fetching the per-course AI recommendation.
```powershell
python test_upload_e2e.py
```

**2. Multi-File Institutional Summary**
This test validates the institution-wide summary feature. It uploads multiple files to simulate different departments, then assembles and `POST`s the consolidated payload to the analytics endpoint.
```powershell
python test_institutional_summary_e2e.py
```

---

## Next recommended follow-ups

- Implement the real LLM API call in `app/analytics/cqi_recommender.py` and set `IS_DEBUG_MODE` to `False`.
- Implement weighted cross-course PLO merging (Formula 7C) using `correlation_strength`.
- Implement credit-unit weighting for PLO attainment (Formula 7B).
- Replace `DummyLoader` with a real persistence layer.
