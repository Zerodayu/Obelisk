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

2. **No user authentication or role authorization.** The webapp verifies
   users and roles before calling this service. The optional caller-secret
   check below protects upload/jobs/analytics routes; health and manual ETL
   routes do not use that dependency. A valid secret does not prove a VPAA role.

### Optional: Webapp Shared-Secret Auth

This service can optionally enforce a simple shared-secret caller check
using the `X-Webapp-Secret` header. It is **disabled by default** — if
`OBELISK_WEBAPP_SHARED_SECRET` resolves to `None`, caller authentication is
disabled. An empty string is not treated as `None`: the code still requires a
matching header. Prefer leaving the setting unset when disabling the check.

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

1. **Worksheets**: The supported AUN-OBE template contains at least `"Direct CLO"` and `"Indirect CLO"` sheets, with their respective marker titles in `A1`. Saving/enqueuing an upload does not validate this layout: an unsupported workbook may initially receive HTTP 202, then fail during worker extraction with a structured `MissingWorksheet`, `InvalidTemplate` or `InvalidWorkbook` error. HTTP acceptance is not successful ETL validation.
2. **Dynamic CLOs**: CLO blocks are discovered dynamically (scanning until a blank cell). The number of CLOs is not fixed.
3. **CLO-PLO Mapping Retired**: python-server no longer reads or enforces CLO-PLO mappings from Excel. Mapping is managed solely in the webapp backend (`curriculum_map` / Prisma). `result.loaded.clo_plo_mapping` is always `[]`.
4. **Independent Recomputation**: Direct attainment is computed from the 6 raw score/max cells ($\frac{\text{Prelim}+\text{Midterm}+\text{Final}}{\text{Prelim Max}+\text{Midterm Max}+\text{Final Max}}$). Indirect attainment is recomputed from raw Likert rating as $(\frac{\text{Rating}}{5.0}) \times 100$. Excel's formula columns are ignored.
5. **Workbook data validation**: Nonblank period score and indirect-rating cells must contain finite numbers or parseable numeric strings. Null/empty/whitespace cells remain missing; zero remains numeric. Malformed text, Excel errors, booleans and nonfinite values raise `WorkbookValidationError`, with `sheet_name`, `cell`, `field` and `reason` details, plus `conflicting_cell` for repeated IDs/CLOs. Details omit names, IDs and raw invalid values. Metadata parsing is unaffected.
6. **Identity and CLO collisions**: Repeated nonblank student IDs and repeated discovered CLO codes within either worksheet are rejected before lookup insertion. Existing trimmed identifiers/CLO extraction are preserved; no new case-folding is applied. The same ID/CLO once on each sheet is valid. Optional IDs and unambiguous name fallback remain supported; ambiguous name fallback is rejected rather than choosing a row. Matching unique IDs takes priority over names, so shared names with matching distinct IDs remain valid.
7. **Extra credit**: Valid nonnegative scores above a period maximum are accepted. Scores and resulting attainments are not clamped; the numerator, denominator and [canonical formulas](FORMULAS.md) are unchanged. Direct attainment can exceed 100%.
8. **Underlying activities**: The mixed workbook contains `RECORD` activity data and `F12` survey data. Production ETL extracts the six Direct CLO score/max subtotal cells and raw Indirect CLO ratings, plus SETUP metadata; it does not expose individual RECORD activities or use RECORD/F12 as its production score source. The separate accuracy evaluator uses those underlying sheets for independent checks.

---

## Endpoint 1: Per-course upload & attainment

### `POST /upload`
Upload one class-record `.xlsx` file.

Send `multipart/form-data` with the upload in the `file` field. The Python upload route checks save/size/queue outcomes, but does not enforce an `.xlsx` extension or MIME type before enqueuing. Workbook format/content validation occurs in the asynchronous worker.

**Response (202):**
```json
{ "job_id": "uuid-string", "status": "queued" }
```

### `GET /jobs/`
Returns a list of all job objects currently tracked in Redis. `/jobs/` is the canonical route; `/jobs` redirects with HTTP 307 under the current FastAPI configuration.

### `GET /jobs/{job_id}`
Poll until `status` is `"completed"` or `"failed"`.

**Response (200):**
A single job object with the following structure:
```json
{
  "job_id": "uuid-string",
  "type": "etl",
  "status": "completed",
  "payload": { "file_path": "...", "filename": "..." },
  "created_at": "2026-09-26T10:00:00.000000",
  "updated_at": "2026-09-26T10:00:05.000000",
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

Job timestamps are generated with `datetime.utcnow().isoformat()`: they represent UTC but contain no `Z` or offset. Consumers must interpret these current naive strings as UTC rather than browser-local time. The example above is schematic; `loaded` also includes status/count and section/SETUP metadata.

### Webapp preview and explicit persistence

The browser calls Bun/Elysia, which calls Python. The current successful workflow is:

```text
Upload -> Python queued/running/completed -> Bun ready/preview
       -> user reviews and explicitly Saves -> Bun persists computed results
```

The browser polls Bun's `GET /ingest/upload/{jobId}/status`; Bun retrieves Python's `GET /jobs/{job_id}`. Python `completed` means ETL results are stored in Redis, not that computed application results have been saved to the database. Bun returns `ready` with a preview after successful validation; polling does not persist attainment results. Explicit `POST /ingest/upload/{jobId}/save` performs the idempotent computation-run/attainment persistence and returns Bun `completed`. Upload/history metadata can already exist before Save. `ready` is a Bun status, not a Python `JobStatus` value. See [the process guide](SYSTEM_PROCESS_EXPLAINED.md#3-deep-dive-process-1--per-course-workbook-etl).

### HTTP errors versus worker errors

| Boundary | Current response |
| --- | --- |
| Upload too large (413), queue overloaded (503), upload save error (500) | HTTP JSON with string-valued `detail`; the save error uses `"Unable to save uploaded file"` |
| Missing job (404) / unfinished or failed job recommendation (409) | HTTP JSON with string-valued `detail` |
| Shared-secret rejection (401) | HTTP JSON whose `detail` is a structured `UnauthorizedCaller` object |
| Request payload validation (422) | FastAPI validation errors in a list-valued `detail` |
| Worker workbook/business failure | Polling normally returns HTTP 200 with job `status: "failed"` and structured `error` (`error_type`, `message`, `details`) |
| Unexpected worker exception | Failed job with `error_type: "UnexpectedError"` and `message`; `details` may be absent |
| AI provider exhaustion / invalid generated response | Can return HTTP 200 with `status: "error"` and string-valued `error`/`recommendation`; inspect status as well as HTTP success |

For example, a missing job returns `{"detail":"Job not found"}`. A queue-overload HTTP response uses `{"detail":"..."}`, not the worker's structured error shape. Clients must distinguish these boundaries rather than assume every error is an object with `error_type`.

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
  "composite_clo_attainment_pct": 84.67,
  "met_threshold": true,
  "clo_level": "Proficient",
  "formula_version": "70_30_v1",
  "is_record_complete": true,
  "section_completeness_pct": 1.0,
  "rule1_met": true,
  "excluded_reason": null
}
```

#### Field Notes for the Webapp Consumer:
- **`direct_clo_attainment_pct`**: Ratio `[0.0, 1.0+]` recomputed from raw Prelim/Midterm/Final score and max sums.
- **`indirect_clo_attainment_pct`**: Percentage `[0.0, 100.0]` recomputed from raw Likert Rating: `(rating / 5.0) * 100.0`. `null` if survey rating was omitted.
- **`composite_clo_attainment_pct`**: Rounded percentage using 70% direct + 30% indirect, with direct-only fallback if indirect is null. It is null when direct cannot be measured; threshold/level are then null. Valid extra credit can exceed 100%. See [FORMULAS.md](FORMULAS.md).
- **`formula_version`**: Current transformer emits the literal `70_30_v1`, not a generated hash.
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
- The `recommendation` string returns schema-compliant JSON with `summary`, `recommendations`, and `pattern`.
- `strip_code_fences` removes only an outer multiline JSON/plain Markdown fence, preserving embedded triple backticks. CRLF and case-insensitive `json` are supported; surrounding prose, unsupported language fences and incomplete fences remain unchanged for boundary validation.
- Course responses are parsed and validated before `status: "ok"`: exactly these top-level fields, nonempty string `summary`, a nonempty list of items with exactly nonempty string `title`/`explanation` and an allowed `recommendedFor`, and string-or-null `pattern`. Single recommendations and fenced JSON remain supported; the returned value remains a JSON string.
- Malformed course JSON and empty, null or non-string provider text return the existing `status: "error"` envelope with matching `error` and `recommendation` strings. Institutional summaries validate nonempty text only and continue to accept prose. Neither boundary adds retries. The no-gap course shortcut still returns a null recommendation without calling the provider.
- ETL rejects negative non-null PRELIM/MIDTERM/FINAL scores before calculation using `TransformationError` with field/value details only. Zero, null and extra-credit score behavior is preserved; see [FORMULAS.md](FORMULAS.md) for the unchanged calculations.

**Normal Success Response (`status: "ok"`):**
```json
{
  "course_code": "IT 101",
  "status": "ok",
  "gaps": [ ... ],
  "prompt_used": "...",
  "recommendation": "{\n  \"summary\": \"In IT 101 (Section BSIT - 1A), multiple students fell below the 70% threshold...\",\n  \"recommendations\": [\n    {\n      \"title\": \"Review Teaching Strategies\",\n      \"explanation\": \"Faculty should evaluate instructional materials...\",\n      \"recommendedFor\": \"Faculty\"\n    }\n  ],\n  \"pattern\": \"Cross-CLO underperformance observed across sections.\"\n}"
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

For `worst_performing_clos`, the implementation collects all `(group key, CLO)` entries at each aggregation level and selects up to three across the department level, up to three across the program level and up to three across the AVP level. Each selection sorts by ascending mean attainment, then descending `record_count`. The combined candidates are sorted the same way and limited to five. This is not three CLOs for every individual department/program/AVP group; entries from different levels are not deduplicated. `record_count` counts eligible student-CLO records, not necessarily unique students.

### `POST /analytics/summary` (For Dean, Program Head, AVP dashboards)

> ✅ **This endpoint is safe for any role.** It performs pure data aggregation and **never** triggers an AI/LLM call.

**Request body:**
```json
{
  "period": { "type": "semester", "label": "SY 2025-2026, 1st Sem" },
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

#### Optional pedagogical alignment keys on `clo_plo_mapping`

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
- Mapping entries are `Dict[str, Any]`, so these keys are retained inside `clo_plo_mapping`. `CourseSubmission` and `Period` currently use Pydantic's default extra-field handling (ignore); the top-level payload and class-record models forbid extras. This differs from the agent guide's convention for new schemas.
- Entries carrying none of the three keys are skipped by the prompt builder — a bare mapping never produces "not recorded" rows.
- When at least one entry carries them, both `build_prompt` and `build_institutional_prompt` append a **"Pedagogical alignment"** block inside `<DATA>` (capped at `MAX_ALIGNMENT_LINES = 60` with an explicit omission note), and the LLM is instructed to cite the Bloom's level / I-P-D stage behind any CLO it quotes.
- Alignment is scoped **per section**, never merged across courses: the rollups consolidate CLOs by bare code, so a shared map would attribute one course's alignment to another's CLO.

### `POST /analytics/institutional-summary` (VPAA ONLY)

> **The webapp MUST verify VPAA authorization.** This endpoint has no user-role check; it shares the optional caller-secret dependency. It invokes the AI path (mocked only when `IS_DEBUG_MODE=True`).

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

The service supports sequential failover via `OBELISK_LLM_API_KEYS`. Settings
are constructed at import time; changing root-file values is not a live key
reload and generally requires a process restart.

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

## AI configuration and offline verification

`Settings.LLM_MODEL` defaults to `gemini-3.5-flash-lite`; `OBELISK_LLM_MODEL` in the
repo-root `.env.local`/`.env.prod` or process environment overrides it. The env
loader selects the profile with `OBELISK_ENV`, supports `OBELISK_ENV_FILE`, and
preserves pre-set runtime values (`override=False`). No per-package env is read.
`IS_DEBUG_MODE=False` enables real SDK calls and is separate from logging
`OBELISK_DEBUG`. Without valid keys AI routes return HTTP 501; course no-gap
results bypass the provider. Exhaustion/response-validation failures can return
HTTP 200 with `status: "error"`, which callers must inspect.

The [legacy runner](../testing_modules/old_test/README.md) performs offline
verification using provider/Redis/worker mocks. Its October 13 repair results
do not prove current Gemini availability or webapp persistence/error handling.
Preserved [Pre-UAT evidence](../testing_modules/pre_uat/README.md) refers to its
original run dates/models/builds; it is not a verification of later source edits.
