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

## Endpoint 1: Per-course upload & attainment

### `POST /upload`
Upload one class-record `.xlsx` file.

**Response (202):**
```json
{ "job_id": "uuid-string", "status": "queued" }
```

### `GET /jobs/{job_id}`
Poll until `status` is `"completed"` or `"failed"`. The `result.loaded` object contains all computed data for one course section.

### `GET /analytics/jobs/{job_id}/recommendation`
Per-course AI gap analysis (VPAA-only, currently returns a placeholder).

---

## Endpoint 2: Institutional & Program-Level Analytics

This group of endpoints accepts a consolidated payload of multiple course submissions to perform higher-level analysis.

### `POST /analytics/summary` (For Dean, Program Head, AVP dashboards)

> ✅ **This endpoint is safe for any role.** It performs pure data aggregation and **never** triggers an AI/LLM call.

**Request body:**
The webapp sends a payload containing a list of course submissions. The scope of the data (e.g., one department's courses vs. the whole institution) is determined by what the webapp chooses to include in the `submissions` list based on the user's role.
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

**Response:**
Returns a dictionary containing the rolled-up data summaries.
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

**Response:**
Returns the same summary object as `/analytics/summary`, but with three additional fields for the AI-generated analysis.
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
(This section is unchanged)
