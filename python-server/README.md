## OBELISK ETL Foundation

Async-first FastAPI ETL service for OBELISK class-record processing.

This README is updated to reflect the new institutional CLO attainment formula and PLO rollups from real workbook data.

---

## What's New

- **New CLO Attainment Formula**: The core transformation logic uses the official institutional formula (Formula 1A) by pooling all raw scores for a CLO.
- **Real CLO-PLO Mapping**: The service now extracts the CLO-PLO correlation table directly from the `COVERPAGE` of each uploaded workbook.
- **PLO Attainment Rollup**: The institutional summary endpoint computes PLO attainment by averaging the attainment rates of their mapped CLOs (Formula 7A).
- **Program-Level PLO Average**: A new summary metric (Formula 7C) is now computed, averaging all individual PLO attainment values for a given program.
- **Data Completeness Checks**: The service now calculates and returns data completeness percentages for both CLOs (Rule 1) and PLOs (Rule 3), providing context on data quality without blocking computation.
- **Fixed Institutional Threshold**: The `met_threshold` field is now calculated against a fixed institutional benchmark of **70%**.
- **Descriptive CLO Levels**: The `clo_level` field is now a 4-tier descriptive string (`Exceptional`, `Proficient`, `Basic`, `Below Basic`).
- **AI-Powered CQI Recommendations**: Endpoints are available for both per-course and institution-wide AI-assisted CQI summaries.
- **Configurable CORS**: The server's CORS policy is configurable via environment variables.

---

## Data contract (share this with web app teammate)

**IMPORTANT**: The shape of the final job result and the institutional summary have changed.

### Final Job Result (`GET /jobs/{job_id}`)

The `attainments` objects in the `result.loaded` array now include data completeness fields:
```json
{
  "attainments": [
    {
      "student_name": "DOE, JOHN",
      "clo_code": "CLO1",
      "direct_clo_attainment_pct": 0.85,
      "is_record_complete": true, // NEW: true if student has scores in PRELIM, MIDTERM, and FINAL
      "section_completeness_pct": 0.95, // NEW: % of students in the section with complete records for this CLO
      "rule1_met": true, // NEW: true if section_completeness_pct >= 60%
      // ... and other fields
    }
  ],
  "clo_plo_mapping": [ ... ]
}
```

### Institutional Summary (`POST /analytics/institutional-summary`)

The `plos` object in the summary response now includes data completeness fields:
```json
{
  "program_summary": {
    "BS Information Technology": {
      "program_plo_average": 0.85,
      "clos": {
        "CLO1": { "mean_attainment_pct": 0.92, "record_count": 150, "rule1_met": true }
      },
      "plos": {
        "PLO1": {
          "plo_attainment_direct_only": 0.885,
          "plo_completeness_pct": 1.0, // NEW: % of mapped CLOs that met Rule 1
          "plo_rule3_met": true, // NEW: true if plo_completeness_pct >= 60%
          "mapped_clos": [ ... ]
        }
      }
    }
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

---

## Testing the Service
(This section is unchanged)

---

## Next recommended follow-ups

- Implement the real LLM API call in `app/analytics/cqi_recommender.py` and set `IS_DEBUG_MODE` to `False`.
- Implement weighted cross-course PLO merging (Formula 7C) using `correlation_strength`.
- Implement credit-unit weighting for PLO attainment (Formula 7B).
- Replace `DummyLoader` with a real persistence layer.
