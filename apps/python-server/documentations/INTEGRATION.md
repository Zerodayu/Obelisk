# OBELISK Python ETL Server — Integration Contract

This document defines the interface between the webapp/backend and the
Python ETL server. Read this before calling any endpoint on this service.

## Architectural boundaries (read this first)

This service is a **pure compute engine**. It has two hard boundaries
that will not change without a real conversation first:

1. **No database access.** This service never reads from or writes to
   the database. It receives data via HTTP request body, computes
   something, and returns JSON. Background jobs and queue state are
   managed in Redis, but no application domain data is persisted here.

2. **No authentication or authorization.** This service trusts every
   request it receives. The webapp backend is responsible for verifying
   who the requester is and what they're allowed to see BEFORE calling this
   service.

### Optional: Webapp Shared-Secret Auth

This service can optionally enforce a simple shared-secret caller check
using the `X-Webapp-Secret` header. It is **disabled by default** — if
`OBELISK_WEBAPP_SHARED_SECRET` is unset or empty, the service behaves
and trusts every request.

**To enable it:**
1. Set `OBELISK_WEBAPP_SHARED_SECRET` on the python-server to a long, random
   secret value.
2. Have the webapp backend send that exact same value in an
   `X-Webapp-Secret` header on every request it makes to this service,
   including `POST /upload`, `GET /jobs/{job_id}`, and `/analytics/*`.

**If enabled** and the header is missing or does not match, the
service returns `401 Unauthorized` with a structured error payload
(`error_type: "UnauthorizedCaller"`).

---

## Template Format & CLO Discovery (v2 AUN-OBE Template)

1. **Worksheets**: The upload must be in the AUN-OBE template format containing at least `"Direct CLO"` and `"Indirect CLO"` sheets, with their respective marker titles in `A1`. Older templates (e.g. `Database`, `Exam`, `COVERPAGE`) fail immediately with structured `MissingWorksheet` or `InvalidTemplate` errors.
2. **Dynamic CLOs**: CLO blocks are discovered dynamically (scanning until a blank cell). The number of CLOs is not fixed.
3. **CLO-PLO Mapping Retired**: python-server no longer reads or enforces CLO-PLO mappings from Excel. Mapping is managed solely in the webapp backend (`curriculum_map` / Prisma). `result.loaded.clo_plo_mapping` is always `[]`.
4. **Independent Recomputation**: Direct attainment is computed from the 6 raw score/max cells ($\frac{\text{Prelim}+\text{Midterm}+\text{Final}}{\text{Prelim Max}+\text{Midterm Max}+\text{Final Max}}$). Indirect attainment is recomputed from raw Likert rating as $(\frac{\text{Rating}}{5.0}) \times 100$. Excel's formula columns are ignored.

---

## Endpoint 1: Per-course upload & attainment

### `POST /upload`
Upload one class-record `.xlsx` file.

**Response (202):**
```json
{ "job_id": "uuid-string", "status": "queued" }
```

### `GET /jobs`
Returns a list of all job objects currently tracked in Redis.

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
  "created_at": "2026-09-26T10:00:00.000Z",
  "updated_at": "2026-09-26T10:00:05.000Z",
  "error": null,
  "result": {
    "loaded": {
      "header": {
        "course_code": "GE 1",
        "course_title": "Understanding the Self",
        "course_type": "LECTURE",
        "section": "A",
        "semester_year": "SY 2025-2026, 1st Sem",
        "instructor_name": "Instructor Name",
        "no_of_students": 15,
        "threshold": 0.70,
        "grading_system": null,
        "workbook_configured_weights_unused": null
      },
      "attainments": [ ... ],
      "clo_plo_mapping": []
    }
  }
}
```

### `result.loaded.attainments[]` row shape

Each item inside `result.loaded.attainments` is a `StudentCLOAttainment` row:

```json
{
  "student_id": "2024-00123",
  "student_name": "Doe, Jane",
  "clo_code": "CLO1",
  "tla_pct": null,
  "at_pct": null,
  "exam_pct": null,
  "output_pct": null,
  "direct_clo_attainment_pct": 0.8667,
  "indirect_clo_attainment_pct": 80.0,
  "met_threshold": true,
  "clo_level": "Exceptional",
  "formula_version": "0338c8b0a31d",
  "is_record_complete": true,
  "section_completeness_pct": 1.0,
  "rule1_met": true,
  "excluded_reason": null
}
```

#### Field Notes for the Webapp Consumer:
- **`direct_clo_attainment_pct`**: Ratio `[0.0, 1.0+]` recomputed from raw Prelim/Midterm/Final score and max sums.
- **`indirect_clo_attainment_pct`**: Percentage `[0.0, 100.0]` recomputed from raw Likert Rating: `(rating / 5.0) * 100.0`. `null` if survey rating was omitted.
- **`excluded_reason`**: Always `null`. Maintained for JSON schema stability.
- **`tla_pct`, `at_pct`, `exam_pct`, `output_pct`**: Always `null` in the v2 template, as assessment tasks arrive pre-summed into grading period subtotals per CLO.

**If `status` is `"failed"`:**
The `error` field will contain a structured JSON object with details about the failure:

**Example Structured Error (`MissingWorksheet`):**
```json
{
  "error_type": "MissingWorksheet",
  "message": "Missing required worksheet: 'Direct CLO'.",
  "details": {
    "expected_sheet_name": "Direct CLO",
    "available_sheets": [
      "Sheet1",
      "Summary"
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
Per-course AI gap analysis and CQI recommendation.
- Uses `google-genai` client with multi-key failover (`OBELISK_LLM_API_KEYS`).
- Returns `409 Conflict` if the job is not yet completed.
- The completed job's `result.loaded.clo_plo_mapping` is passed through to `generate_cqi_recommendation`. Entries carrying the optional [pedagogical alignment keys](#optional-pedagogical-alignment-keys-on-clo_plo_mapping) (rare on this ETL-driven path, since `loaded.clo_plo_mapping` is normally `[]`) are rendered into the prompt's alignment block; bare mappings are skipped. Response shape is unchanged.

**Normal Success Response (`status: "ok"`):**
```json
{
  "course_code": "GE 1",
  "status": "ok",
  "gaps": [ ... ],
  "prompt_used": "...",
  "recommendation": "## Summary\n..."
}
```

**No Gaps Identified Response (`status: "no_gaps_found"`):**
```json
{
  "course_code": "GE 1",
  "status": "no_gaps_found",
  "recommendation": null
}
```

**Key Pool Exhaustion Response (`status: "error"`):**
If all configured API keys fail or exceed rate/quota limits:
```json
{
  "course_code": "GE 1",
  "status": "error",
  "error": "[LLM API ERROR: All 2 configured API key(s) were exhausted without success. Details: Key #1 (...) failed: 429 Resource Exhausted | Key #2 (...) failed: ...]",
  "gaps": [ ... ],
  "prompt_used": "...",
  "recommendation": "[LLM API ERROR: All 2 configured API key(s) were exhausted without success. Details: ...]"
}
```

---

## Endpoint 2: Institutional & Program-Level Analytics

This group of endpoints accepts a consolidated payload of multiple course submissions to perform higher-level analysis.

### `POST /analytics/summary` (For Dean, Program Head, AVP dashboards)

> ✅ **This endpoint is safe for any role.** It performs pure data aggregation and **never** triggers an AI/LLM call.

**Request body:**
```json
{
  \"period\": { \"type\": \"semester\", \"label\": \"SY 2025-2026, 1st Sem\" },
  \"submissions\": [
    {
      \"department\": \"CITE\",
      \"program\": \"BSIT\",
      \"header\": { ... },
      \"attainments\": [ ... ],
      \"clo_plo_mapping\": [ ... ]
    }
  ]
}
```

**Optional pedagogical alignment keys on `clo_plo_mapping`:**

Entries are `{ "clo_code", "plo_code", "correlation_strength" }` by default. The webapp backend additionally folds in the section's **latest CAR** (regardless of status) when it carries Part 1 data, falling back to the program's CLO→PLO stage:

```json
{
  "clo_code": "CLO1",
  "plo_code": "PLO1",
  "correlation_strength": 1.0,
  "blooms_level": "Analyze",
  "ipd_stage": "i",
  "assessment_types": ["Exam", "Rubric"]
}
```

- The three alignment keys are optional and are only present when they carry a signal; `blooms_level` may be `null`, `ipd_stage` is a bare `i`/`p`/`d` letter (Introduction / Proficiency / Demonstration), `assessment_types` is a list of strings.
- `CourseSubmission` has **no** `extra="forbid"`, so the extra keys pass validation without a schema change.
- Entries carrying none of the three keys are skipped by the prompt builder — a bare mapping never produces "not recorded" rows.
- When at least one entry carries them, both `build_prompt` and `build_institutional_prompt` append a **"Pedagogical alignment"** block inside `<DATA>` (capped at `MAX_ALIGNMENT_LINES = 60` with an explicit omission note), and the LLM is instructed to cite the Bloom's level / I-P-D stage behind any CLO it quotes.
- Alignment is scoped **per section**, never merged across courses: the rollups consolidate CLOs by bare code, so a shared map would attribute one course's alignment to another's CLO.

### `POST /analytics/institutional-summary` (VPAA ONLY)

> ⚠️ **This endpoint has no internal access control.** The webapp MUST verify the requester is VPAA before calling this. It triggers an AI/LLM call.

**Normal Response (`status: "ok"`):**
```json
{
  "summary": { ... },
  "status": "ok",
  "prompt_used": "The full text prompt sent to the LLM...",
  "recommendation": "The AI-generated text response..."
}
```

**Key Pool Exhaustion Response (`status: "error"`):**
If all configured API keys fail or exceed quota:
```json
{
  "summary": { ... },
  "status": "error",
  "error": "[LLM API ERROR: All 2 configured API key(s) were exhausted without success. Details: ...]",
  "prompt_used": "The full text prompt sent to the LLM...",
  "recommendation": "[LLM API ERROR: All 2 configured API key(s) were exhausted without success. Details: ...]"
}
```

---

## LLM API Key Multi-Pool & Failover Specification

The service supports zero-downtime key rotation and failover via `OBELISK_LLM_API_KEYS`.

1. **Configuration**:
   - `OBELISK_LLM_API_KEYS='["AIzaSyKey1", "AIzaSyKey2"]'` (JSON array) or `"AIzaSyKey1,AIzaSyKey2"` (comma-separated string).
   - If using `OBELISK_LLM_API_KEY`, it is automatically treated as a single-key pool.
2. **Sequential Try / Failover**:
   - The engine attempts keys in priority order (index 1 to $N$).
   - If an error occurs (such as HTTP 429 quota exhaustion, invalid credential, or network timeout), the failure is logged (`llm_key_failed`) with a masked preview of the failed key.
   - The engine immediately switches to key index 2 without interrupting the request.
3. **Exhaustion Handling**:
   - Only when **all** keys in the pool fail does the engine stop and log `llm_all_keys_exhausted`.
   - Instead of crashing with a 500 error, it returns a structured payload with `"status": "error"` and the error details so the webapp UI can display a helpful message to the user.
