# OBELISK ETL & Analytics Service — System Design

> **Status:** Implemented — upload/ETL + analytics endpoints live; job queue is durable (Redis); AI recommendations are integrated. This records the current design and the integration contract with the webapp.
>
> **Role in the platform:** the authoritative **pure-compute** engine for spreadsheet-derived attainment. It never persists application data and never authenticates — see §7 ownership boundary.

**Stack:** Python 3.13 · FastAPI · Pydantic v2 · **Redis** · openpyxl/pandas · structlog · Docker Compose. Runs on port **8000**. Canonical formulas/constants live in `documentations/FORMULAS.md` and `documentations/CONSTANTS.md`.

---

## 1. Architecture

```
class-record .xlsx ──POST /upload──> app (FastAPI :8000)
      └─ upload_service.save_upload_file (chunked, size-limited, atomic)
      └─ job_queue.enqueue ──> Redis List (durable queue)
             └─ N background workers (workers/worker.py)
                    └─ run_full_pipeline (abstracts.py):
                         Extractor  = ExcelExtractor   (openpyxl; cells from etl_const)
                         Transformer = SimpleTransformer (Formula 1A, levels, Rule 1)
                         Loader     = DummyLoader      (returns JSON; no sink)
             └─ job status stored in Redis Hash: queued → running → completed | failed

consolidated JSON payload ──POST /analytics/summary|institutional-summary──>
      └─ institutional_summary.py (Formulas 2A/7A/7C, Rule 3, aggregators)
      └─ cqi_recommender.py (gap detection, prompt build, call_llm_api)
```

- **Durable Queue:** Job state and the job queue itself are managed in **Redis**. This ensures that jobs are not lost if the application container restarts.
- **Workers:** `settings.JOB_WORKER_COUNT` (default 4) async consumers started on app startup, cancelled on shutdown.
- **Config:** `app/core/config.py` reads `OBELISK_*` env vars (`.env` optional): `ALLOWED_ORIGINS`, `UPLOAD_FOLDER`, `MAX_UPLOAD_SIZE`, `JOB_QUEUE_MAXSIZE`, `JOB_WORKER_COUNT`, `DEBUG`, **`REDIS_HOST`**, **`REDIS_PORT`**.
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
| GET | `/jobs/{job_id}` | Poll job status/result; 404 unknown, 409 if not `completed` |
| GET | `/analytics/jobs/{job_id}/recommendation` | Per-course AI CQI recommendation (needs completed job). |
| POST | `/analytics/summary` | Pure rollups by department/program/AVP group + worst-performing CLOs (safe for any role; no AI) |
| POST | `/analytics/institutional-summary` | Full institution-wide summary + AI recommendation (VPAA-only; no internal guard) |
| GET | `/health` | Health check |
| POST | `/etl/extract`·`/transform`·`/load`·`/pipeline` | Manual debug endpoints with placeholder sources (not used in production flow) |

## 4. Data schemas (`app/schemas/`)

- **`class_record.py`** (all `extra="forbid"`):
  - `ClassRecordHeader` — course_code/title/type, section, semester_year, instructor, `no_of_students`, `threshold` (workbook's own, informational), grading_system, `workbook_configured_weights_unused`.
  - `RawScoreRecord` — student_id/name, `grading_period` (`PRELIM|MIDTERM|FINAL`), `assessment_category` (`TLA|AT|EXAM|OUTPUT`), assessment_no, clo_code, activity_name, max_score, raw_score.
  - `StudentCLOAttainment` — per-CLO output: `direct_clo_attainment_pct`, `met_threshold`, `clo_level`, `formula_version`, completeness fields (`is_record_complete`, `section_completeness_pct`, `rule1_met`) + informational category pcts (tla/at/exam/output).
- **`institutional_summary.py`** — `Period` (`semester|year|custom`), `CourseSubmission` (dept/program/avp_group/course/section + header + attainments + clo_plo_mapping), `InstitutionalSummaryPayload` (period + submissions, `extra="forbid"`).

## 5. ETL pipeline

- **`ExcelExtractor`** (`app/etl/extract/extractor.py`): validates template (`STUDENT NAME` at `B12`/`B18`), reads header + roster, extracts per-period assessment blocks from Database/Exam/Output sheets, parses the CLO-PLO map from the COVERPAGE. All cell addresses/columns from `etl_const` (see `documentations/CONSTANTS.md`). Errors: `InvalidWorkbook`, `MissingWorksheet`, `InvalidTemplate`.
- **`SimpleTransformer`** (`app/etl/transform/transformer.py`): validates `raw_score <= max_score`, computes per-student-per-CLO attainment (Formula 1A), 4-tier `clo_level`, `met_threshold`, Rule-1 completeness + section completeness. Emits a deterministic `formula_version` hash.
- **`DummyLoader`** (`app/etl/load/loader.py`): returns `{status, received_records, header, attainments, clo_plo_mapping}` — a placeholder sink until a real delivery mechanism (direct HTTP to webapp) is implemented.

## 6. Analytics engine (`app/analytics/`)

- **`institutional_summary.py`** — `compute_summary_only` (no AI): anonymizes students, aggregates by department/program/AVP group (`_generic_aggregator`), computes CLO means (2A), PLO rollups (7A) + program-level average (7C), Rule-3 completeness, worst-performing CLOs. `generate_institutional_summary` adds prompt + LLM response.
- **`cqi_recommender.py`** — `identify_gaps` (CLOs below threshold), `build_prompt`, `anonymize_students`, `call_llm_api`, `generate_cqi_recommendation`.

## 7. Ownership boundary (avoid overlap with the webapp)

See `AGENTS.md` for the full table. Summary of what **this service owns** vs the Elysia backend:

- **Owned here:** `.xlsx` parsing; Formula 1A direct attainment + levels + completeness; Formulas 2A/7A/7C rollups; AI recommendation text.
- **Owned by webapp backend:** persistence (`CloAttainment`, `PloAttainment`, `ComputationRun`), auth/RBAC, approval workflow, form CRUD/lifecycle, audit trail, report export, and form-level aggregation not done here (longitudinal cohort tracking, divergence detection, CTL loop status, CQI lifecycle).
- **Rule:** the webapp calls this service as the authoritative spreadsheet-compute engine and stores the results; this service never re-implements persistence or auth, and the webapp never re-implements Formula 1A/rollups.

## 8. Integration contract (with the Elysia webapp)

The authoritative contract is `documentations/INTEGRATION.md`. Key points:

- Elysia must run all auth/RBAC **before** calling any endpoint (esp. `POST /analytics/institutional-summary`).
- `POST /upload` → poll `GET /jobs/{job_id}`; parse the structured `error` object (`error_type`/`message`/`details`) for user-facing messages (e.g. `MissingWorksheet`).
- Elysia persists `StudentCLOAttainment` results into its `CloAttainment`/`ComputationRun` models, storing `directScorePct`, `isBelowThreshold` (from `met_threshold`), and formula provenance.
- `POST /analytics/summary` is safe for any dashboard role; it never triggers AI.

## 9. Deployment

- **Docker:** `docker compose up --build -d` starts the application container and a Redis container.
- **Local:** `docker compose up -d redis` followed by `uv sync` and `uv run dev`.
- **Env:** `OBELISK_ALLOWED_ORIGINS`, `OBELISK_UPLOAD_FOLDER`, `OBELISK_MAX_UPLOAD_SIZE`, `OBELISK_JOB_WORKER_COUNT`, `OBELISK_REDIS_HOST`, `OBELISK_REDIS_PORT`, etc.

## 10. Known limitations / deferred

From `documentations/KNOWN_LIMITATIONS.md`: **indirect (30%) attainment not computed** (no survey data pipeline — reporting direct-only is the correct interim behavior); `correlation_strength` is metadata only (not a weight); Rule 1 may false-negative CLOs intentionally not assessed in all three periods; unused SQLAlchemy/Alembic scaffolding in `app/database` + `app/models` pending removal decision.

## 11. Future roadmap (from `TODOs.md`)

37 OBE forms processing; CLO→PLO aggregation pipeline polish; student cohort analytics; CQI recommendation engine (rules + data science); approval-workflow/registrar integration; real loader/delivery; tests + CI.
