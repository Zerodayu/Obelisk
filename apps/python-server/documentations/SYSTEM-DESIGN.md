# OBELISK ETL & Analytics Service — System Design

> **Status:** Implemented in source — upload/ETL and analytics routes, Redis queue, and `google-genai` multi-key failover. This describes the current code for the **v2 AUN-OBE Template**, not a claim of deployment readiness or live verification.
>
> **Role in the platform:** the authoritative **pure-compute** engine for spreadsheet-derived attainment, without application database access or user RBAC. Upload files and Redis job state are stored for processing; optional shared-secret caller authentication is implemented — see §7.

**Stack:** Python 3.13 · FastAPI · Pydantic v2 · **Redis** · openpyxl · structlog · `google-genai` · Docker Compose. Runs on port **8000**. Canonical formulas/constants live in `documentations/FORMULAS.md` and `documentations/CONSTANTS.md`.

---

## 1. Architecture

Final UT-004 validation: the extractor validates score/rating cells, per-sheet duplicate IDs/CLOs and ambiguous name fallback before data can be overwritten. Invalid data uses the existing OBELISKError mechanism through `WorkbookValidationError`, exposing locations/reasons without identities or raw invalid values. Extra credit, blanks/zero, numeric strings, valid cross-sheet matching, metadata parsing and formulas are preserved; see [INTEGRATION.md](INTEGRATION.md).

Approved Pre-UAT validation corrections (October 11, 2026): the v2 transformer rejects negative non-null period scores with a structured, identity-free `TransformationError`. Course CQI validates its JSON contract at the course boundary while retaining a string response; course and institutional boundaries reject empty/non-string text, including empty fences. Institutional prose, no-gap behavior, provider failover and all numerical formulas remain unchanged. See [INTEGRATION.md](INTEGRATION.md) for response and validation details.

```
class-record .xlsx ──POST /upload──> app (FastAPI :8000)
      └─ upload_service.save_upload_file (chunked, size-limited, atomic)
      └─ job_queue.enqueue ──> Redis List (durable queue)
             └─ N background workers (workers/worker.py)
                    └─ run_full_pipeline (abstracts.py):
                         Extractor   = ExcelExtractor   (openpyxl; reads Direct CLO & Indirect CLO)
                         Transformer = SimpleTransformer (Formulas 1A & 1B, levels, Rule 1)
                         Loader      = DummyLoader      (returns JSON; no sink)
             └─ job status stored as Redis JSON string: queued → running → completed | failed

consolidated JSON payload ──POST /analytics/summary|institutional-summary──>
      └─ institutional_summary.py (Formulas 2A/7A/7C, Rule 3, aggregators)
      └─ cqi_recommender.py (gap detection, prompt build, call_llm_api via google-genai multi-key pool)
```

- **Queue:** Redis stores pending IDs in a list and job objects in JSON string keys (`SET`), namespaced as `obelisk:<OBELISK_ENV>:job_queue` / `obelisk:<OBELISK_ENV>:job:*`. Pending state can outlive a Python process while Redis is retained. Redis restart durability depends on its deployment; `BRPOP` removes jobs before processing and there is no acknowledgement/requeue recovery for interrupted jobs.
- **Workers:** `settings.JOB_WORKER_COUNT` (default 4) async consumers started on app startup, cancelled on shutdown.
- **Config:** `app/core/config.py` reads `OBELISK_*` env vars from process env; `app/core/env.py` first decrypts the repo-root `.env.local` / `.env.prod` into it (`OBELISK_ENV` picks the file, `local` by default, `prod` in compose — there is no per-package `.env`): `ALLOWED_ORIGINS`, `UPLOAD_FOLDER`, `MAX_UPLOAD_SIZE`, `JOB_QUEUE_MAXSIZE`, `JOB_WORKER_COUNT`, `DEBUG`, **`REDIS_HOST`**, **`REDIS_PORT`**, **`LLM_API_KEYS`** (or legacy **`LLM_API_KEY`**), **`WEBAPP_SHARED_SECRET`**, **`ENV`** (`OBELISK_ENV` profile, `local` default — namespaces the Redis job keys).
- **CORS:** `OBELISK_ALLOWED_ORIGINS` from the root env files (comma-separated or JSON list); built-in fallback is `["*"]` with credentials enabled.
- **Logging:** structlog key=value events (`configure_logging` in `app/core/logging.py`).

## 2. Request flow

1. Webapp backend authenticates/authorizes the caller, then calls this service.
2. Upload path: `POST /upload` → save file → enqueue ETL job in Redis → `202 {job_id, status:"queued"}`; webapp polls `GET /jobs/{job_id}` until `completed`/`failed`.
3. Analytics path: webapp assembles a consolidated `InstitutionalSummaryPayload` from stored results → `POST /analytics/summary` (pure rollups, no AI) or `POST /analytics/institutional-summary` (AI; **webapp must gate to VPAA**).
4. This service returns JSON only; webapp persists everything.

## 3. API Endpoints (implemented)

| Method | Path | Purpose |
|---|---|---|
| POST | `/upload` | Accept class-record `.xlsx`; enqueue ETL job (202 → `job_id`); 413 if too large; 503 if queue full |
| GET | `/jobs` | List all jobs tracked in Redis |
| GET | `/jobs/{job_id}` | Poll job status/result; 404 if not found |
| GET | `/analytics/jobs/{job_id}/recommendation` | Per-course AI CQI recommendation (needs completed job; 409 if job pending or failed) |
| POST | `/analytics/summary` | Pure rollups by department/program/AVP group + worst-performing CLOs (safe for any role; no AI) |
| POST | `/analytics/institutional-summary` | Summary + AI; webapp must authorize VPAA; optional caller-secret dependency |
| GET | `/health/` | Hardcoded status response with TODO timestamp, not a dependency-readiness probe; `/health` redirects |
| POST | `/etl/extract`·`/transform`·`/load`·`/pipeline` | Manual debug endpoints with placeholder sources (not used in production flow) |

## 4. Data schemas (`app/schemas/`)

- **`class_record.py`** (all `extra="forbid"`):
  - `ClassRecordHeader` — course_code/title/type, section, semester_year, instructor, `no_of_students`, `threshold` (workbook's own, informational), grading_system, `workbook_configured_weights_unused`.
  - `StudentRawCloData` (`extracted.py`) — intermediate raw score data: student_id/name, clo_code, prelim_score/max, midterm_score/max, final_score/max, indirect_rating.
  - `StudentCLOAttainment` — per-CLO output: direct fraction, indirect/composite percentages, threshold/level from rounded composite, literal `formula_version="70_30_v1"`, completeness fields, category pcts (default `None`), and `excluded_reason` (always `None` for v2 ETL).
- **`institutional_summary.py`** — `Period` (`semester|year|custom`), `CourseSubmission` (dept/program/avp_group/course/section + header + attainments + clo_plo_mapping), `InstitutionalSummaryPayload` (period + submissions, `extra="forbid"`).

## 5. ETL pipeline (v2 AUN-OBE Template)

- **`ExcelExtractor`** (`app/etl/extract/extractor.py`):
  - Validates sheet presence (`Direct CLO`, `Indirect CLO`) and marker cells at `A1` *before* extraction.
  - Discovers CLO blocks dynamically (scanning row 3 for Direct CLO, row 4 for Indirect CLO until blank).
  - Dynamically reads student roster starting row 5 until blank row or known summary label (`CLASS AVERAGE`, `MEAN RATING`, `%age CO ATTAINMENT`).
  - Extracts 6 raw score/max cells per student per CLO from Direct CLO and raw Likert rating from Indirect CLO.
  - CLO-PLO mapping is permanently retired from python-server and returns `[]`.
  - Errors: `InvalidWorkbook`, `MissingWorksheet`, `InvalidTemplate`, `UnsupportedCourseType`.
- **`SimpleTransformer`** (`app/etl/transform/transformer.py`):
  - Computes direct attainment independently from raw score cells ($\frac{\text{Prelim}+\text{Midterm}+\text{Final}}{\text{Prelim Max}+\text{Midterm Max}+\text{Final Max}}$).
  - Computes indirect attainment independently as $(\frac{\text{Rating}}{5.0}) \times 100$.
  - Computes the 70/30 composite (direct-only fallback when indirect is null), rounds to two decimals, then applies 70% threshold and 4-tier level. Rule 1 checks all three periods. See [FORMULAS.md](FORMULAS.md).
  - Sets `excluded_reason = None` for all rows.
  - Emits the literal `formula_version="70_30_v1"`, not a hash.
- **`DummyLoader`** (`app/etl/load/loader.py`): returns `{status, received_records, header, section, section_extraction, setup, attainments, clo_plo_mapping}`.

## 6. Analytics engine (`app/analytics/`)

- **`institutional_summary.py`** — `compute_summary_only` (no AI): anonymizes students, aggregates by department/program/AVP group (`_generic_aggregator`), computes CLO means (2A), PLO rollups (7A) + program-level average (7C), Rule-3 completeness, worst-performing CLOs. `generate_institutional_summary` adds prompt + LLM response. `build_institutional_prompt` appends a **"Pedagogical alignment for the courses behind these gaps"** block (Bloom's Taxonomy, I-P-D stage, assessment types) built from the extra keys the webapp folds into each submission's `clo_plo_mapping` (`_alignment_rows` → `alignment_lines`), plus a 4th instruction telling the LLM to cite the Bloom's level / I-P-D stage when a recommendation touches a CLO; the block is skipped entirely when no entry carries an alignment key. If all API keys are exhausted, flags `"status": "error"` and populates `"error"`.
- **`cqi_recommender.py`** — `identify_gaps` (CLOs below threshold), `build_prompt`, `anonymize_students`, `call_llm_api` with prioritized multi-key rotation/failover across `settings.llm_api_keys_list`, `generate_cqi_recommendation`, plus the shared **`alignment_lines` / `alignment_block`** helpers (`IPD_STAGE_NAMES` spells I/P/D out; `MAX_ALIGNMENT_LINES = 60` caps the prompt block so a large term cannot blow it up) and `build_prompt`'s optional alignment block (rule added to `CQI_ADVISORY_SYSTEM_PROMPT` to cite supplied alignment):
  - Iterates sequentially through all configured API keys in `OBELISK_LLM_API_KEYS`.
  - On per-key exception (e.g. 429 quota exhaustion or network fault), logs warning `llm_key_failed` and immediately attempts the next key.
  - If all keys fail, logs `llm_all_keys_exhausted` and returns `[LLM API ERROR: All N configured API key(s) were exhausted without success...]`.
  - Propagates `"status": "error"` and `"error"` to callers if LLM generation failed.
  - `IS_DEBUG_MODE=False` is the production source toggle; offline legacy tests patch it to True and deny real clients. `OBELISK_DEBUG` only affects logging.
  - Model source default is `gemini-3.6-flash` in `Settings`; `OBELISK_LLM_MODEL` overrides it through root env/runtime values. Pre-set values win during dotenvx loading, and `OBELISK_ENV_FILE` can override file selection. Settings are built at import, not automatically hot-reloaded.
  - Missing valid keys raise `NotImplementedError` (HTTP 501 at AI routes); course no-gap results bypass LLM calls. There is no automatic mock fallback.
  - Outer multiline JSON/plain fences are stripped without truncating embedded backticks; course JSON is validated and institutional nonempty prose remains accepted. See [INTEGRATION.md](INTEGRATION.md).

## 7. Ownership boundary (avoid overlap with the webapp)

- **Owned here:** `.xlsx` parsing (AUN-OBE format); Formula 1A direct attainment and Formula 1B indirect attainment; 4-tier levels + completeness; Formulas 2A/7A/7C rollups; AI recommendation text via `google-genai` multi-key pool.
- **Owned by webapp backend:** persistence (`CloAttainment`, `PloAttainment`, `ComputationRun`), auth/RBAC, curriculum mapping (`curriculum_map` / CLO-PLO correlation), approval workflow, form CRUD/lifecycle, audit trail, report export.
- **Rule:** the webapp owns application persistence and user auth/RBAC; this service owns spreadsheet computation and optional caller-secret validation. Protected upload/jobs/analytics routes use `X-Webapp-Secret` when configured; health/manual ETL routes do not. The webapp does not duplicate attainment math.

## 8. Integration contract (with the Elysia webapp)

The authoritative contract is `documentations/INTEGRATION.md`. Key points:

- Elysia must run all auth/RBAC **before** calling any endpoint (esp. `POST /analytics/institutional-summary`).
- `POST /upload` → poll `GET /jobs/{job_id}`; parse structured `error` object (`error_type`/`message`/`details`) for user-facing messages.
- Attainment results now include `indirect_clo_attainment_pct` (`0.0 - 100.0%`), and `excluded_reason` is always `null`.
- `clo_plo_mapping` returned by `/jobs/{job_id}` is empty (`[]`); the webapp uses its own DB-backed `curriculum_map` to link CLOs to PLOs.
- `POST /analytics/summary` is safe for any dashboard role; it never triggers AI.
- AI endpoints (`/recommendation`, `/institutional-summary`) return `"status": "error"` and detailed `error` if the API key pool is exhausted.

## 9. Deployment

- **Docker:** the repo-root `docker-compose.yml` builds this service as `--target etl`; from the repository root, `docker compose up -d --build` starts the full stack (backend, frontend, etl, redis) and `docker compose up -d etl` just this container plus its Redis dependency.
- **Local:** `just redis` from the repository root, followed by `uv sync` and `uv run dev`.
- **Env:** `OBELISK_ALLOWED_ORIGINS`, `OBELISK_UPLOAD_FOLDER`, `OBELISK_MAX_UPLOAD_SIZE`, `OBELISK_JOB_WORKER_COUNT`, `OBELISK_REDIS_HOST`, `OBELISK_REDIS_PORT`, `OBELISK_LLM_API_KEYS` (or `OBELISK_LLM_API_KEY`), `OBELISK_WEBAPP_SHARED_SECRET`.

## 10. Known limitations / deferred

From `documentations/KNOWN_LIMITATIONS.md`:
- Indirect and rounded 70/30 composite attainment are computed here, not downstream. Institutional means prefer composite fractions with direct fallback; the retained `plo_attainment_direct_only` name does not change that behavior.
- CLO-PLO correlation is retired from Excel ingestion (owned by webapp).
- Granular category breakdown (`tla_pct`, `at_pct`, `exam_pct`, `output_pct`) is `null` because the AUN-OBE template provides period subtotals rather than individual assessment tasks.
- Rule 1 may false-negative CLOs intentionally not assessed in all three periods.
- Unused SQLAlchemy/Alembic scaffolding in `app/database` + `app/models` pending removal decision.
- Worker processing has no configured timeout or completed-upload cleanup. The queue does not recover already-popped interrupted jobs.

## 11. Verification and historical evidence

Use `python -B testing_modules/old_test/run_all.py` from this service directory.
The [testing guide](TESTING.md) explains the runners; the [legacy README](../testing_modules/old_test/README.md) records the October 13,
2026 repair verification (50 unittest cases and two standalone checks passed),
isolation, fixtures and excluded live modes. This documentation audit did not
rerun tests or services. Mocked provider/queue/API behavior is not live Gemini,
Redis, performance, deployment or whole-webapp acceptance evidence.

The separate [Pre-UAT package](../testing_modules/pre_uat/README.md) retains its
October 11 dates, test-ID counts, model settings and source manifests. Statements
about unchanged originals/hash matches apply to that build, before later legacy
and parser repairs. Its historical results and unresolved findings are preserved.
