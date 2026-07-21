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
```json
{
  "status": "ok",
  "received_records": 15,
  "header": { "...same header shape as before..." },
  "attainments": [ "...same attainment shape as before..." ],
  "clo_plo_mapping": [
    {
      "clo_code": "CLO1",
      "plo_code": "PLO1",
      "correlation_strength": 3
    }
  ]
}
```

**Field notes:**
- `direct_clo_attainment_pct` is the number that matters — raw scores
  pooled across ALL assessment types for that student+CLO, per the
  institution's Formula 1A.
- `met_threshold` is checked against a **fixed 70% institutional
  floor**, NOT the course's own `threshold` value.
- `clo_level` is a 4-tier string: `"Exceptional"`, `"Proficient"`,
  `"Basic"`, `"Below Basic"`.
- `clo_plo_mapping` is the **real correlation table** extracted from the
  `COVERPAGE` of the workbook. This is the source of truth for how this
  specific course's CLOs map to PLOs.

### `GET /jobs/{job_id}/recommendation`
Per-course AI gap analysis (still returns a placeholder — real LLM call
not wired up yet).

## Endpoint 2: Institution-wide AI summary — VPAA ONLY

### `POST /analytics/institutional-summary`

> ⚠️ **This endpoint has no internal access control.** Anyone who can
> reach it gets a full institution-wide summary. The webapp MUST verify
> the requester is VPAA before calling this. Do not expose this route
> to the frontend without that check in place first.

**Request body** — the webapp aggregates from the database and sends
one consolidated payload (Python never queries anything itself):

```json
{
  "period": {
    "type": "semester | year",
    "label": "SY 2024-2025, 2nd Semester"
  },
  "submissions": [
    {
      "department": "CITE",
      "program": "BSIT",
      "avp_group": "AVP for Prof. & Technical Educ.",
      "course_code": "...",
      "section": "...",
      "header": { "...same header shape as above..." },
      "attainments": [ "...same attainment shape as above..." ],
      "clo_plo_mapping": [ "...same mapping shape as above..." ]
    }
  ]
}
```

**Response:**
The response contains `department_summary`, `program_summary`, and `avp_group_summary`. Each of these contains a `plos` object showing the rolled-up PLO attainment for that scope, computed using the mappings provided in the request.

```json
{
  "status": "ok",
  "summary": {
    "program_summary": {
      "BSIT": {
        "clos": {
          "CLO1": { "mean_attainment_pct": 0.92, "record_count": 150 }
        },
        "plos": {
          "PLO1": {
            "plo_attainment_direct_only": 0.885,
            "mapped_clos": [
              { "clo_code": "CLO1", "mean_attainment_pct": 0.92, "correlation_strength": 3 }
            ]
          }
        }
      }
    }
  },
  "prompt_used": "string",
  "recommendation": "AI-generated text (currently a placeholder)"
}
```

## What's explicitly NOT this service's job

- Persisting any uploaded data or computed results
- The org-structure reference table (department → AVP group mapping)
- Auth, sessions, roles, permissions — all webapp-side
- PEO rollup (Program Educational Objectives) — this is a higher-level
  concern not yet built.
- Populating the ~23 WIN-OBE form templates — this service provides
  the computed numbers; rendering them into form layouts is
  webapp/frontend work

## Known open items (not resolved yet, don't build around them)

- F18 form conflict (Portfolio Assessment vs. CQI Action Plan) —
  unconfirmed with client
- AQAU's exact role/permissions relative to VPAA — still being
  clarified with the team
- Real LLM API integration — both AI endpoints currently return a
  hardcoded placeholder string (`IS_DEBUG_MODE = True`)
- Credit-unit weighting for PLO attainment (Formula 7B) — currently
  using unweighted average (Formula 7A).
