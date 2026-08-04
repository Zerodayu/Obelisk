# OBELISK ETL & Analytics Service — Agent Guide

**Product:** OBELISK — the pure-compute Python microservice for Jose Maria College Foundation, Inc. (JMCFI). It converts instructor class-record Excel workbooks into per-student Direct CLO attainment, and rolls consolidated course results up into program/department/AVP analytics with AI CQI recommendations.

**Stack:** Python 3.13 · FastAPI · Pydantic v2 (`pydantic-settings`) · openpyxl · pandas · structlog · Poetry (dev) / Docker (deploy). Runs on port **8000**.

## Service identity (read before changing anything)

This is a **pure compute engine** with two hard boundaries that must not be crossed without explicit product decision:

- **No database access.** Never reads or writes a database. All input arrives via HTTP request body, all results return as JSON. The job queue is in-memory and wiped on restart. Do not introduce persistence.
- **No authentication/authorization.** Trusts every request. The Elysia webapp backend is responsible for all auth/RBAC *before* calling here (critical for `POST /analytics/institutional-summary`, which is VPAA-only).

## File Structure

```
app/
├── main.py                        # FastAPI app: CORS, router includes, worker lifecycle
├── core/
│   ├── config.py                  # pydantic-settings Settings (OBELISK_* env prefix)
│   ├── exceptions.py              # OBELISKError hierarchy → structured to_dict()
│   └── logging.py                 # structlog configuration
├── api/routes/
│   ├── upload.py                  # POST /upload (save file + enqueue ETL job)
│   ├── etl.py                     # /etl/extract|transform|load|pipeline (manual debug)
│   ├── jobs.py                    # /jobs, /jobs/{job_id}
│   ├── analytics.py               # /analytics/jobs/{id}/recommendation, /summary, /institutional-summary
│   └── health.py                  # GET /health
├── services/
│   ├── job_queue.py               # InMemoryJobQueue (async), single global instance
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
testing_modules/                   # test scripts (validate, e2e)
documentations/                    # CONSTANTS.md, FORMULAS.md, INTEGRATION.md, KNOWN_LIMITATIONS.md
```

## Conventions

- **Constants**: All sheet names, cell addresses, column letters, thresholds, and formula keys live in `app/etl/etl_const.py` (grouped classes). Never hardcode a cell/threshold inside a function — `documentations/CONSTANTS.md` documents them.
- **Schemas**: Pydantic v2 models with `ConfigDict(extra="forbid")`. Input payloads are validated strictly; add `model_config = ConfigDict(extra="forbid")` to new schemas.
- **Errors**: Raise subclasses of `OBELISKError` (in `core/exceptions.py`); they expose `to_dict()` with `error_type`/`message`/`details` for the webapp to render. Map to HTTP in routes; keep error metadata structured.
- **Logging**: Use `structlog` via `app.core.logging.logger` (e.g., `logger.info("job_completed", job_id=...)`). Use key=value events, not bare strings.
- **Async**: ETL pipeline steps and the queue are `asyncio`-based; blocking work (openpyxl) runs in `asyncio.to_thread`. Keep new heavy work off the event loop.
- **New endpoints** belong in `app/api/routes/` with a router included from `app/main.py`; follow the existing tags/prefix pattern.

## Canonical domain rules (source: `documentations/FORMULAS.md`)

Do not re-derive or duplicate these in code beyond their canonical home; reference `FORMULAS.md` for the authoritative wording:

- **Formula 1A** — Direct CLO attainment = `Σ(raw scores on CLO assessments) / Σ(max scores)`. No assessment-category weighting.
- **Institutional threshold** — `met_threshold` is always `direct_clo_attainment_pct >= 0.70` (fixed institutional benchmark; never the workbook's per-course threshold).
- **4-tier CLO level** — ≥85% Exceptional, 70–84% Proficient, 60–69% Basic, <60% Below Basic.
- **Rule 1 (completeness)** — a student's CLO record is complete iff they have ≥1 non-null score in each of PRELIM, MIDTERM, FINAL. Rolled up to `section_completeness_pct` + `rule1_met` (≥60%).
- **Formula 2A** — section CLO attainment = true mean of students' `direct_clo_attainment_pct` (not a pass rate).
- **Formula 7A** — per-PLO attainment = unweighted mean of mapped CLO mean attainments.
- **Rule 3** — a PLO is complete if ≥60% of mapped CLOs met Rule 1.
- **Formula 7C** — program-level average PLO attainment, computed only at the program level.
- **Privacy** — always `anonymize_students()` before any analytics/LLM payload leaves per-student data; student names become `Student A/B/…`, IDs dropped.
- **LLM** — `IS_DEBUG_MODE` in `app/analytics/cqi_recommender.py` gates real LLM calls. Keep it `True` (placeholder) unless a real integration is deliberately implemented.

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
- Do **not** implement persistence, auth, or spreadsheet parsing in the webapp; do **not** implement Formula 1A/rollups there either.
- The webapp calls this service's endpoints and stores results; this service never stores anything.
- `documentations/INTEGRATION.md` is the contract the webapp follows — update it (and `SYSTEM-DESIGN.md`) whenever endpoints or payloads change.

## Documentation

- **`documentations/CONSTANTS.md`** — every constant in `etl_const.py`.
- **`documentations/FORMULAS.md`** — authoritative formula/rule definitions.
- **`documentations/INTEGRATION.md`** — the HTTP contract for the webapp backend.
- **`documentations/KNOWN_LIMITATIONS.md`** — known gaps and deferred items (LLM stubbed, indirect 30% not computed, unused DB scaffolding).
- **`SYSTEM-DESIGN.md`** — architecture, API endpoints, schemas, deployment. **Update it when you add/modify endpoints, schemas, pipeline stages, or formulas.**

These docs are the single source of truth — link to them, do not copy their content into new files.