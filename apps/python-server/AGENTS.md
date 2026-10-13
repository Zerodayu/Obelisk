# OBELISK ETL & Analytics Service — Agent Guide

**Product:** OBELISK — the pure-compute Python microservice for Jose Maria College Foundation, Inc. (JMCFI). It converts instructor class-record Excel workbooks into per-student Direct CLO attainment, and rolls consolidated course results up into program/department/AVP analytics with AI CQI recommendations.

**Stack:** Python 3.13 · FastAPI · Pydantic v2 (`pydantic-settings`) · openpyxl · pandas · structlog · uv (dev) / Docker Compose (deploy). Runs on port **8000**.

## Service identity (read before changing anything)

This is a **pure compute engine** with two hard boundaries that must not be crossed without explicit product decision:

- **No database access.** Never reads or writes a database. All input arrives via HTTP request body, all results return as JSON. The job queue is Redis-backed (`obelisk:<OBELISK_ENV>:job_queue`) and survives restarts; do not add a database.
- **No user authentication/RBAC.** The Elysia backend verifies users and roles before calling here (including VPAA-only institutional summaries). The implemented optional `OBELISK_WEBAPP_SHARED_SECRET` check validates `X-Webapp-Secret` on upload/jobs/analytics routes; it does not implement user authorization. Health/manual ETL routes do not carry that dependency.

## File Structure

```
app/
├── main.py                        # FastAPI app: CORS, router includes, worker lifecycle
├── core/
│   ├── config.py                  # pydantic-settings Settings (OBELISK_* env prefix)
│   ├── env.py                     # decrypts the repo-root .env.local/.env.prod (OBELISK_ENV) into os.environ
│   ├── exceptions.py              # OBELISKError hierarchy → structured to_dict()
│   └── logging.py                 # structlog configuration
├── api/routes/
│   ├── upload.py                  # POST /upload (save file + enqueue ETL job)
│   ├── etl.py                     # /etl/extract|transform|load|pipeline (manual debug)
│   ├── jobs.py                    # /jobs, /jobs/{job_id}
│   ├── analytics.py               # /analytics/jobs/{id}/recommendation, /summary, /institutional-summary
│   └── health.py                  # GET /health
├── services/
│   ├── job_queue.py               # Redis list queue + JSON string job values, env-prefixed keys
│   └── upload_service.py          # chunked atomic file save w/ size limit
├── workers/worker.py              # background worker loop consuming the queue
├── etl/
│   ├── etl_const.py               # ALL workbook cell/sheet/rule constants (single source)
│   ├── abstracts.py               # Extractor/Transformer/Loader ABCs + run_full_pipeline
│   ├── extract/extractor.py       # ExcelExtractor (openpyxl)
│   ├── transform/transformer.py   # SimpleTransformer (Formula 1A, levels, Rule 1)
│   └── load/loader.py             # DummyLoader (returns result dict; no real sink)
├── analytics/
│   ├── cqi_recommender.py         # gap detection + prompt build + call_llm_api (IS_DEBUG_MODE)
│   └── institutional_summary.py   # Formulas 2A/7A/7C, Rule 3, aggregators
├── schemas/                       # Pydantic models (class_record, institutional_summary, job)
├── models/                        # (unused) DB scaffolding — do not rely on it
├── database/                      # (unused) SQLAlchemy scaffolding — do not rely on it
└── utils/
    ├── types.py                   # JobStatus enum
    └── excel.py                   # excel helpers
classrecord_templates/             # sample JMCFI class-record workbooks
testing_modules/old_test/          # original scripts, repaired offline runner and regression support
testing_modules/pre_uat/           # separate institutional harness and dated evidence/reports
documentations/                    # CONSTANTS.md, FORMULAS.md, INTEGRATION.md, KNOWN_LIMITATIONS.md
```

## Conventions

- **Env**: configuration comes only from the repo-root `.env.local` / `.env.prod` (dotenvx-encrypted, shared with backend/frontend) — `app/core/env.py` decrypts the file `OBELISK_ENV` selects (`local` default, `prod` in compose) into `os.environ` before `Settings()` is built. Never reintroduce a per-package `.env`; new `OBELISK_*` settings are added to the root files.
- **Constants**: All sheet names, cell addresses, column letters, thresholds, and formula keys live in `app/etl/etl_const.py` (grouped classes). Never hardcode a cell/threshold inside a function — `documentations/CONSTANTS.md` documents them.
- **Schemas**: Pydantic v2 models with `ConfigDict(extra="forbid")`. Input payloads are validated strictly; add `model_config = ConfigDict(extra="forbid")` to new schemas.
- **Errors**: Raise subclasses of `OBELISKError` (in `core/exceptions.py`); they expose `to_dict()` with `error_type`/`message`/`details` for the webapp to render. Map to HTTP in routes; keep error metadata structured.
- **Logging**: Use `structlog` via `app.core.logging.logger` (e.g., `logger.info("job_completed", job_id=...)`). Use key=value events, not bare strings.
- **Async**: ETL pipeline steps and the queue are `asyncio`-based; blocking work (openpyxl) runs in `asyncio.to_thread`. Keep new heavy work off the event loop.
- **New endpoints** belong in `app/api/routes/` with a router included from `app/main.py`; follow the existing tags/prefix pattern.

## Canonical domain rules (source: `documentations/FORMULAS.md`)

Do not re-derive or duplicate these in code beyond their canonical home; reference `FORMULAS.md` for the authoritative wording:

- **Formula 1A** — Direct CLO attainment = `Σ(raw scores on CLO assessments) / Σ(max scores)`. No assessment-category weighting.
- **Institutional threshold** — current v2 `met_threshold` uses rounded `composite_clo_attainment_pct >= 70.00`; composite is 70% direct + 30% indirect, with direct-only fallback when indirect is absent. The workbook threshold is informational. See `FORMULAS.md` for scales and missing-data behavior.
- **4-tier CLO level** — ≥85% Exceptional, 70–84% Proficient, 60–69% Basic, <60% Below Basic.
- **Rule 1 (completeness)** — a student's CLO record is complete iff they have ≥1 non-null score in each of PRELIM, MIDTERM, FINAL. Rolled up to `section_completeness_pct` + `rule1_met` (≥60%).
- **Formula 2A** — true mean of eligible composite values converted to fractions, with per-record direct-fraction fallback when composite is absent. It is not a pass rate.
- **Formula 7A** — per-PLO attainment = unweighted mean of mapped CLO mean attainments.
- **Rule 3** — a PLO is complete if ≥60% of mapped CLOs met Rule 1.
- **Formula 7C** — program-level average PLO attainment, computed only at the program level.
- **Privacy** — always `anonymize_students()` before any analytics/LLM payload leaves per-student data; student names become `Student A/B/…`, IDs dropped.
- **LLM** — integration is implemented and `IS_DEBUG_MODE=False` in source. The legacy offline runner patches mock JSON mode and denies real clients; do not enable live calls during offline verification. `OBELISK_LLM_MODEL` overrides the `gemini-3.6-flash` default; logging `OBELISK_DEBUG` does not select mock mode.

## Service ownership boundary (avoid duplication with the webapp)

The Elysia webapp backend and this service both touch attainment math. **This service is the authoritative compute engine for spreadsheet-derived data.** Keep the split:

| Responsibility | Owned by |
|---|---|
| Parse class-record `.xlsx` (sheet/cell layout, `etl_const`) | **this service** |
| Per-student Direct CLO attainment, 4-tier level, Rule-1 completeness | **this service** |
| Program/department/AVP rollups + AI CQI recommendation text | **this service** |
| Persist computed results into `CloAttainment`/`PloAttainment` + `ComputationRun` | webapp backend |
| Auth/RBAC, approval workflow, form CRUD/lifecycle, audit trail, report export | webapp backend |
| Form-level aggregation (longitudinal cohort tracking, divergence, CTL loop status, CQI lifecycle) | webapp backend |
| Rendering forms + upload UX (calls backend only, never this service directly) | webapp frontend |

Rules:
- Keep application persistence and user auth/RBAC in the webapp; do **not** duplicate spreadsheet parsing or Formula 1A/rollups there.
- The webapp stores application results; this service stores upload files and Redis job state for processing, without application database access.
- `documentations/INTEGRATION.md` is the contract the webapp follows — update it (and `SYSTEM-DESIGN.md`) whenever endpoints or payloads change.

## Documentation

- **`documentations/CONSTANTS.md`** — every constant in `etl_const.py`.
- **`documentations/FORMULAS.md`** — authoritative formula/rule definitions.
- **`documentations/INTEGRATION.md`** — the HTTP contract for the webapp backend.
- **`documentations/KNOWN_LIMITATIONS.md`** — implementation limits, test boundaries and historical performance attribution; LLM and indirect/composite calculations are implemented.
- **`SYSTEM-DESIGN.md`** — architecture, API endpoints, schemas, deployment. **Update it when you add/modify endpoints, schemas, pipeline stages, or formulas.**

These docs are the single source of truth — link to them, do not copy their content into new files.

## Legacy verification

Run `python -B testing_modules/old_test/run_all.py` from this service directory;
see [the legacy README](testing_modules/old_test/README.md) for the 50-case
October 13 offline verification and two standalone checks. Do not use broad
discovery as a substitute for the runner's isolation. Live modes require
`--live` and are excluded by default. Preserve dated Pre-UAT evidence and do
not transfer legacy unittest counts into institutional test-ID totals.
