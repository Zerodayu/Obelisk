## OBELISK ETL Foundation

Async-first FastAPI ETL service for OBELISK class-record processing.

This README is updated to reflect the new institutional CLO attainment formula and PLO rollups from real workbook data.

---

## What's New

- **New CLO Attainment Formula**: The core transformation logic uses the official institutional formula (Formula 1A) by pooling all raw scores for a CLO.
- **Real CLO-PLO Mapping**: The service now extracts the CLO-PLO correlation table directly from the `COVERPAGE` of each uploaded workbook, replacing the previous hardcoded fixture.
- **PLO Attainment Rollup**: The institutional summary endpoint computes PLO attainment by averaging the attainment rates of their mapped CLOs (Formula 7A), using the real mapping data from each file.
- **Fixed Institutional Threshold**: The `met_threshold` field is now calculated against a fixed institutional benchmark of **70%**.
- **Descriptive CLO Levels**: The `clo_level` field is now a 4-tier descriptive string (`Exceptional`, `Proficient`, `Basic`, `Below Basic`).
- **AI-Powered CQI Recommendations**: Endpoints are available for both per-course and institution-wide AI-assisted CQI summaries.
- **Configurable CORS**: The server's CORS policy is configurable via environment variables.

---

## Data contract (share this with web app teammate)

**IMPORTANT**: The shape of the final job result and the institutional summary have changed.

### Final Job Result (`GET /jobs/{job_id}`)

When a job is `completed`, the `result.loaded` object will now contain a `clo_plo_mapping` field, extracted directly from the workbook:
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

### Institutional Summary (`POST /analytics/institutional-summary`)

The payload for this endpoint now requires the `clo_plo_mapping` for each submission. The `plos` section in the response now includes `correlation_strength` instead of the old `ipd_stage`.
```json
{
  "program_summary": {
    "BS Information Technology": {
      "total_attainment_records": 300,
      "clos": { ... },
      "plos": {
        "PLO1": {
          "plo_attainment_direct_only": 0.885,
          "mapped_clos": [
            { "clo_code": "CLO1", "attainment_rate": 0.92, "correlation_strength": 3 },
            { "clo_code": "CLO3", "attainment_rate": 0.85, "correlation_strength": 2 }
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

### Test the full pipeline via API

Use the end-to-end test scripts to validate the full functionality:
```powershell
# Test the single-file upload and per-course recommendation
python test_upload_e2e.py

# Test the multi-file institutional summary and PLO rollup
python test_institutional_summary_e2e.py
```

---

## Next recommended follow-ups

- Implement the real LLM API call in `app/analytics/cqi_recommender.py` and set `IS_DEBUG_MODE` to `False`.
- Implement credit-unit weighting for PLO attainment (Formula 7B).
- Replace `DummyLoader` with a real persistence layer.
