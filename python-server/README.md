## OBELISK ETL Foundation

Async-first FastAPI ETL service for OBELISK class-record processing.

This README is updated up to **Step 2 + Step 3** implementation status.

---

## What changed in this step window

### Files changed

- `app/etl/extract/extractor.py`
  - Implemented real Excel extraction using fixed coordinates from the class-record template.
  - Returns: `tuple[ClassRecordHeader, list[RawScoreRecord]]`.
  - Added required error handling: `InvalidWorkbook`, `MissingWorksheet`, `InvalidTemplate`.
  - COVERPAGE fallback now reads only the **immediate right cell** of label rows.
- `app/etl/transform/transformer.py`
  - Implemented real transformation to `list[StudentCLOAttainment]`.
  - Computes category percentages and CLO attainment with weight renormalization when categories are absent.
  - Applies threshold + CLO level classification.
  - Emits deterministic `formula_version` hash from threshold + weights.
  - Raises `TransformationError` for invalid score/weight conditions.

### Files intentionally not changed

- `app/etl/load/loader.py` is still placeholder (`DummyLoader`).
- No PLO rollup logic was added.

---

## What the service can do now

- Accept uploaded class-record Excel files and queue ETL jobs.
- Extract real raw score records from template sheets:
  - `Database (LECTURE-RES-PRAC)`
  - `Exam (LECTURE ONLY)`
  - `OUTPUT` (optional/sparse)
- Compute per-student per-CLO attainment objects (`StudentCLOAttainment`) from extracted records.
- Handle sparse/unfilled template slots without failing where rules allow.

---

## What it cannot do yet

- No production loader integration yet (`DummyLoader` only).
- No CLO-to-PLO rollup or PLO analytics in transformer (out of scope by design).
- Queue is still in-memory only (no persistent job store).
- Test/demo ETL routes in `app/api/routes/etl.py` are not yet aligned to final extractor/transformer method signatures.

---

## Data contract (share this with web app teammate)

### Input file dependency (what backend relies on)

The extractor is tied to the **class-record workbook layout** and expects these sheets:

- Required sheets:
  - `COVERPAGE`
  - `Database (LECTURE-RES-PRAC)`
  - `Exam (LECTURE ONLY)`
- Optional sheet:
  - `OUTPUT`
- Ignored sheets for ETL input:
  - `CO-PO Attainment`
  - `Cohort Consolidated (COURSE)`

If required sheets are missing: `MissingWorksheet`.
If workbook cannot be opened: `InvalidWorkbook`.
If template headers are structurally incompatible: `InvalidTemplate`.

### Extract stage output

`ExcelExtractor.extract(file_path)` returns:

- `ClassRecordHeader`
  - `course_code: str | None`
  - `course_title: str | None`
  - `course_type: str`
  - `section: str | None`
  - `semester_year: str`
  - `instructor_name: str | None`
  - `no_of_students: int`
  - `threshold: float`
  - `grading_system: str | None`
  - `tla_at_exam_weights: dict[str, float]`
- `list[RawScoreRecord]`
  - `student_id: str | None`
  - `student_name: str`
  - `grading_period: "PRELIM" | "MIDTERM" | "FINAL"`
  - `assessment_category: "TLA" | "AT" | "EXAM" | "OUTPUT"`
  - `assessment_no: int`
  - `clo_code: str`
  - `activity_name: str | None`
  - `max_score: float`
  - `raw_score: float | None`

### Transform stage output

`SimpleTransformer.transform(header, records)` returns `list[StudentCLOAttainment]`:

- Group key: `(student_name, student_id, clo_code)`
- Category percentages:
  - `tla_pct`, `at_pct`, `exam_pct`, `output_pct`
  - Each is `None` when category has no eligible records (`raw_score is None` rows are excluded from numerator and denominator)
- `clo_attainment_pct`:
  - Weighted sum from `header.tla_at_exam_weights`
  - When category pct is `None`, that category is removed and remaining weights are renormalized to sum to `1.0`
- `met_threshold`: `clo_attainment_pct >= header.threshold`
- `clo_level`:
  - `1` if `< 0.5`
  - `2` if `>= 0.5` and `< threshold`
  - `3` if `>= threshold`
- `formula_version`: deterministic short SHA-256-based hash of threshold + sorted weights

### Transform error cases (`TransformationError`)

- Any `raw_score > max_score` (message includes `student_name` and `clo_code`).
- Missing non-optional category weight when that category is present for the student/CLO.
  - Current policy: missing `OUTPUT` weight defaults to `0.0` (to support lecture-only templates where OUTPUT is not weighted).

---

## Request flow (current)

### Upload flow (`POST /upload`)

1. API receives file upload.
2. `save_upload_file()` writes file to disk (chunked, size-limited, atomic write).
3. `job_queue.enqueue()` creates queued job with UUID + payload.
4. Worker picks job and runs ETL pipeline.
5. Client reads status/result via `GET /jobs/`.

---

## API endpoints

- `POST /upload`
- `GET /jobs/`
- `GET /health/`
- `POST /etl/extract` (dev/testing)
- `POST /etl/transform` (dev/testing)
- `POST /etl/load` (dev/testing)
- `POST /etl/pipeline` (dev/testing)

---

## How to run

### Prerequisites

- Python 3.10+
- Poetry (for dependency management)
- A valid class-record Excel file matching the OBELISK template

### Install dependencies

```powershell
poetry install
```

### Start the API server

```powershell
poetry run uvicorn app.main:app --reload
```

The server will start on `http://localhost:8000`.

### Test ETL pipeline via API

#### 1. Upload a class-record file

```powershell
curl -X POST "http://localhost:8000/upload" `
  -F "file=@path\to\your\E-classrecord(LECTURE ONLY).xlsx"
```

Response includes a job UUID.

#### 2. Check job status and results

```powershell
curl "http://localhost:8000/jobs/"
```

Look for the queued/completed job and its output.

### Test ETL pipeline directly (Python)

Create a test script `test_etl.py` in the root:

```python
import asyncio
from app.etl.extract.extractor import ExcelExtractor
from app.etl.transform.transformer import SimpleTransformer

async def main():
    # Extract from real sample file
    file_path = "E-classrecord(LECTURE ONLY).xlsx"
    extractor = ExcelExtractor()
    header, records = extractor.extract(file_path)
    
    print("=== ClassRecordHeader ===")
    print(f"Course: {header.course_code} / {header.course_title}")
    print(f"Semester: {header.semester_year}")
    print(f"Students: {header.no_of_students}")
    print(f"Threshold: {header.threshold}")
    print(f"Weights: {header.tla_at_exam_weights}")
    print()
    
    print("=== RawScoreRecord count ===")
    from collections import Counter
    groups = Counter((r.grading_period, r.assessment_category) for r in records)
    for (period, category), count in sorted(groups.items()):
        print(f"  {period} / {category}: {count}")
    print()
    
    # Transform to CLO attainment
    transformer = SimpleTransformer()
    attainments = transformer.transform(header, records)
    
    print("=== StudentCLOAttainment count ===")
    print(f"Total records: {len(attainments)}")
    print()
    
    # Show one student's CLO breakdown
    if attainments:
        sample = attainments[0]
        print(f"Sample: {sample.student_name} / {sample.clo_code}")
        print(f"  TLA: {sample.tla_pct}")
        print(f"  AT: {sample.at_pct}")
        print(f"  EXAM: {sample.exam_pct}")
        print(f"  OUTPUT: {sample.output_pct}")
        print(f"  CLO Attainment: {sample.clo_attainment_pct}")
        print(f"  Met Threshold: {sample.met_threshold}")
        print(f"  CLO Level: {sample.clo_level}")

if __name__ == "__main__":
    asyncio.run(main())
```

Run it:

```powershell
poetry run python test_etl.py
```

### Health check

```powershell
curl "http://localhost:8000/health/"
```

---

## Next recommended follow-ups

- Align `app/api/routes/etl.py` demo route payloads with the new extractor/transformer signatures.
- Add unit tests for extractor fixed-coordinate parsing and transformer renormalization/error paths.
- Replace `DummyLoader` with real persistence/API integration once consumer contract is finalized.

