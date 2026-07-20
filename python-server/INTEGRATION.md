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
  "header": {
    "course_code": "string | null",
    "course_title": "string | null",
    "course_type": "LECTURE",
    "section": "string | null",
    "semester_year": "string",
    "instructor_name": "string | null",
    "no_of_students": 3,
    "threshold": 0.6,
    "grading_system": "60-40",
    "workbook_configured_weights_unused": {
      "TLA": 0.4, "AT": 0.2, "EXAM": 0.4
    }
  },
  "attainments": [
    {
      "student_id": "string | null",
      "student_name": "string",
      "clo_code": "CLO1",
      "tla_pct": 0.3,
      "at_pct": null,
      "exam_pct": 0.74,
      "output_pct": 1.0,
      "direct_clo_attainment_pct": 0.7058823529411765,
      "met_threshold": true,
      "clo_level": "Proficient",
      "formula_version": "861946172e4a"
    }
  ]
}
```

**Field notes:**
- `direct_clo_attainment_pct` is the number that matters — raw scores
  pooled across ALL assessment types for that student+CLO, per the
  institution's Formula 1A. Not a weighted blend of categories.
- `tla_pct` / `at_pct` / `exam_pct` / `output_pct` are informational
  breakdowns only — they do NOT feed into `direct_clo_attainment_pct`.
  Fine to display, don't use them to recompute anything.
- `met_threshold` is checked against a **fixed 70% institutional
  floor**, NOT the course's own `threshold` value (which is often 60%
  in practice). Both numbers are returned — `header.threshold` is
  purely for transparency/display ("course configured at 60%,
  institutional floor is 70%").
- `clo_level` is a string: `"Exceptional"` (≥85%) / `"Proficient"`
  (70–84%) / `"Basic"` (60–69%) / `"Below Basic"` (<60%). Not an int.
- `workbook_configured_weights_unused` in the header is dead data —
  extracted from the workbook for diagnostic display only, never used
  in any calculation. Don't build logic around it.

### `GET /jobs/{job_id}/recommendation`
Per-course AI gap analysis (still returns a placeholder — real LLM call
not wired up yet). Same trust model as below — gate this appropriately
if it's ever exposed beyond Faculty/Program Head level.

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
      "attainments": [ "...same attainment shape as above..." ]
    }
  ]
}
```

Note: `period.type` is intentionally loose (semester vs. year) since
the client hasn't finalized which granularity applies — don't hardcode
either assumption on your side yet either.

**Response:**
```json
{
  "status": "ok",
  "summary": {
    "period": { "...": "..." },
    "department_summary": { "...rollup per department..." },
    "program_summary": { "...rollup per program..." },
    "avp_group_summary": { "...rollup per AVP group..." },
    "worst_performing_clos": [ "...top 5 worst across all levels..." ]
  },
  "prompt_used": "string",
  "recommendation": "AI-generated text (currently a placeholder)"
}
```

**Important:** this endpoint always computes the FULL institution-wide
picture — VPAA drilling into one AVP group or department in the UI is
a frontend navigation feature into this same response's
`department_summary`/`avp_group_summary` breakdowns, NOT a separate
scoped API call. Don't build a "send me just Health Sciences" request
mode — it doesn't exist and isn't planned.

## What's explicitly NOT this service's job

- Persisting any uploaded data or computed results
- The org-structure reference table (department → AVP group mapping)
- Auth, sessions, roles, permissions — all webapp-side
- PLO rollup beyond what's shown above — CLO-to-PLO/PEO mapping
  structures are a separate, larger concern not yet built
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