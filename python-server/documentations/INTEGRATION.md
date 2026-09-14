# OBELISK Python ETL Server — Integration Contract

This document defines the interface between the webapp/backend and the
Python ETL server. Read this before calling any endpoint on this service.

## Architectural boundaries (read this first)

This service is a **pure compute engine**. It has two hard boundaries
that will not change without a real conversation first:

1. **No database access.** This service never reads from or writes to
   the database. It receives data via HTTP request body, computes
   something, and returns JSON. Nothing is persisted here — the job
   queue is in-memory only and is wiped on every restart.

2. **No authentication or authorization.** This service trusts every
   request it receives. The webapp backend is responsible for verifying
   the requester is and what they're allowed to see BEFORE calling this
   service.

### Optional: Webapp Shared-Secret Auth

This service can optionally enforce a simple shared-secret caller check
using the `X-Webapp-Secret` header. It is **disabled by default** — if
`WEBAPP_SHARED_SECRET` is unset or empty, the service behaves exactly
as it does today and trusts every request.

**To enable it:**
1. Set `WEBAPP_SHARED_SECRET` on the python-server to a long, random
   secret value.
2. Have the webapp backend send that exact same value in an
   `X-Webapp-Secret` header on every request it makes to this service,
   including `POST /upload`, `GET /jobs/{job_id}`, and `/analytics/*`.

**If enabled** and the header is missing or does not match, the
service returns `401 Unauthorized` with a structured error payload
(`error_type: "UnauthorizedCaller"`).

**This does not replace real end-user authentication or
authorization.** That responsibility still belongs entirely to the
webapp backend, per the boundary above. The shared secret only
verifies that the *caller* is the webapp backend itself — not which
end user initiated the request.

**Example:**
```
# python-server .env
WEBAPP_SHARED_SECRET=your-long-random-secret
```
```
# webapp backend — header on every outgoing request
X-Webapp-Secret: your-long-random-secret
```

## Endpoint 1: Per-course upload & attainment

### `POST /upload`
Upload one class-record `.xlsx` file.

**Response (202):**
```json
{ "job_id": "uuid-string", "status": "queued" }
```

### `GET /jobs`
Returns a list of all job objects currently in memory.

### `GET /jobs/{job_id}`
Poll until `status` is `"completed"` or `"failed"`.

**Response (200):**
A single job object with the following structure:
```json
{
  "job_id": "uuid-string",
  "type": "etl",
  "status": "completed",
  "payload": { "file_path": "...", "original_filename": "..." },
  "created_at": "2023-10-27T10:00:00.000Z",
  "updated_at": "2023-10-27T10:00:05.000Z",
  "error": null,
  "result": {
    "loaded": {
      "header": { ... },
      "attainments": [ ... ],
      "clo_plo_mapping": [ ... ]
    }
  }
}
```

### `result.loaded.attainments[]` row shape

Each item inside `result.loaded.attainments` is a `StudentCLOAttainment` row. The overall JSON envelope is unchanged; this is an additive row-level extension only.

The new field exists so the caller can understand why a CLO row was intentionally skipped during computation:

- `excluded_reason = null` → the CLO was computed normally
- `excluded_reason = "no_plo_mapping"` → the CLO had no valid non-zero PLO mapping in the workbook's CLO-PLO table, so the service did not compute attainment for it

When a row is excluded for this reason, the attainment fields are returned as `null` so consumers can safely ignore them without treating the row as a failure.

```json
{
  "student_id": "...",
  "student_name": "...",
  "clo_code": "CLO1",
  "direct_clo_attainment_pct": 0.7059,
  "met_threshold": true,
  "clo_level": "Proficient",
  "is_record_complete": true,
  "section_completeness_pct": 1.0,
  "rule1_met": true,
  "excluded_reason": null
}
```

If a CLO has no valid PLO mapping in the workbook's CLO-PLO table, the same row shape is returned with:

```json
{
  "excluded_reason": "no_plo_mapping",
  "direct_clo_attainment_pct": null,
  "met_threshold": null,
  "clo_level": null,
  "is_record_complete": null,
  "section_completeness_pct": null,
  "rule1_met": null
}
```

**If `status` is `"failed"`:**
The `error` field will contain a structured JSON object with details about the failure. The webapp should parse this object to display a user-friendly error message.

`excluded_reason == "no_plo_mapping"` is not an error. It means the row was excluded by design because the workbook's CLO-PLO table did not contain any valid non-zero mapping for that CLO.

**Example Structured Error (`MissingWorksheet`):**
```json
{
  "error_type": "MissingWorksheet",
  "message": "Missing required worksheet: 'Database (LECTURE-RES-PRAC)'.",
  "details": {
    "expected_sheet_name": "Database (LECTURE-RES-PRAC)",
    "available_sheets": [
      "COVERPAGE",
      "Exam (LECTURE ONLY)",
      "OUTPUT"
    ]
  }
}
```

**Example Structured Error (`UnsupportedCourseType`):**
```json
{
  "error_type": "UnsupportedCourseType",
  "message": "Course type 'RESEARCH' is not yet supported. Only LECTURE course records can be processed at this time.",
  "details": {
    "course_type": "RESEARCH",
    "supported_types": ["LECTURE"]
  }
}
```

### `GET /analytics/jobs/{job_id}/recommendation`
Per-course AI gap analysis. Triggers a real LLM call.

---

## Endpoint 2: Institutional & Program-Level Analytics

This group of endpoints accepts a consolidated payload of multiple course submissions to perform higher-level analysis.

### `POST /analytics/summary` (For Dean, Program Head, AVP dashboards)

> ✅ **This endpoint is safe for any role.** It performs pure data aggregation and **never** triggers an AI/LLM call.

**Request body:**
```json
{
  "period": { "type": "semester", "label": "SY 2024-2025, 2nd Sem" },
  "submissions": [
    {
      "department": "CITE",
      "program": "BSIT",
      "header": { ... },
      "attainments": [ ... ],
      "clo_plo_mapping": [ ... ]
    }
  ]
}
```

The `attainments` arrays forwarded in each submission may contain rows with `excluded_reason = "no_plo_mapping"`. Aggregators should ignore those rows when computing CLO/PLO summaries.

**Response:**
```json
{
  "period": { ... },
  "department_summary": { ... },
  "program_summary": { ... },
  "avp_group_summary": { ... },
  "worst_performing_clos": [ ... ]
}
```

### `POST /analytics/institutional-summary` (VPAA ONLY)

> ⚠️ **This endpoint has no internal access control.** The webapp MUST verify the requester is VPAA before calling this. It always triggers an AI/LLM call.

**Request body:**
Same as `/analytics/summary`, but the webapp should always send the full set of institutional data.

The same `attainments[]` row extension applies here as well; it does not change the top-level payload contract.

**Response:**
```json
{
  "summary": { ... },
  "status": "ok",
  "prompt_used": "The full text prompt sent to the LLM...",
  "recommendation": "The AI-generated text response..."
}
```
---
## Known open items
- **Form F18 Naming Conflict**: Form F18 is labeled "Portfolio Assessment Record" in the OBE Assessment Plan, but is used for CQI steps (Root Cause Analysis, Action Plan, Implementation) in workflow documents. A newer formula reference uses F23 for the CQI Action Plan specifically. This is pending client clarification.
- **AQAU Access Level**: It is still undefined whether the AQAU role should have the same access to the AI-generated institutional summary as the VPAA, or a different view.
- **Rule 1 Interpretive Gap**: The data completeness check (Rule 1) will flag a CLO as incomplete if it is not assessed in all three grading periods, even if this is by design. This can affect the display of completeness percentages and is pending client clarification.
- **Portfolio Assessment Track**: It has not yet been confirmed if any current programs use a portfolio-based assessment track instead of an exam-based one, which would require different handling per §3.4 of the OBE Assessment Plan.