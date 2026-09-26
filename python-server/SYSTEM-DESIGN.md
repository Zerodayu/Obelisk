# OBELISK ETL & Analytics Service — System Design

> **Status:** Implemented — upload/ETL + analytics endpoints live; job queue is durable (Redis); AI recommendations are integrated via `google-genai`. This records the current design and the integration contract with the webapp for the **v2 AUN-OBE Template**.
>
> **Role in the platform:** the authoritative **pure-compute** engine for spreadsheet-derived attainment. It never persists application data and never authenticates — see §7 ownership boundary.

**Stack:** Python 3.13 · FastAPI · Pydantic v2 · **Redis** · openpyxl · structlog · `google-genai` · Docker Compose. Runs on port **8000**. Canonical formulas/constants live in `documentations/FORMULAS.md` and `documentations/CONSTANTS.md`.

---

## 1. Architecture

```
class-record .xlsx ──POST /upload──> app (FastAPI :8000)
      └─ upload_service.save_upload_file (chunked, size-limited, atomic)
      └─ job_queue.enqueue ──> Redis List (durable queue)
             └─ N background workers (workers/worker.py)
                    └─ run_full_pipeline (abstracts.py):
                         Extractor   = ExcelExtractor   (openpyxl; reads Direct CLO & Indirect CLO)
                         Transformer = SimpleTransformer (Formulas 1A & 1B, levels, Rule 1)
                         Loader      = DummyLoader      (returns JSON; no sink)
             └─ job status stored in Redis Hash: queued → running → completed | failed

consolidated JSON payload ──POST /analytics/summary|institutional-summary──>
      └─ institutional_summary.py (Formulas 2A/7A/7C, Rule 3, aggregators)
      └─ cqi_recommender.py (gap detection, prompt build, call_llm_api via google-genai)
```

- **Durable Queue:** Job state and the job queue itself are managed in **Redis**. This ensures that jobs are not lost if the application container restarts.
- **Workers:** `settings.JOB_WORKER_COUNT` (default 4) async consumers started on app startup, cancelled on shutdown.
- **Config:** `app/core/config.py` reads `OBELISK_*` env vars (`.env` optional): `ALLOWED_ORIGINS`, `UPLOAD_FOLDER`, `MAX_UPLOAD_SIZE`, `JOB_QUEUE_MAXSIZE`, `JOB_WORKER_COUNT`, `DEBUG`, **`REDIS_HOST`**, **`REDIS_PORT`**, **`LLM_API_KEY`**, **`WEBAPP_SHARED_SECRET`**.
- **CORS:** default allow `http://localhost:3000` + `http://127.0.0.1:3000`, credentials enabled.
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
| POST | `/analytics/institutional-summary` | Full institution-wide summary + AI recommendation (VPAA-only; no internal guard) |
| GET | `/health` | Health check |
| POST | `/etl/extract`·`/transform`·`/load`·`/pipeline` | Manual debug endpoints with placeholder sources (not used in production flow) |

## 4. Data schemas (`app/schemas/`)

- **`class_record.py`** (all `extra="forbid"`):
  - `ClassRecordHeader` — course_code/title/type, section, semester_year, instructor, `no_of_students`, `threshold` (workbook's own, informational), grading_system, `workbook_configured_weights_unused`.
  - `StudentRawCloData` (`extracted.py`) — intermediate raw score data: student_id/name, clo_code, prelim_score/max, midterm_score/max, final_score/max, indirect_rating.
  - `StudentCLOAttainment` — per-CLO output: `direct_clo_attainment_pct`, `indirect_clo_attainment_pct`, `met_threshold`, `clo_level`, `formula_version`, completeness fields (`is_record_complete`, `section_completeness_pct`, `rule1_met`), category pcts (default `None`), and `excluded_reason` (always `None`).
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
  - Applies 70% institutional threshold, 4-tier `clo_level`, and Rule 1 completeness.
  - Sets `excluded_reason = None` for all rows.
  - Emits deterministic `formula_version` hash.
- **`DummyLoader`** (`app/etl/load/loader.py`): returns `{status, received_records, header, attainments, clo_plo_mapping}`.

## 6. Analytics engine (`app/analytics/`)

- **`institutional_summary.py`** — `compute_summary_only` (no AI): anonymizes students, aggregates by department/program/AVP group (`_generic_aggregator`), computes CLO means (2A), PLO rollups (7A) + program-level average (7C), Rule-3 completeness, worst-performing CLOs. `generate_institutional_summary` adds prompt + LLM response.
- **`cqi_recommender.py`** — `identify_gaps` (CLOs below threshold), `build_prompt`, `anonymize_students`, `call_llm_api` via `google-genai` client, `generate_cqi_recommendation`.

## 7. Ownership boundary (avoid overlap with the webapp)

- **Owned here:** `.xlsx` parsing (AUN-OBE format); Formula 1A direct attainment and Formula 1B indirect attainment; 4-tier levels + completeness; Formulas 2A/7A/7C rollups; AI recommendation text via `google-genai`.
- **Owned by webapp backend:** persistence (`CloAttainment`, `PloAttainment`, `ComputationRun`), auth/RBAC, curriculum mapping (`curriculum_map` / CLO-PLO correlation), approval workflow, form CRUD/lifecycle, audit trail, report export.
- **Rule:** the webapp calls this service as the authoritative spreadsheet-compute engine and stores the results; this service never re-implements persistence or auth, and the webapp never re-implements attainment math.

## 8. Integration contract (with the Elysia webapp)

The authoritative contract is `documentations/INTEGRATION.md`. Key points:

- Elysia must run all auth/RBAC **before** calling any endpoint (esp. `POST /analytics/institutional-summary`).
- `POST /upload` → poll `GET /jobs/{job_id}`; parse structured `error` object (`error_type`/`message`/`details`) for user-facing messages.
- Attainment results now include `indirect_clo_attainment_pct` (`0.0 - 100.0%`), and `excluded_reason` is always `null`.
- `clo_plo_mapping` returned by `/jobs/{job_id}` is empty (`[]`); the webapp uses its own DB-backed `curriculum_map` to link CLOs to PLOs.
- `POST /analytics/summary` is safe for any dashboard role; it never triggers AI.

## 9. Deployment

- **Docker:** `docker compose up --build -d` starts the application container and a Redis container.
- **Local:** `docker compose up -d redis` followed by `uv sync` and `uv run dev`.
- **Env:** `OBELISK_ALLOWED_ORIGINS`, `OBELISK_UPLOAD_FOLDER`, `OBELISK_MAX_UPLOAD_SIZE`, `OBELISK_JOB_WORKER_COUNT`, `OBELISK_REDIS_HOST`, `OBELISK_REDIS_PORT`, `OBELISK_LLM_API_KEY`, `OBELISK_WEBAPP_SHARED_SECRET`.

## 10. Known limitations / deferred

From `documentations/KNOWN_LIMITATIONS.md`:
- Indirect attainment is now computed per-student from the exit survey Likert rating (`(rating / 5) * 100`). Composite (70/30) combining is handled downstream in the webapp.
- CLO-PLO correlation is retired from Excel ingestion (owned by webapp).
- Granular category breakdown (`tla_pct`, `at_pct`, `exam_pct`, `output_pct`) is `null` because the AUN-OBE template provides period subtotals rather than individual assessment tasks.
- Rule 1 may false-negative CLOs intentionally not assessed in all three periods.
- Unused SQLAlchemy/Alembic scaffolding in `app/database` + `app/models` pending removal decision.
