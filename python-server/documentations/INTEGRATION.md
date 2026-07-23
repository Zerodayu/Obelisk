# OBELISK Python ETL Server — Integration Contract

This document defines the interface between the webapp/backend and the
Python ETL server. Read this before calling any endpoint on this service.

## Architectural boundaries (read this first)

This service is a **pure compute engine**. It has two hard boundaries
that will not change without a real conversation first:

1. **No database access.** This service never reads from or writes to
   the database. It receives data via HTTP request body, computes
   something, and returns JSON. Nothing is persisted here — the job
   queue is in-memory only and is wiped on every restart. If you need
   historical data (past uploads, trend analysis, org structure), that
   lives in your database, not here.

2. **No authentication or authorization.** This service trusts every
   request it receives. It does not know about user accounts, roles,
   or sessions. **The webapp backend is responsible for verifying who
   the requester is and what they're allowed to see BEFORE calling this
   service.** This matters most for the institutional-summary endpoint
   below — see the warning there.

## Role → data scope mapping

Per the JMCFI org chart, access is hierarchical. The webapp decides
what data to send Python based on the requester's role — Python never
sees or reasons about roles itself.

| Role | Sees |
|---|---|
| Faculty | one course/section |
| Program Head | one program |
| Dean | one department |
| AVP | one AVP group (cluster of departments — see org chart) |
| VPAA | whole institution — **only role allowed to trigger AI analysis** |

## Endpoint 1: Per-course upload & attainment

### `POST /upload`
Upload one class-record `.xlsx` file (multipart/form-data, field name `file`).

**Response (202):**
```json
{ "job_id": "uuid-string", "status": "queued" }
```

### `GET /jobs/{job_id}`
Poll until `status` is `"completed"` or `"failed"`.

**Response, when completed, `result.loaded` shape:**
The `attainments` array now includes completeness fields.
```json
{
  "status": "ok",
  "received_records": 15,
  "header": { "...same header shape as before..." },
  "attainments": [
    {
      "student_id": "string | null",
      "student_name": "string",
      "clo_code": "CLO1",
      "direct_clo_attainment_pct": 0.705,
      "is_record_complete": true,
      "section_completeness_pct": 0.95,
      "rule1_met": true
    }
  ],
  "clo_plo_mapping": [ ... ]
}
```

**Field notes:**
- `is_record_complete` (Rule 1) is true if a student has scores for a given CLO in all three periods (Prelim, Midterm, Final).
- `section_completeness_pct` is the percentage of students in the course who have a complete record for that CLO.
- `rule1_met` is true if `section_completeness_pct` is >= 60%.

### `GET /jobs/{job_id}/recommendation`
Per-course AI gap analysis.

## Endpoint 2: Institution-wide AI summary — VPAA ONLY

### `POST /analytics/institutional-summary`

> ⚠️ **This endpoint has no internal access control.** The webapp MUST verify the requester is VPAA before calling this.

**Request body:**
The `submissions` payload must now include the `attainments` objects with their new completeness fields.

**Response:**
The `plos` object in the summary now includes completeness fields.
```json
{
  "status": "ok",
  "summary": {
    "program_summary": {
      "BSIT": {
        "program_plo_average": 0.85,
        "clos": {
          "CLO1": { "mean_attainment_pct": 0.92, "record_count": 150, "rule1_met": true }
        },
        "plos": {
          "PLO1": {
            "plo_attainment_direct_only": 0.885,
            "plo_completeness_pct": 1.0,
            "plo_rule3_met": true,
            "mapped_clos": [ ... ]
          }
        }
      }
    }
  },
  "prompt_used": "string",
  "recommendation": "AI-generated text (currently a placeholder)"
}
```
**Field notes:**
- `plo_completeness_pct` (Rule 3) is the percentage of a PLO's mapped CLOs that met the Rule 1 completeness standard.
- `plo_rule3_met` is true if `plo_completeness_pct` is >= 60%.

## What's explicitly NOT this service's job
(This section is unchanged)

## Known open items (not resolved yet, don't build around them)
(This section is unchanged)
