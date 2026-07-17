## OBELISK ETL Foundation

This repository is a clean, async-first FastAPI skeleton for an ETL service used by an Outcomes-Based Education Management System (OBELISK).

It is **not** the final production system yet. Most ETL behavior is placeholder so the team can build safely on top of a scalable architecture.

---

## What this service does (currently)

- Accepts Excel uploads.
- Pushes work into an in-memory async queue.
- Processes jobs in background workers.
- Runs placeholder ETL stages (extract -> transform -> load).
- Exposes endpoints for health and job status.

---

## Request flow (important)

### Upload flow (`POST /upload`)
1. API receives file upload.
2. `save_upload_file()` writes file to disk (async, chunked, size-limited, atomic write).
3. `job_queue.enqueue()` creates a queued job with UUID.
4. Background workers (`start_worker`) pick queued jobs.
5. Worker runs `run_full_pipeline(extractor, transformer, loader, payload)`.
6. Job status changes: `queued -> running -> completed/failed`.
7. Client checks status via `GET /jobs/`.

### Direct ETL testing flow (`POST /etl/*`)
- `POST /etl/extract`, `POST /etl/transform`, `POST /etl/load`, `POST /etl/pipeline`
- These routes run placeholder ETL logic directly for debugging/demo.

---

## Project structure and what each file does

### `app/main.py`
- Bootstraps FastAPI app.
- Configures CORS.
- Registers routers.
- Starts and stops background worker pool on app lifecycle events.

### `app/api/routes/`

#### `app/api/routes/upload.py`
- `upload_file(...)`: receives upload, saves file, enqueues ETL job.
- Returns:
  - `202` on accepted upload
  - `413` if file is too large
  - `503` if queue is full

#### `app/api/routes/etl.py`
- Stage test endpoints:
  - `extract_data(...)`
  - `transform_data(...)`
  - `load_data(...)`
  - `run_pipeline(...)`

#### `app/api/routes/jobs.py`
- `list_jobs()`: returns current job records from in-memory queue service.

#### `app/api/routes/health.py`
- `health()`: simple health response.

### `app/core/`

#### `app/core/config.py`
- `Settings`: central config using Pydantic settings.
- `settings`: global settings instance.
- Key env vars:
  - `DATABASE_URL`
  - `API_URL`
  - `UPLOAD_FOLDER`
  - `MAX_UPLOAD_SIZE`
  - `UPLOAD_CHUNK_SIZE`
  - `MAX_CONCURRENT_UPLOAD_WRITES`
  - `JOB_QUEUE_MAXSIZE`
  - `JOB_WORKER_COUNT`
  - `DEBUG`

#### `app/core/logging.py`
- `configure_logging()`: configures `structlog` JSON logging.
- `logger`: shared logger object used across layers.

#### `app/core/exceptions.py`
- Base: `OBELISKError`
- Domain errors:
  - `InvalidWorkbook`
  - `InvalidTemplate`
  - `MissingWorksheet`
  - `TransformationError`
  - `LoaderError`
  - `QueueOverloadedError`

### `app/database/`

#### `app/database/__init__.py`
- SQLAlchemy async engine/session setup.
- `get_session()` dependency for future DB-backed routes/services.

### `app/models/`

#### `app/models/base.py`
- Defines SQLAlchemy declarative base via registry.

#### `app/models/job.py`
- `Job` ORM model for persisted jobs (foundation for future DB queue/state).
- `to_dict()` helper for serialization.

### `app/schemas/`

#### `app/schemas/job.py`
- Pydantic API schemas:
  - `JobCreate`
  - `JobRead`

### `app/services/`

#### `app/services/upload_service.py`
- `save_upload_file(...)`:
  - limits concurrent file writes using semaphore
  - streams file in chunks
  - enforces max upload size
  - writes to temporary file then atomically renames

#### `app/services/job_queue.py`
- `InMemoryJobQueue` service.
- Core methods:
  - `enqueue(...)`: create queued job
  - `get_job(...)`: fetch one job
  - `list_jobs(...)`: fetch all jobs
  - `process_next(...)`: run one queued job through ETL pipeline
  - `queue_stats(...)`: queue usage metrics
- `job_queue`: singleton queue instance.

### `app/etl/`

#### `app/etl/abstracts.py`
- Abstract contracts:
  - `Extractor`
  - `Transformer`
  - `Loader`
- `run_full_pipeline(...)`: orchestration helper for full ETL.

#### `app/etl/extract/extractor.py`
- `ExcelExtractor.extract(...)`: placeholder extraction step returning mocked data.

#### `app/etl/transform/transformer.py`
- `SimpleTransformer.transform(...)`: placeholder normalization step.

#### `app/etl/load/loader.py`
- `DummyLoader.load(...)`: placeholder load step.

### `app/workers/`

#### `app/workers/worker.py`
- `start_worker(queue, worker_id)`: async worker loop consuming queue jobs.

### `app/utils/`

#### `app/utils/excel.py`
- Placeholder Excel helper functions:
  - `list_sheets(...)`
  - `read_rows(...)`
  - `validate_headers(...)`

#### `app/utils/types.py`
- Shared types:
  - `JobStatus` enum
  - `JobRecord` dataclass

### `__init__.py` files
- Most folders include `__init__.py` so Python treats them as packages.
- This enables imports like `from app.services.job_queue import job_queue`.

---

## API endpoints

- `POST /upload`
- `POST /etl/extract`
- `POST /etl/transform`
- `POST /etl/load`
- `POST /etl/pipeline`
- `GET /jobs/`
- `GET /health/`

---

## Run locally

### 1) Install dependencies

```powershell
poetry install
```

If you are not using Poetry, install equivalent dependencies manually from `pyproject.toml`.

### 2) Start server

```powershell
poetry run uvicorn app.main:app --reload
```

or

```powershell
uvicorn app.main:app --reload
```

---

## Current limitations (intentional)

- Queue is in-memory only (not persistent).
- ETL logic returns mocked data.
- No production auth/rate limiting yet.
- Database model/migrations are scaffolding only.

---

## Future build-out

- Implement real Excel parsing and template validation.
- Add DB-backed job persistence and Alembic migrations.
- Replace in-memory queue with distributed queue when scaling.
- Add unit/integration tests and CI checks.
- Implement 37 OBE forms, CLO/PLO processing, CQI and analytics modules.

