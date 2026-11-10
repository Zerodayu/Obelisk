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

## Endpoint 3: CQI report narrative

### `POST /analytics/cqi-narrative`

Synchronous AI narrative generator for outcomes-based Continuous Quality Improvement (CQI) reports.

- **Route**: `POST /analytics/cqi-narrative`
- **Authentication**: `X-Webapp-Secret` header (matching `OBELISK_WEBAPP_SHARED_SECRET` if configured). Python checks NO user roles; the webapp backend MUST authenticate and authorize the user (e.g., Program Chair, Dean, VPAA, or CQI committee member) before calling this endpoint.
- **Pure-Compute Pass-Through Principle**:
  - Python **never calculates, estimates, rounds, reformats, or invents numbers**. All numbers in the request are the webapp's final display values and are passed through as immutable facts.
  - Python **never decides MET / NOT MET, at-risk status, escalation, or loop closing status**. The webapp computes all statuses and targets; the AI repeats them verbatim.
  - Existing endpoints (Endpoint 1: `/upload`, `/jobs/{job_id}`) receive individual student names and IDs in Excel workbooks and loaded JSON; **this endpoint accepts NO student names or student IDs**. Payloads containing student names, student IDs, or unknown fields are rejected with HTTP 422.
  - Free-text fields (`intervention`, `named_owner`, `kpi`) cannot be automatically scanned for personal information: the webapp MUST keep them completely free of personal student names before transmitting.
- **One Validation Retry (Up to Two Provider Calls)**:
  - The endpoint enforces a strict hard validator. If the first provider generation fails validation (e.g. invented number, missing citations, invalid role), the engine automatically executes **one retry** with explicit error feedback to the model.
  - Because up to two LLM calls can occur on a single request, the webapp backend MUST set its HTTP client timeout accordingly (recommended: minimum 30–60 seconds).

### Request Schema (`CQIReportNarrativePayload`, `extra="forbid"`)

Every section is optional. Missing sections become explicit `"missing/insufficient"` facts in `<FACTS>`, and the response explicitly enumerates them under `missing_sections`.

| Field | Type | Unit | Description |
|---|---|---|---|
| `program_term` | Object (optional) | N/A | Program and academic term metadata. |
| `program_term.program_code` | string (optional) | N/A | Program code, e.g., `"BSIT"`. |
| `program_term.program_name` | string (optional) | N/A | Program full title, e.g., `"Bachelor of Science in Information Technology"`. |
| `program_term.term_label` | string (optional) | N/A | Academic term display string, e.g., `"SY 2025-2026, 1st Sem"`. |
| `program_term.academic_year`| string (optional) | N/A | Academic year identifier, e.g., `"2025-2026"`. |
| `counts` | Object (optional) | N/A | Enrolled and assessed student population counts. |
| `counts.enrolled_count` | integer (optional) | students (count >= 0) | Total enrolled student count. |
| `counts.assessed_count` | integer (optional) | students (count >= 0) | Total assessed student count. |
| `outcomes` | List[OutcomeAttainment] (optional) | N/A | Per-outcome attainment measurements for CLOs or PLOs. |
| `outcomes[].outcome_type` | string (`"CLO"` or `"PLO"`) | N/A | Outcome level hierarchy. |
| `outcomes[].outcome_code` | string | N/A | Outcome code, e.g., `"CLO1"`, `"PLO2"`. |
| `outcomes[].target_pct` | float (optional) | % (0.0 to 100.0) | Target attainment benchmark (e.g. F04 threshold). |
| `outcomes[].direct_pct` | float (optional) | % (0.0 to 100.0+) | Direct assessment attainment percentage. |
| `outcomes[].indirect_pct` | float (optional) | % (0.0 to 100.0) | Indirect Likert survey attainment percentage. |
| `outcomes[].composite_pct` | float (optional) | % (0.0 to 100.0+) | Final composite attainment percentage (70/30). |
| `outcomes[].is_complete` | boolean (optional) | N/A | Assessment completeness flag. |
| `outcomes[].prior_cycle_composite_pct` | float (optional) | % (0.0 to 100.0+) | Prior cycle composite attainment for longitudinal comparison. |
| `outcomes[].status` | string (optional) | N/A | Webapp-computed status: `"MET"` or `"NOT MET"`. |
| `outcomes[].fact_id` | string (optional) | N/A | Optional webapp-supplied fact identifier (if omitted, Python generates a deterministic ID). |
| `cqi_entries` | List[CQIEntry] (optional) | N/A | Pre-computed CQI action plan items. |
| `cqi_entries[].outcome_code` | string | N/A | Associated outcome identifier. |
| `cqi_entries[].status` | string | N/A | Attainment status: `"MET"` or `"NOT MET"`. |
| `cqi_entries[].loop_status` | string (optional) | N/A | Loop status: `"CLOSED"`, `"OPEN_REASSESS"`, or `"OPEN_NOT_IMPLEMENTED"`. |
| `cqi_entries[].is_escalated` | boolean (optional) | N/A | Escalation flag for higher administrative review. |
| `cqi_entries[].intervention` | string (optional) | N/A | Planned intervention (must omit personal names). |
| `cqi_entries[].named_owner` | string (optional) | N/A | Role or title responsible for action (must omit personal names). |
| `cqi_entries[].kpi` | string (optional) | N/A | Key performance indicator or closing target. |
| `cqi_entries[].root_cause_category` | string (optional) | N/A | One of the 6 canonical categories. |
| `cqi_entries[].fact_id` | string (optional) | N/A | Optional webapp-supplied fact identifier. |

### Canonical Root-Cause Categories (Must Match Backend Exactly)

The 6 categories defined locally in `app/analytics/cqi_constants.py` replicate `apps/backend/lib/validators/root-cause.ts`:
1. `"1-Curriculum Design"`
2. `"2-Instruction & Pedagogy"`
3. `"3-Assessment Design"`
4. `"4-Student Factors"`
5. `"5-Resources & Tools"`
6. `"6-Industry & Field Alignment"`

### Response Envelope (`CQINarrativeResponse`)

| Field | Type | Description |
|---|---|---|
| `status` | string | Response status: `"ok"`, `"error"`, or `"narrative_unavailable"`. |
| `summary` | string or null | 1-2 plain-language narrative summary sentences. |
| `recommendations` | List[Recommendation] | Structured recommendations with mandatory fact citations. |
| `recommendations[].problem` | string | The identified issue or area for continuous improvement. |
| `recommendations[].evidence_fact_ids` | List[string] | Cites one or more fact_ids that appear in `facts_used`. |
| `recommendations[].intervention` | string | Concrete, actionable intervention (never generic, never grade alterations). |
| `recommendations[].responsible_role` | string | One of: `"Faculty"`, `"Program Chair"`, `"Dean"`, `"VPAA"`, `"AQAU"`. |
| `recommendations[].timeline` | string | Action timeframe, e.g., `"Within 4 weeks"`, `"Next term"`. |
| `recommendations[].success_indicator`| string | Observable benchmark of resolution. |
| `recommendations[].target` | string, number, or null | Target metric matching a supplied fact number or null. |
| `recommendations[].verification_method` | string | Method to evaluate effectiveness. |
| `possible_contributing_factors` | List[Factor] | Possible causes labelled as hypotheses with root cause categories. |
| `possible_contributing_factors[].hypothesis` | string | Cause framed as a hypothesis (never stated as established). |
| `possible_contributing_factors[].root_cause_category` | string | Canonical root cause category. |
| `possible_contributing_factors[].evidence_fact_ids` | List[string] | Cites one or more supplied fact_ids. |
| `pattern` | Object or null | Cross-outcome, cross-section, or direct-vs-indirect pattern with `description` and `evidence_fact_ids`. |
| `data_limitations` | List[string] | Limitations noted when facts indicate missing or insufficient data. |
| `missing_sections` | List[string] | List of top-level payload sections omitted in request. |
| `facts_used` | List[FactItem] | Flattened facts with deterministic IDs provided to the LLM. |
| `error` | string or null | Error details if provider keys failed (`status: "error"`). |
| `reason` | string or null | Rejection reason when validation failed after retry (`status: "narrative_unavailable"`). |
| `prompt_used` | string or null | The full prompt sent to the LLM. |

### Status Responses and Examples

#### 1. Success Response (`status: "ok"`, HTTP 200)

```json
{
  "status": "ok",
  "summary": "Attainment in CLO1 fell below the 75.0% target for the term, while CLO2 achieved 82.9%.",
  "recommendations": [
    {
      "problem": "Performance in CLO1 is below the expected institutional benchmark.",
      "evidence_fact_ids": ["fact_clo_CLO1_target", "fact_clo_CLO1_composite", "fact_clo_CLO1_status"],
      "intervention": "Implement supplemental laboratory coding workshops and align practical rubric assessments.",
      "responsible_role": "Faculty",
      "timeline": "Within 4 weeks",
      "success_indicator": "Achievement of the 75.0% composite target in the subsequent evaluation cycle.",
      "target": 75.0,
      "verification_method": "Midterm laboratory rubrics and final departmental exam results."
    }
  ],
  "possible_contributing_factors": [
    {
      "hypothesis": "Practical assessment rubrics in introductory laboratory modules may not fully evaluate formative programming fundamentals.",
      "root_cause_category": "3-Assessment Design",
      "evidence_fact_ids": ["fact_clo_CLO1_direct", "fact_cqi_CLO1_1_root_cause_category"]
    }
  ],
  "pattern": {
    "description": "Direct assessment attainment (65.0%) is notably lower than student indirect survey satisfaction (80.0%).",
    "evidence_fact_ids": ["fact_clo_CLO1_direct", "fact_clo_CLO1_indirect"]
  },
  "data_limitations": [],
  "missing_sections": [],
  "facts_used": [ ... ],
  "error": null,
  "reason": null
}
```

#### 2. Key Pool Exhaustion Response (`status: "error"`, HTTP 200)

When all configured Gemini API keys fail or exceed quotas:
```json
{
  "status": "error",
  "summary": null,
  "recommendations": [],
  "possible_contributing_factors": [],
  "pattern": null,
  "data_limitations": [],
  "missing_sections": [],
  "facts_used": [ ... ],
  "error": "[LLM API ERROR: All 2 configured API key(s) were exhausted without success. Details: ...]",
  "reason": null
}
```

#### 3. Validation Failure Response (`status: "narrative_unavailable"`, HTTP 200)

When the model produces text that violates the hard validator (e.g. invented numbers, unknown citations, invalid roles) even after the 1 allowed retry:
```json
{
  "status": "narrative_unavailable",
  "summary": null,
  "recommendations": [],
  "possible_contributing_factors": [],
  "pattern": null,
  "data_limitations": [],
  "missing_sections": [],
  "facts_used": [ ... ],
  "error": null,
  "reason": "Number '99.4%' (99.4) does not match any supplied fact number. Untraceable numbers are forbidden."
}
```
**CRITICAL**: In `"narrative_unavailable"`, NO unvalidated text is returned.

#### 4. HTTP Error Statuses

| HTTP Code | Error Boundary | Response Payload |
|---|---|---|
| **401 Unauthorized** | Missing or incorrect `X-Webapp-Secret` header when auth is enabled. | `{"detail": {"error_type": "UnauthorizedCaller", "message": "...", "details": {...}}}` |
| **422 Unprocessable Entity** | Request contains student names (`student_name`), student IDs (`student_id`), or unknown extra fields. | `{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}` |
| **501 Not Implemented** | No Gemini API keys configured in real mode (`OBELISK_LLM_API_KEYS`). | `{"detail": "LLM API key not configured. Mock fallback is disabled in real mode."}` |
| **500 Internal Server Error** | Unexpected server crash. | `{"detail": "An unexpected error occurred while generating CQI narrative: ..."}` |

---

## Backend teammate checklist (CQI Narrative Integration)

When calling `POST /analytics/cqi-narrative` from Bun / Elysia / Nest / Express:

1. **What to send**: Send consolidated, pre-computed program/term metadata, enrolled/assessed counts, outcomes (CLO/PLO), and CQI action plan items.
2. **NO names or IDs**: Strip ALL student identifiers (`student_name`, `student_id`, `studentId`, `studentName`, `students`). The endpoint enforces `extra="forbid"` and will reject the payload with HTTP 422 if any student identifier or unrecognized key is present.
3. **Free-text hygiene**: Ensure free-text fields (`intervention`, `named_owner`, `kpi`) contain NO personal student names.
4. **Latest-run-scoped data**: Scope all aggregated attainment data to the latest ETL computation run for each course section. Re-uploads create duplicate runs in the database, and the raw gap loader does not automatically filter runs.
5. **Webapp-computed statuses & F04 targets**: Compute and include all attainment statuses (`MET` or `NOT MET`), loop statuses (`CLOSED`, `OPEN_REASSESS`, `OPEN_NOT_IMPLEMENTED`), escalation flags, and official F04 targets. Python does not compute or decide them.
6. **Authorization gating**: Only authorized roles (e.g. Program Chair, Dean, VPAA, AQAU) should be permitted to trigger narrative generation in the webapp UI. Python checks only the `X-Webapp-Secret` header, not user session roles.
7. **Timeout configuration**: Set webapp HTTP client timeout to at least 30–60 seconds, because the endpoint performs up to two sequential LLM calls when validation retries occur.
8. **Persistence**: Store the returned JSON narrative in the webapp database with status `pending_review` (or equivalent) for faculty and committee review before report printing or export.

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
