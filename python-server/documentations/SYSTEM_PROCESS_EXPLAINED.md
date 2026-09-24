# OBELISK ETL & Analytics Service — End-to-End System Process Explained

> **Purpose of this Document:**  
> The OBELISK Python server is a specialized microservice that operates within a larger educational platform. Because it intentionally separates raw computation from database storage and web authentication, its functions can feel fragmented if viewed in isolation. This document provides a unified, step-by-step explanation of what the system does, how its processes connect, how data flows through it, and where its responsibilities begin and end.

---

## 1. The Big Picture: What This Service Actually Does

The OBELISK Python server is an **authoritative, pure-compute engine** for Outcomes-Based Education (OBE) compliance at Jose Maria College Foundation, Inc. (JMCFI).

It does **not** store student records in a database, manage logins, or render user interfaces. Instead, it performs two distinct data processing jobs:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 THE DUAL RESPONSIBILITY                                │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│         PROCESS 1: PER-COURSE ETL         │      PROCESS 2: INSTITUTIONAL ANALYTICS    │
│            (Asynchronous / Jobs)          │                (Synchronous)               │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ • Ingests instructor Excel workbooks      │ • Receives consolidated semester data from │
│ • Validates worksheets and templates      │   multiple courses across departments      │
│ • Calculates individual Direct CLO scores │ • Aggregates CLO means by Dept / Prog / AVP│
│ • Evaluates data completeness (Rule 1)    │ • Rolls up CLOs into PLO Attainment        │
│ • Detects learning gaps & generates course│ • Evaluates program completeness (Rule 3)  │
│   CQI action recommendations              │ • Generates executive AI summaries (VPAA)  │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

---

## 2. Architectural Boundary: Why It Seems "Fragmented"

If you search the codebase for user tables, database migrations, or login checks, you will find they are either empty scaffolding or completely absent. **This is by design.**

```
┌─────────────────────────────────────────────────────────┐
│                    ELYSIA WEBAPP (TS)                   │
│ • Manages User Logins & Roles (Instructor, Dean, VPAA)  │
│ • Owns Application Database (Postgres / Prisma)         │
│ • Handles Course Submission & Approval Workflows        │
│ • Persists Computed Attainment & Audit Logs             │
└──────────────┬───────────────────────────▲──────────────┘
               │ HTTP API Requests         │ JSON Attainment
               │ (Workbooks & Payloads)    │ & Summaries
┌──────────────▼───────────────────────────┴──────────────┐
│             OBELISK PYTHON SERVICE (Port 8000)          │
│ • Pure Compute: No Application DB, No RBAC              │
│ • Redis: Used strictly as a durable task queue          │
│ • Excel Parsing: openpyxl extraction                    │
│ • OBE Math: Formulas 1A, 2A, 7A, 7C, Rules 1 & 3       │
│ • AI/CQI: Gap detection & Google Gemini generation      │
└─────────────────────────────────────────────────────────┘
```

### Responsibility Matrix

| Feature / Responsibility | Owned by Webapp Backend | Owned by this Python Service |
|---|:---:|:---:|
| User authentication & role checks (RBAC) | **YES** | NO (Trusts calling server) |
| Optional caller secret check (`X-Webapp-Secret`) | Sends header | Validates header |
| Excel file storage & long-term persistence | **YES** | NO (Stores temporarily during job) |
| Extracting messy cell coordinates from `.xlsx` | NO | **YES** (`ExcelExtractor`) |
| Calculating Formula 1A (Student Direct CLO %) | NO | **YES** (`SimpleTransformer`) |
| Applying 70% threshold & 4-tier CLO levels | NO | **YES** (`SimpleTransformer`) |
| Rule 1 (Prelim/Midterm/Final exam completeness)| NO | **YES** (`SimpleTransformer`) |
| Long-term database records (`CloAttainment`) | **YES** | NO |
| Rolling up CLO attainment into PLOs (Formulas 7A/7C)| NO | **YES** (`institutional_summary.py`) |
| Rule 3 (PLO 60% completeness check) | NO | **YES** (`institutional_summary.py`) |
| AI CQI strategic text generation | NO | **YES** (`cqi_recommender.py`) |

---

## 3. Deep Dive: Process 1 — Per-Course Workbook ETL

This is the background process triggered when an instructor uploads a completed Excel class record.

### High-Level Flowchart

```mermaid
flowchart TD
    A["Instructor Uploads .xlsx in Webapp"] --> B["POST /upload"]
    B --> C["Upload Service: Save file atomically to /uploads"]
    C --> D["Job Enqueued in Redis (obelisk:job_queue)"]
    D --> E["API responds immediately: 202 Accepted { job_id }"]
    
    subgraph Background Worker Loop
        F["Worker pops job_id from Redis (BRPOP)"]
        F --> G["Extract Phase (openpyxl)"]
        G --> H["Transform Phase (Formula 1A, Rule 1)"]
        H --> I["Load Phase (DummyLoader formats JSON)"]
        I --> J["Save result to Redis (obelisk:job:job_id)"]
    end
    
    D -.-> F
    E --> K["Webapp polls GET /jobs/{job_id}"]
    J -.-> K
    K --> L["Job status == 'completed' -> Webapp stores results in DB"]
    K --> M["Webapp calls GET /analytics/jobs/{job_id}/recommendation"]
```

### Detailed Pipeline Stages

#### Step 1: Receiving & Queueing (`app/api/routes/upload.py`)
1. Receives `.xlsx` file via multipart form data.
2. Validates file size (default max: 10MB).
3. Saves file chunk-by-chunk to the local `uploads/` directory with a unique UUID.
4. Generates a new `job_id` and adds the job metadata to Redis with status `queued`.
5. Pushes `job_id` into the Redis queue list (`obelisk:job_queue`).
6. Returns `202 Accepted` with `{ "job_id": "...", "status": "queued" }`. The HTTP connection terminates here without waiting for processing.

#### Step 2: Background Consumption (`app/workers/worker.py`)
- Multiple background worker loops (default: 4 workers) run concurrently.
- Each worker executes a non-blocking `BRPOP` against Redis with a 1-second timeout.
- When a job arrives, the worker marks the job status in Redis as `running`.

#### Step 3: Extraction (`app/etl/extract/extractor.py`)
1. **Workbook Load**: Opens `.xlsx` using `openpyxl` with `data_only=True` to read calculated formula values rather than formulas.
2. **Sheet Verification**: Verifies presence of mandatory worksheets:
   - `Database (LECTURE-RES-PRAC)`
   - `Exam (LECTURE ONLY)`
   - `COVERPAGE`
   - `OUTPUT` (optional, for project deliverables)
   - *Fails gracefully with a structured `MissingWorksheet` error if missing.*
3. **Template Validation**: Checks marker cells (e.g., `B12` in Database sheet contains `"STUDENT NAME"`).
4. **Course Type Gating**: Verifies cell `B6` declares `"LECTURE"`. If any other course type (like `"RESEARCH"`) is present, halts with structured `UnsupportedCourseType` error.
5. **Roster Extraction**: Reads student IDs and names starting from row 17 (Database sheet) and row 22 (Exam/Output sheets).
6. **Assessment Blocks**: Reads assessment headers (category, number, mapped CLO code, max score) and aligns student rows to column scores:
   - Prelim, Midterm, and Final TLA/AT activities from Database sheet.
   - Major exams from Exam sheet.
   - Major outputs from Output sheet.
7. **CLO-PLO Mapping**: Reads the correlation matrix on the `COVERPAGE` (starts at cell `A26` with header `"CLO-PLO"` until the sentinel row `"AVERAGE"`).

#### Step 4: Transformation (`app/etl/transform/transformer.py`)
1. **Sanity Check**: Ensures every student's `raw_score <= max_score`. If violated, raises `TransformationError`.
2. **CLO-PLO Correlation Gating**:
   - Inspects the COVERPAGE mapping table.
   - If a CLO has no valid non-zero correlation to any PLO, that CLO is **excluded** from calculation.
   - The resulting record is emitted with `excluded_reason = "no_plo_mapping"` and all attainment numbers set to `null` so downstream systems know it was intentionally skipped.
3. **Formula 1A Calculation (Direct CLO Attainment)**:
   $$\text{Direct CLO Attainment \%} = \frac{\sum \text{Raw Scores of all assessments mapped to this CLO}}{\sum \text{Max Scores of those same assessments}}$$
   *(Note: This is a direct mathematical ratio across all eligible tasks; no category weighting is applied).*
4. **Institutional Threshold Evaluation**:
   - Compares the attainment percentage against the fixed institutional standard:
     $$\text{met\_threshold} = (\text{direct\_clo\_attainment\_pct} \ge 0.70)$$
   - Note: The course-specific threshold written in cell `B10` is kept for metadata only; institutional evaluation always uses 70%.
5. **4-Tier CLO Attainment Level**:
   - $\ge 85\%$ $\rightarrow$ **Exceptional**
   - $70\% - 84\%$ $\rightarrow$ **Proficient**
   - $60\% - 69\%$ $\rightarrow$ **Basic**
   - $< 60\%$ $\rightarrow$ **Below Basic**
6. **Rule 1: Assessment Completeness**:
   - Checks if the student has at least one recorded score in **PRELIM**, **MIDTERM**, and **FINAL** periods for that specific CLO.
   - Flags `is_record_complete = true/false`.
   - Computes section-level completeness percentage (`section_completeness_pct`) and flags `rule1_met = (section_completeness_pct >= 0.60)`.
7. **Formula Versioning**: Computes a deterministic SHA-256 hash representing the formula configuration for audit traceability.

#### Step 5: Loading & Completion (`app/etl/load/loader.py`)
1. Formats the data into the canonical output JSON envelope:
   ```json
   {
     "loaded": {
       "header": { "course_code": "IT101", ... },
       "attainments": [ ... ],
       "clo_plo_mapping": [ ... ]
     }
   }
   ```
2. Updates Redis job entry to `completed` with the result payload.
3. If an error occurred anywhere in the pipeline, the worker catches the `OBELISKError`, serializes its structured JSON (`error_type`, `message`, `details`), and sets status to `failed`.

#### Step 6: Per-Course CQI Advisory (`GET /analytics/jobs/{job_id}/recommendation`)
- Once the job is `completed`, the webapp can request an AI recommendation for that specific course.
- Scans `attainments` for any CLO where students failed to meet the 70% threshold.
- Replaces student names with anonymized placeholders (`Student A`, `Student B`) to protect privacy.
- Sends the prompt to Google Gemini (`gemini-3.6-flash`).
- Returns structured Markdown with **Summary**, **Findings**, **Recommendations**, and **Pattern Flagged**.

---

## 4. Deep Dive: Process 2 — Institutional & Program Analytics

This process runs when academic leaders (Deans, Program Heads, VPAA) view multi-course OBE rollups across departments or entire programs.

Unlike the ETL pipeline, this process is **synchronous**: the webapp sends a consolidated payload of pre-computed course submissions, and the service returns rolled-up analytics immediately.

```mermaid
flowchart TD
    A["Webapp gathers Course Submissions from DB"] --> B{"Choose Endpoint"}
    
    B -->|"POST /analytics/summary\n(Deans / Program Heads / AVPs)"| C["compute_summary_only()"]
    B -->|"POST /analytics/institutional-summary\n(VPAA Only)"| D["generate_institutional_summary()"]
    
    subgraph Analytics Computation Engine
        C --> E["1. Anonymize Student Data"]
        D --> E
        E --> F["2. Formula 2A: Section CLO Means"]
        F --> G["3. Formula 7A: PLO Rollups & Rule 3 Completeness"]
        G --> H["4. Formula 7C: Program-Level Average PLO"]
        H --> I["5. Identify Worst Performing CLOs across Dept/Prog/AVP"]
    end
    
    I --> J["Return JSON Rollups (No AI)"]
    I --> K["Build Executive Prompt & Call Gemini LLM"]
    K --> L["Return JSON Rollups + Strategic CQI Recommendation"]
```

### Detailed Analytics Stages (`app/analytics/institutional_summary.py`)

#### 1. Student Anonymization
All student names are sanitized to `Student A`, `Student B`, and IDs are stripped before analytics processing.

#### 2. Group Rollups (Department, Program, AVP Group)
Submissions are partitioned using `_generic_aggregator()` into:
- Department summaries (e.g., CITE, CAS, CBA)
- Academic Program summaries (e.g., BSIT, BSCS, BSA)
- Assistant Vice President (AVP) group clusters

#### 3. Formula 2A: Section CLO Attainment (True Mean)
Computes the true arithmetic mean of all student direct CLO attainment percentages in that group:
$$\text{Mean CLO Attainment \%} = \frac{\sum \text{direct\_clo\_attainment\_pct}}{\text{Total eligible student records}}$$
*(Rows with `excluded_reason = "no_plo_mapping"` are automatically omitted).*

#### 4. Formula 7A: Per-PLO Attainment Rollup
For every Program Learning Outcome (PLO), finds all CLOs mapped to it across the courses:
$$\text{PLO Attainment (Direct)} = \frac{\sum \text{Mean Attainment \% of mapped CLOs}}{\text{Total number of mapped CLOs}}$$
*(Unweighted average across mapped CLOs).*

#### 5. Rule 3: PLO Data Completeness Standard
Checks whether the underlying data for each PLO is statistically reliable:
$$\text{plo\_completeness\_pct} = \frac{\text{Count of mapped CLOs that satisfied Rule 1}}{\text{Total number of mapped CLOs}}$$
$$\text{plo\_rule3\_met} = (\text{plo\_completeness\_pct} \ge 0.60)$$

#### 6. Formula 7C: Program-Wide PLO Average
Calculated **only** at the Program level (since PLOs belong to specific degree programs):
$$\text{Program PLO Average} = \frac{\sum \text{All individual PLO attainments in program}}{\text{Total number of PLOs in program}}$$

#### 7. Worst-Performing CLO Identification
The engine identifies the 3 lowest-scoring CLOs in each department, program, and AVP group, sorted by lowest attainment percentage and highest student impact.

#### 8. Executive AI Summary (For VPAA Endpoint Only)
- In `POST /analytics/institutional-summary`, the identified worst performers and institutional averages are compiled into an executive-level prompt.
- Google Gemini generates 2–3 high-level strategic interventions for institutional quality improvement.

---

## 5. API Reference Summary

| Method | Endpoint | Sync / Async | Audience | Purpose |
|---|---|:---:|---|---|
| `POST` | `/upload` | Async | Instructors | Accepts `.xlsx`, writes to disk, enqueues ETL job in Redis, returns `202 Accepted` |
| `GET` | `/jobs` | Sync | Webapp | Lists all jobs currently tracked in Redis |
| `GET` | `/jobs/{job_id}` | Sync | Webapp | Polling endpoint: returns `queued`, `running`, `completed`, or `failed` with results/errors |
| `GET` | `/analytics/jobs/{job_id}/recommendation` | Sync | Instructors / Chairs | Generates per-course AI CQI recommendation for a completed job |
| `POST` | `/analytics/summary` | Sync | Deans / Chairs / AVPs | Pure numerical OBE rollups (Dept/Prog/AVP); **no AI generated** |
| `POST` | `/analytics/institutional-summary` | Sync | **VPAA Only** | Full institutional rollup + AI executive strategic recommendations |
| `GET` | `/health` | Sync | Monitoring | Simple health and status check |

---

## 6. How Errors are Handled

The service avoids unhandled 500 crashes. All predictable parsing and business logic issues raise subclasses of [`OBELISKError`](file:///D:/Jetbrains_IDE_Projects/pycharm/OBELISK-final/python-server/app/core/exceptions.py), which generate structured JSON responses:

| Exception Class | Trigger Condition | Details Returned |
|---|---|---|
| `InvalidWorkbook` | Uploaded file cannot be opened as an Excel workbook | `file_path`, `underlying_error` |
| `MissingWorksheet` | Workbook is missing a required sheet (e.g. `COVERPAGE`) | `expected_sheet_name`, `available_sheets` |
| `InvalidTemplate` | Marker cell text does not match (e.g. `B12` != `"STUDENT NAME"`) | `sheet_name`, `cell`, `expected`, `found` |
| `UnsupportedCourseType` | Workbook cell `B6` is not `"LECTURE"` | `course_type`, `supported_types` |
| `TransformationError` | A student's raw score exceeds max score | Student name, CLO code, raw score, max score |
| `QueueOverloadedError` | Redis job queue has reached its maximum configured capacity | Current queue size, max capacity |
| `UnauthorizedCaller` | Missing or invalid `X-Webapp-Secret` header | `header_name`, `reason` |

---

## 7. Current Configurations and Toggles

All configuration is managed in [`app/core/config.py`](file:///D:/Jetbrains_IDE_Projects/pycharm/OBELISK-final/python-server/app/core/config.py) via environment variables (`OBELISK_*` prefix):

* **`OBELISK_REDIS_HOST` & `OBELISK_REDIS_PORT`**: Points to the Redis instance (default `localhost:6379`).
* **`OBELISK_JOB_WORKER_COUNT`**: Number of parallel ETL worker coroutines (default `4`).
* **`OBELISK_WEBAPP_SHARED_SECRET`**: If set, activates `X-Webapp-Secret` verification on protected endpoints.
* **`OBELISK_LLM_API_KEY`**: API key for Google Gemini.
* **`IS_DEBUG_MODE` in [`cqi_recommender.py`](file:///D:/Jetbrains_IDE_Projects/pycharm/OBELISK-final/python-server/app/analytics/cqi_recommender.py)**:
  - When `True` (default): Returns instant mock CQI responses so the system works completely offline without API keys.
  - When `False`: Makes real API calls to Google Gemini (`gemini-3.6-flash`).
