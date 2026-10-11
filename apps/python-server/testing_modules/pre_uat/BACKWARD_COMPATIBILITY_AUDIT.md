# OBELISK Python-to-Webapp Backward Compatibility Audit

Audit date: October 11, 2026. Team: 4th Dimension. Scope: read-only inspection of Python production changes, Bun/Elysia backend integration and Next.js frontend consumers. Only this report was added. No application tests, type checks, services, databases, containers, Redis connections or live Gemini calls were executed.

## Decision before committing

No accidental route, HTTP response-field, Pydantic schema, calculation, threshold or queue-status change was found in the five Python production files changed during Pre-UAT. Stricter workbook and AI validation is intentional. Existing saved Python evidence supports the valid synthetic-data paths.

**An actual backend handling gap was found in source:** an institutional AI response with HTTP 200 and `status: "error"` is accepted and persisted as a `pending_review` recommendation. Its error sentinel can consequently appear in the frontend as recommendation text. The error envelope existed before these fixes; blank/invalid-response rejection now adds another trigger. This is not an accidental Python schema change, but it prevents an unconditional end-to-end compatibility statement.

**An additional existing numerical/nullability mismatch was found:** Python permits null direct attainment and null threshold classification, whereas backend persistence multiplies direct attainment by 100 and negates the threshold flag without checking null. Missing attainment can become zero and a missing classification can become an at-risk flag. No runtime reproduction was performed.

Committing the approved Python fixes does not itself demonstrate webapp compatibility. Backend error handling and missing-data semantics require separate review and isolated verification. No backend/frontend correction is authorized or made by this audit.

## Baseline and evidence boundaries

The pre-fix baseline is Git commit `1a8fb6dd41d1ef9c10fe5ab0f03e24af54a3ef93`, recorded in the initial Phase 2A evidence. Inspected HEAD is `516fb3370f210e01f62292ad3c854cbc888c6cef`; comparison includes the actual working-tree source, not only committed files.

Read-only comparison command, from `apps/python-server`:

```powershell
git diff 1a8fb6dd41d1ef9c10fe5ab0f03e24af54a3ef93 -- app
```

The diff contains five files, 139 insertions and 15 deletions. Routes, schema definitions, loader, formula helpers, constants, worker, queue, configuration and shared LLM provider implementation have no diff. The six principal backend/frontend integration files referenced below also have no diff against that baseline: backend `ingest-client.ts`, ingest service, AI service; frontend AI actions, AI drawer and upload form. Thus the confirmed handling gaps in those files predate the Python corrections.

SHA-256 comparison during this audit matched all **46 production files** against both saved final [Phase 2A source manifest](evidence/20261011T063734_111127Z/SOURCE_MANIFEST.json) and [Phase 2B-1 source manifest](evidence/20261011T071933_296064Z/SOURCE_MANIFEST.json), with no mismatches. Current production is the source represented by those executed results.

The [saved compatibility comparison](evidence/20261011T063734_111127Z/COMPATIBILITY.json) compares final UT-004 corrections with the **intermediate** regression run, not the original pre-fix application: the earlier negative-score and AI fixes were already present. Its 17 identical passing observations must not be described as full pre-UAT-to-webapp compatibility proof.

The consolidated results remain **20 PASS, 0 FAIL, 5 BLOCKED, 1 SKIPPED** across 26 IDs. This source audit adds no executed test ID, changes no status and replaces no timestamp.

## Production changes reviewed

Locations below are current file line numbers. Links are relative to this report; line numbers are stated separately for portability.

| Production source and location | Actual change | Classification and retained behavior |
| --- | --- | --- |
| [Excel extractor](../../app/etl/extract/extractor.py), lines 286–301, `_read_numeric_cell`; calls at 154–182 | Reject malformed nonblank scores/ratings, booleans, Excel error cells and nonfinite values. | INTENTIONAL BEHAVIOR CHANGE. Blank/whitespace remains missing; zero and finite numeric strings remain valid. Metadata/max-score parsing is unchanged. |
| Same extractor, lines 118–143 and 273–283 | Reject repeated nonblank IDs within each worksheet before lookup insertion; reject ambiguous name fallback. | INTENTIONAL BEHAVIOR CHANGE. Matching IDs across sheets and unambiguous optional-ID fallback remain supported. Matching by valid ID has precedence. |
| Same extractor, lines 240–270 | Reject duplicate normalized CLO labels, including indirect labels resolving to the same code. | INTENTIONAL BEHAVIOR CHANGE. Dynamic discovery, existing whitespace handling and matching codes across sheets remain; no new case folding. |
| [Transformer](../../app/etl/transform/transformer.py), lines 38–46 | Reject negative non-null period scores before calculation using `TransformationError`. | INTENTIONAL BEHAVIOR CHANGE. No clamping or changes to denominator, weights, rounding, levels or threshold. Nonnegative extra credit remains accepted. |
| [Exceptions](../../app/core/exceptions.py), lines 10–24 | Add `WorkbookValidationError` subclass with `error_type`, `message`, structured `details`. | COMPATIBLE envelope extension. Details provide sheet/cell/field/reason and optional conflicting cell without names, IDs or raw malformed values. Negative-score errors use existing `TransformationError` instead. |
| [Course recommender](../../app/analytics/cqi_recommender.py), lines 60–95 and 403–420 | Normalize nonempty LLM text and validate course JSON before returning success. | INTENTIONAL BEHAVIOR CHANGE. Required exact keys/types and recipient role enum are enforced. Recommendation remains a JSON **string**, not a parsed object. Fenced valid JSON, nullable pattern and one recommendation remain valid; no-gaps returns null unchanged. |
| [Institutional summary](../../app/analytics/institutional_summary.py), lines 310–325 | Apply nonempty-text normalization; invalid/blank response returns existing error envelope. | INTENTIONAL BEHAVIOR CHANGE. Nonempty prose remains valid; course JSON validation is not applied. Numerical summary and provider calls/settings are unchanged. |

The course validator rejects additional keys and recipients outside Faculty, Program Chair, Dean, VPAA and AQAU. This is covered by deterministic tests; a future consumer expecting arbitrary JSON extensions must agree on a contract first. No existing webapp course-endpoint consumer was found.

Extra credit is preserved **implementation behavior**, not independently verified institutional grading policy. Valid synthetic cases include direct 1.85 and composite 156.50; no 100% cap was introduced.

## Python-to-backend contract matrix

“COMPATIBLE” below means matching inspected source contracts supported by saved Python evidence for the stated scenarios. It does **not** mean a Bun-to-Python runtime request or database write was executed. Runtime compatibility is separately NOT VERIFIED.

| Interface | Classification | Source expectations and evidence |
| --- | --- | --- |
| Upload multipart request and acceptance | COMPATIBLE | [Python upload route](../../app/api/routes/upload.py), lines 11–32 accepts `file` and returns HTTP 202 `{job_id, status: "queued"}`. [Backend client](../../../backend/lib/ingest/ingest-client.ts), lines 204–232 sends `file` and reads `job_id`. Backend adds its own section context and exposes `{jobId}` via [ingest service](../../../backend/src/v1/ingest/service.ts), lines 1087–1124. IT-007/009 saved evidence verifies the Python boundary. |
| Job IDs, queued/running/completed/failed statuses | COMPATIBLE | [Jobs route](../../app/api/routes/jobs.py), lines 16–23; client types at lines 3–9 and 55–64 and `getJob` at 235. Backend `resolveJob`, lines 1470–1520, recognizes actual terminal status. “Processing” is a UI state; Python uses `running`. No status enum change occurred. |
| Completed `result.loaded` structure | COMPATIBLE | [Loader](../../app/etl/load/loader.py) preserves header, attainments, mapping and section/setup metadata. Backend client lines 44–64 and ingest service `loadedOf`, lines 1284–1289, expect `result.loaded.attainments`. Backend translates completion into `ready` preview, then `completed` after explicit save. IT-007/009 verifies Python completed records, not webapp saving. |
| Valid non-null student-CLO values and scales | COMPATIBLE | [Python schema](../../app/schemas/class_record.py), `StudentCLOAttainment`; backend `AttainmentRecord`, lines 49–61, and persistence lines 384–405: direct fraction is multiplied by 100; indirect/composite already use percentage scale. `met_threshold` is consumed directly. UT-005/006/010 verifies synthetic calculations and exact 70% boundary; no formula diff. |
| Null direct attainment / null threshold | POTENTIAL BREAKING CHANGE | Existing mismatch, not introduced by fixes. Python schema permits null; backend type requires number/bool and persistence performs arithmetic/boolean coercion. See finding BC-002. Missing indirect/composite values are typed optional/null, but backend fallbacks cannot establish faithful missing-direct semantics. |
| Workbook rejection and worker error envelope | INTENTIONAL BEHAVIOR CHANGE | New invalid inputs fail instead of producing output. [Worker](../../app/workers/worker.py), lines 54–57 handles all `OBELISKError` subclasses through `to_dict()`, unchanged. Backend structured errors permit any string `error_type` and arbitrary details; `resolveJob`, lines 1479–1487 forwards `job.error` before preview/persistence. UT-004 verifies sanitization; IT-007 verifies failed malformed-workbook lifecycle, not each new validation reason through Bun. |
| Course recommendation success/error/null shortcut | COMPATIBLE Python shape; NOT VERIFIED webapp integration | [Analytics route](../../app/api/routes/analytics.py), lines 17–77, and course service lines 367–422 preserve `course_code`, `status`, string/null `recommendation`, and optional gap/prompt/error fields. UT-008/009 and ST-AI-007 support deterministic behavior. Searches of backend/frontend source found no caller of `/analytics/jobs/{id}/recommendation` or consumer of course `recommendedFor`. The webapp uses institutional summaries instead. |
| Institutional nonempty prose and numerical summary | COMPATIBLE | Python institutional lines 310–325 preserve `status`, `summary`, `prompt_used`, string `recommendation`. Backend client lines 149–154 and 358–366 expects these fields. [AI service](../../../backend/src/v1/ai/service.ts), lines 277–305 stores prose; UT-009 records valid plain/fenced prose, and ST-AI-004 checks supported numerical claims against synthetic ETL. No runtime persistence proof. |
| Institutional AI `status: "error"` with HTTP 200 | POTENTIAL BREAKING CHANGE | Confirmed preexisting handling defect exposed by additional validation failures. Backend `postJson`, lines 287–331 checks HTTP only; AI service lines 280–305 ignores status/error and persists the sentinel. See BC-001. |
| Summary optional `program_plo_average` | POTENTIAL BREAKING CHANGE (type drift) | Python aggregator lines 144–152 emits this only when mapped PLOs exist; backend client lines 131–133 types it required. No change in either contract during fixes. Inspected AI conversion and rollup path do not require this property, so no active consumer failure was established. |
| Immediate HTTP-error `detail` string | POTENTIAL BREAKING CHANGE (existing error-display gap) | Upload route returns string detail for 413/503; client lines 213–228 assumes structured detail. `PythonServerError`, lines 169–177 expects message/error_type, so a string can lose the useful explanation. This is separate from asynchronous WorkbookValidationError handling and unchanged by Phase 2A. |

## Backend-to-frontend trace

### Uploads and validation errors

[Upload controller](../../../backend/src/v1/ingest/controller.ts), lines 90–124 accepts `file` plus `classSectionId`; service returns camelCase `jobId`. [Frontend upload form](../../../frontend/components/forms/class-record-upload.tsx), lines 334–345 consumes that name. There is no snake_case mismatch: the backend intentionally adapts it.

Frontend status type, lines 58–84, accepts queued/running/ready/completed/failed. Polling at lines 268–295 handles `ready` preview, completed persistence and failed errors; queued/running continue polling. `failJob`, lines 227–253 updates error state and toast. The newly introduced `WorkbookValidationError` is not rejected by an error-type enum: the UI uses its message. A failed Python job is returned before the backend can persist its attainment rows.

**COMPATIBLE at source level, supported by Python failed/completed-job evidence; webapp runtime NOT VERIFIED.** The generic message “Workbook data validation failed.” lacks actionable cell information in this UI: frontend `IngestJobError` omits `details`, and only `message` is rendered. Backend `uploadErrorMessage`, lines 1066–1079 stores only message/type in history; later failed-history replay at 1451–1460 can use `UploadFailed` rather than the original subtype. This is diagnostic loss, not a job-state/schema crash. A small follow-up could safely render sheet/cell/field/reason without identities or raw values.

The frontend file picker at lines 40–46 also advertises CSV/TSV/XLS while the Python class-record path uses openpyxl workbook extraction. That preexisting affordance is not proof those formats work; unsupported input must remain a failed job. No format-support change is proposed here.

### AI success, absence and failure

[Frontend AI actions](../../../frontend/server/actions/ai.ts), lines 62–106 accepts null from latest lookup, returns `{ok: true, data}` on successful HTTP, and `{ok: false, error}` on thrown API errors. [AI drawer](../../../frontend/components/dashboard/ai-suggestions-drawer.tsx), lines 219–253 handles action success/error; lines 374–405 handles missing recommendations and renders persisted prose. Missing **stored** recommendation is supported, but it is not the course `no_gaps_found` payload.

The backend [AI controller](../../../backend/src/v1/ai/controller.ts), lines 44–48 maps a thrown `PythonServerError` to HTTP 502, which the action/drawer can surface. **This branch is bypassed for Python HTTP-200 error envelopes**, because the backend client/service does not throw. BC-001 therefore affects the actual institutional UI path. Valid nonempty institutional prose remains compatible with the Markdown renderer; actual rendering and role/database integration are NOT VERIFIED in this audit.

### Numerical display

Backend [AI compute](../../../backend/src/v1/ai/compute.ts), lines 225–255 converts summary fractions to display percentages. The drawer displays these at line 426. Backend [rollup service](../../../backend/src/v1/rollup/service.ts), lines 430–468 reads Python program/PLO summaries and converts values for display. [Frontend attainment atoms](../../../frontend/lib/store/atoms/attainments.ts), lines 28–88 consume rollup DTOs; [attainment charts](../../../frontend/components/charts/attainment-charts.tsx), lines 94–129 use percentage fields. None of those adapters changed in the reviewed fixes.

**COMPATIBLE for inspected non-null contracts; database/UI execution NOT VERIFIED.** Extra-credit persistence has no 100% clamp at ingest lines 384–405, but manual editing is capped at 100 by [backend update schema](../../../backend/src/v1/ingest/model.ts), lines 24–43. Decimal(5,2) storage in [attainment Prisma schema](../../../backend/prisma/schema/07-attainment.prisma), lines 51–57 has finite precision, so arbitrarily large accepted extra credit is not guaranteed persistable. These are preexisting downstream constraints; ordinary tested extra-credit outputs are below that precision limit, but saving/rendering them has not been executed.

## Confirmed findings and minimal follow-up proposals

### BC-001 — Institutional AI failure persisted as recommendation

Source-level reproduction, **not executed**:

1. Supply an institutional response with valid numerical `summary`, `prompt_used`, `status: "error"`, `recommendation: "[LLM API ERROR: Empty or invalid recommendation response.]"` and matching `error`, under HTTP 200.
2. `IngestClient.postJson` returns the body without application-status validation.
3. `AiRecommendationService.generate` writes `response.recommendation` and `status: "pending_review"` to Prisma without checking `response.status`.
4. Controller returns a successful recommendation DTO; frontend action returns `ok: true`; drawer renders the error text and pending-review label.

This control flow is confirmed by source and the Python error shape is supported by [UT-009 evidence](evidence/20261011T063734_111127Z/UT-009_result.txt). End-to-end effects are inferred, not an executed failure. Numerical summary computation remains intact; recommendation records/UI interpretation are affected. There is no automatic approval in this path, but an unsuccessful generation can enter the advisory review queue.

Smallest proposed correction, requiring separate approval: validate the institutional envelope in backend `institutionalSummary` or immediately before AI persistence, require success status and nonempty recommendation text, and map an error envelope to existing `PythonServerError`/502 handling. Add optional error typing. Do not impose course JSON on institutional prose or change Python HTTP behavior/provider retries. Keep numerical summaries available for legitimate analytics consumers. Avoid saving any recommendation on failure.

### BC-002 — Missing attainment coerced into a measured failure

Source-level reproduction, **not executed**: a valid Python record with `direct_clo_attainment_pct: null`, `composite_clo_attainment_pct: null`, `met_threshold: null` reaches persistence. JavaScript `null * 100` yields zero, composite fallback becomes zero, and `!null` yields true. An at-risk flag can be created from absence of a measurement. Python can produce this when maximum-score sum is zero; both schema and transformer explicitly allow null.

The backend `AttainmentRecord` number/bool declarations do not validate runtime JSON. `loadedOf` verifies only the loaded object and array. This mismatch predates the fixes. Missing indirect alone has existing supported fallback behavior and must not be conflated with missing direct.

Smallest next action: agree on backend missing-measurement semantics, then test null-direct/null-threshold separately with mocked persistence. Avoid coercion or at-risk classification without a valid measured value. Because composite storage is required, a complete correction may need a product decision; this audit does not authorize schema changes or silently select a new policy.

### BC-003 — Reduced workbook diagnostics

The failure envelope is handled, but cell metadata is not rendered and is not retained in upload-history error text. Propose safe display of structured sheet/cell/field/reason and an explicit fallback for legacy error shapes. This improves actionable errors without changing calculation or state transitions. Existing plain-string/history failures and section-mismatch UI must continue to work.

The immediate HTTP-detail mismatch, optional summary property and extra-credit edit/storage constraints are additional existing contract limitations, not confirmed regressions caused by Phase 2A.

## Evidence reviewed and limitations

| Saved record | Supports | Does not prove |
| --- | --- | --- |
| [UT-004](evidence/20261011T063734_111127Z/UT-004_result.txt), executed 2026-10-11T06:37:37.000258+00:00 | 98 passing subchecks: strict validation, identity/CLO uniqueness, accepted blanks/zero/numeric strings and extra-credit calculations. | Actual instructor workbooks, institutional extra-credit policy or Bun error presentation. |
| [UT-005](evidence/20261011T063734_111127Z/UT-005_result.txt), [UT-006](evidence/20261011T063734_111127Z/UT-006_result.txt), [UT-010](evidence/20261011T063734_111127Z/UT-010_result.txt) | Independent synthetic numerical calculations, classification boundary and comparisons. | Database persistence, webapp rollup/UI behavior. |
| [UT-008](evidence/20261011T063734_111127Z/UT-008_result.txt), executed 2026-10-11T06:37:49.955436+00:00 | Valid course response encoding and rejection of malformed schema. | A course-endpoint webapp consumer or live provider output. |
| [UT-009](evidence/20261011T063734_111127Z/UT-009_result.txt), executed 2026-10-11T06:37:50.080054+00:00 | Mocked provider failures/invalid responses, valid institutional prose and error sentinels. | Backend recognition of HTTP-200 application errors. |
| [ST-AI-004](evidence/20261011T063734_111127Z/ST-AI-004_result.txt), [ST-AI-006](evidence/20261011T063734_111127Z/ST-AI-006_result.txt), [ST-AI-007](evidence/20261011T063734_111127Z/ST-AI-007_result.txt) | Supported numerical grounding, Python advisory behavior and null no-gaps shortcut. | Arbitrary prose correctness, webapp approval controls or frontend runtime. |
| [IT-007](evidence/20261011T071933_296064Z/IT-007_result.txt), [IT-009](evidence/20261011T071933_296064Z/IT-009_result.txt), [integration execution summary](evidence/20261011T071933_296064Z/EXECUTION_SUMMARY.json) | Real Python upload/job routes, explicit worker, disposable Redis, terminal states and independently checked isolated results. | Bun integration, app.main startup/auth, real network deployment or production database. Transport was in-process ASGI. HTTP 202 alone was not counted as completion. |

[Backend AI integration test source](../../../backend/test/integration/ai.test.ts), lines 198–245 asserts persistence/display conversion from an injected `status: "ok"` response; no invalid-envelope assertion was found in that file. [Backend ingest integration tests](../../../backend/test/integration/ingest.test.ts), lines 441–479 includes failed upload-history assertions. These test sources were inspected, **not executed**, and no verifiable run result for them was supplied by the Python evidence package. They are not classified as verified passing tests.

The current [consolidated results](PRE_UAT_RESULTS.md) and [evidence index](EVIDENCE_INDEX.md) remain authoritative for executed Python IDs. Performance remains incomplete. Historical scripts and all earlier evidence are unchanged.

## Smallest safe verification plan — pending approval

No tests below were implemented or run during this audit.

1. Backend unit contract tests with mocked fetch and mocked Prisma only: institutional HTTP-200 error envelope must cause an error and zero writes; nonempty prose must remain accepted; optional error fields and existing 422/HTTP-failure handling must be retained. Existing `AiRecommendationService` fetch injection is available; prevent module imports from connecting to configured databases/Redis.
2. Backend ingestion unit contracts using saved synthetic Python result/error shapes: queued/running/completed/failed conversion; failed WorkbookValidationError never persists attainments; null direct/threshold is not converted into measured zero/at-risk without approved policy; direct 0.80, indirect 90.00, composite 83.00 retain their scales. Include optional IDs/metadata and extra credit separately.
3. Frontend component tests with mocked actions/API: failed workbook message, sanitized cell details if later supported, ready/save transition, absent stored recommendation, valid prose and an AI-generation error toast. No real browser authentication or backend service required.
4. Only after those contracts and policies are settled, optionally run an explicitly approved end-to-end smoke test against wholly disposable Python/Bun/database/Redis instances with external networking blocked. The existing Python-only integration harness does not establish this isolation for Bun/Prisma.

Stop here. No tests, backend/frontend changes or further performance debugging are authorized by this audit.

## Documentation integrity check

All source/evidence links in this report were checked for existence. All existing production, test harness, historical-test, documentation and evidence files under `app/` and `testing_modules/` were protected by a before/after SHA-256 aggregate comparison; this new report is excluded from that comparison. No prior file was changed. The status counts remain 20 PASS, 0 FAIL, 5 BLOCKED and 1 SKIPPED; no runtime compatibility PASS was added.

The executed Python-side tests passed and their current source hashes match saved execution manifests. The source-level API audit found intentional validation changes and preexisting integration gaps requiring follow-up. It does not establish full webapp Pre-UAT, production readiness or reviewer approval.
