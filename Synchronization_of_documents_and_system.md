# OBELISK: System Synchronization, Architecture Audit & Development Roadmap

> **Auditor Notice, Architecture Audit & Development Ledger**  
> **Evaluation Mode:** Read-Only Systems Cross-Examination & Unified Engineering Roadmap  
> **Project Scope:** Jose Maria College Foundation, Inc. (JMCFI) — Outcomes-Based Educational Learning and Intelligent System Kit (OBELISK)  
> **Target Pilot:** College of Information Technology Education (CITE) — BS Information Technology (BSIT) Program, Section 1A Pilot  
> **Document Purpose:** Single consolidated source of truth unifying the institutional OBE documentation cross-examination (37 forms, 8-level hierarchy, assessment formulas) with the codebase implementation status, phased roadmap (Phases 0–7), service readiness, and active backlog.

---

## 1. Architectural & Methodological Alignment

### 1.1 Scope Limitation Agreement & Pilot Parameterization
- **Institutional Documentation:** The institutional manual (*JMCFI WIN-OBE Forms Digitization Reference Guide*) designs the OBE framework for campus-wide adoption across all academic divisions (CITE, CAS, CBA, CED, etc.), mandating 37 distinct forms, university-wide committee reviews, and longitudinal cohort tracking across all degree programs.
- **System Reality:** The system has formally pivoted to an isolated pilot configuration:
  - Program scope is locked to **CITE / BS Information Technology (`BSIT`)**.
  - Section enrollment and database seeding target a single class section (`clv92a9f1000108l3d26b52b3` — BSIT Section 1A, Course `IT 101`).
  - Cross-department routing, multi-program comparative dashboards, and non-CITE grading templates (e.g., Practicum, Clinical, and Research-only course types) are rejected or unpopulated in data.
- **Audit Verdict:** **Aligned with Scope Limitation Agreement.** The system reflects the authorized pilot boundary, though broader institutional deployment remains unsupported in the current schema state.

### 1.2 Program Educational Objectives (PEO) Deferral
- **Institutional Documentation:** Chapter 1 and the Digitization Reference dictate an unbroken 8-level outcomes hierarchy:
  $$\text{Institutional Mission/Vision} \longrightarrow \text{Core Values} \longrightarrow \text{Institutional Outcomes (IO)} \longrightarrow \text{PEOs} \longrightarrow \text{PLOs} \longrightarrow \text{CLOs} \longrightarrow \text{TLA/AT} \longrightarrow \text{Rubric Scoring}$$
  Attainment of PEOs must be assessed biennially (3–5 years post-graduation) through Alumni Tracer Studies (F20) and Employer Satisfaction Surveys (F21).
- **System Reality:**
  - Prisma schema defines models `Peo`, `PloToPeoMap`, and `PeoAttainment` in [`prisma/schema/04-outcomes.prisma`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/prisma/schema/04-outcomes.prisma).
  - Dedicated backend endpoints exist behind `/api/v1/periodic/alumni-tracer` and `/api/v1/periodic/employer-survey`.
  - **Pipeline Severance:** No automated computational rollup connects F20/F21 survey data to `PeoAttainment`. The graduation-cluster archival pipeline explicitly defers execution: *"Sequenced after PEO attainment capture... a cluster must not be compiled until its PEO evidence exists"* ([`apps/backend/SYSTEM-DESIGN.md`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/SYSTEM-DESIGN.md#L143)).
  - Frontend interfaces for F20 and F21 are completely unbuilt.
- **Audit Verdict:** **Deferred per Scope Agreement.** PEO attainment capture is structurally stubbed in the database but functionally inoperative in the application runtime.

### 1.3 Baseline Methodology & Weighting Policies
- **Institutional Benchmark Floor:**
  - Documentation establishes a fixed threshold: $\ge 70.0\%$ attainment across all Course Learning Outcomes (CLOs) and Program Learning Outcomes (PLOs).
  - Codebase strictly enforces this floor: `MIN_ATTAINMENT_PCT = 70.00` is hardcoded across backend validators ([`apps/backend/lib/validators/attainment.ts`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/lib/validators/attainment.ts)), Python ETL threshold checks ([`apps/python-server/app/etl/constants/etl_const.py`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/python-server/app/etl/constants/etl_const.py)), and target-setting matrix mutation assertions ([`apps/backend/src/v1/plan/compute.ts`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/plan/compute.ts)). Setting targets below 70% throws `TargetBelowFloorError` (422/400).
- **Direct vs. Indirect Attainment Weighting:**
  - Manual §3.5.13 establishes a composite attainment model:
    $$\text{Composite Attainment} = (0.70 \times \text{Direct Assessment}) + (0.30 \times \text{Indirect Assessment})$$
  - In `ComputationRun` ([`prisma/schema/07-attainment.prisma`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/prisma/schema/07-attainment.prisma)), fields `directWeight = 0.70` and `indirectWeight = 0.30` are defaulted with `formulaVersion = "70_30_v1"`.
  - In execution, wide-format CSV score re-imports and single-sheet class records only populate direct scores; when indirect exit ratings are null, the pipeline defaults `compositeScorePct` to 100% direct score without flagging data incompleteness.
- **Audit Verdict:** **Partially Synchronized.** The 70% threshold is rigidly guarded. The 70/30 composite calculation exists in schema and pure functions, but downstream workflows predominantly execute in direct-only mode.

### 1.4 Gemini AI Strategic Advisory Role & Safety Guardrails
- **Institutional & Policy Mandate:** AI-driven analytics must operate in a strictly advisory capacity. Generative models must never:
  1. Alter grades or attainment metrics autonomously.
  2. Write directly to primary academic or student tables.
  3. Bypass faculty or administrative approval chains.
  4. Expose Personally Identifiable Information (PII) to external model providers.
  5. Route institutional recommendations to unauthorized roles.
- **Codebase Implementation:**
  - **Role Guard:** Endpoint `POST /api/v1/ai/recommendation/generate` is gated via `assertCanGenerateAiInsights` in [`apps/backend/lib/role-access.ts`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/lib/role-access.ts). Only `vpaa` and `system_admin` roles can trigger generation (returns 403 Forbidden for faculty, chairs, and deans).
  - **PII Scrubbing:** Before generating prompts for Google Gemini (`gemini-2.5-flash`), [`apps/python-server/app/analytics/institutional_summary.py`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/python-server/app/analytics/institutional_summary.py#L166-L173) scrubs student identities, replacing student IDs and names with anonymized tokens (`Student A`, `Student B`).
  - **Database Isolation:** Recommendations write exclusively to table `AiRecommendation` ([`prisma/schema/08-monitoring.prisma`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/prisma/schema/08-monitoring.prisma)) with `status = "pending_review"`. No write pathways exist from the AI service to `StudentScore`, `CloAttainment`, or `PloAttainment`.
  - **Offline/Debug Mode:** In [`apps/python-server/app/analytics/cqi_recommender.py`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/python-server/app/analytics/cqi_recommender.py), `IS_DEBUG_MODE = True` remains enabled by default, ensuring deterministic, offline mock recommendations without external API reliance.
- **Audit Verdict:** **Fully Synchronized & Guarded.** System boundaries and data privacy controls for AI integration comply strictly with policy.

---

## 2. Computational Pipeline (Python ETL & Backend)

### 2.1 Formula 1A: Direct CLO Attainment (Per-Student Independent Recomputation)
- **Mathematical Specification:**
  $$\text{direct\_clo\_attainment\_pct} = \frac{\text{Prelim Score} + \text{Midterm Score} + \text{Final Score}}{\text{Prelim Max} + \text{Midterm Max} + \text{Final Max}} \times 100$$
- **Code Execution:** Implemented in [`apps/python-server/app/etl/transform/transformer.py`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/python-server/app/etl/transform/transformer.py). The ETL worker opens the workbook using `openpyxl` with `data_only=True`, reads the 6 raw score/max cells from the `Direct CLO` sheet, and calculates attainment independently. The workbook's internal Excel formulas are ignored.
- **Rule 1 Evaluation:** The transformer verifies that scores exist across all three terms (Prelim, Midterm, Final). If any are null, `is_record_complete` is flagged `False`. Section completeness is verified against a 60% threshold (`rule1_met = section_completeness_pct >= 0.60`).
- **Audit Verdict:** **Fully Synchronized.** Computation is mathematically rigorous and independent.

### 2.2 Formula 1B: Indirect CLO Attainment
- **Mathematical Specification:**
  $$\text{indirect\_clo\_attainment\_pct} = \left(\frac{\text{Likert Rating (1–5)}}{5.0}\right) \times 100$$
- **Code Execution:** Implemented in [`apps/python-server/app/etl/transform/transformer.py`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/python-server/app/etl/transform/transformer.py). Extracted from the `Indirect CLO` sheet row 4 onwards.
- **Audit Verdict:** **Fully Synchronized.** Correctly converted to percentage points (e.g., Rating 4 $\rightarrow$ 80.0%).

### 2.3 Formula 7A & 7C: PLO Rollup and The Broken Bridge (Critical Defect)
- **Mathematical Specification (Formula 7A):**
  $$\text{PLO Attainment} = \frac{\sum \text{Mean Attainment of Mapped CLOs}}{\text{Total Number of Mapped CLOs}}$$
- **Code Implementation (Python Server):** Implemented in [`apps/python-server/app/analytics/institutional_summary.py`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/python-server/app/analytics/institutional_summary.py#L34-L50). Correctly averages mapped CLO attainments.
- **The Broken Bridge (Architectural Disconnect):**
  1. In [`apps/python-server/app/etl/extract/extractor.py:191`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/python-server/app/etl/extract/extractor.py#L191), the extractor permanently retired reading CLO-PLO mappings from Excel workbooks, hardcoding:
     ```python
     "clo_plo_mapping": [] # CLO-PLO mapping is permanently retired from class record
     ```
  2. When the backend service `PloSummaryService.generate` prepares the payload for python-server `/analytics/summary` in [`apps/backend/src/v1/rollup/service.ts:376`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/rollup/service.ts#L376), it reads directly from the stored snapshot:
     ```typescript
     submissions.push({
       program: program.name,
       course_code: header.course_code ?? section.course.code,
       section: header.section ?? section.sectionCode,
       header,
       attainments: snapshot.attainments,
       clo_plo_mapping: Array.isArray(snapshot.clo_plo_mapping) ? snapshot.clo_plo_mapping : [],
     });
     ```
  3. The backend **fails to inject** the active database mappings from `prisma.cloToPloMap`!
  4. Consequently, `submissions[n].clo_plo_mapping` is always sent as an empty array `[]` to the python server. Python finds 0 mapped CLOs for every PLO, resulting in `programSummary.plos` being empty or unmapped.
  5. In [`apps/backend/src/v1/rollup/service.ts:391`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/rollup/service.ts#L391), this causes `RollupSourceNotFoundError` or leaves all PLO attainment records empty.
- **Audit Verdict:** **CRITICAL BREAK / DISCREPANCY.** Python server and TypeScript backend each assumed the other party owned the mapping injection, creating a complete failure in end-to-end PLO attainment generation.

### 2.4 Longitudinal & CQI Evaluation Logic
- **Cohort Tracking (F16):** Pure function `buildCohortLines` in [`apps/backend/src/v1/rollup/compute.ts`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/rollup/compute.ts) computes trends ($\uparrow, \downarrow, \rightarrow$) across consecutive terms and flags CQI triggers when any latest-term CLO is $< 70\%$.
- **Closing-the-Loop Evaluation (F25):** Function `computeLoopStatus` in [`apps/backend/src/v1/cqi/compute.ts`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/cqi/compute.ts) hard-computes `LoopStatus`:
  - `closed`: Only if all 5 condition booleans are `True` AND `interventionImplemented === "yes"`.
  - `open_not_implemented`: If `interventionImplemented === "no"` or narrative is blank.
  - `open_reassess`: All other partial states.
- **Audit Verdict:** **Fully Synchronized.** The 5-condition validation and non-editable computed status match institutional compliance rules.

---

## 3. Workflow & Approval Chain Validation

### 3.1 Canonical Approval Hierarchy vs. Implemented Approval Routes
The institutional manual specifies a 5-tier institutional hierarchy:
$$\text{Faculty (Preparer)} \longrightarrow \text{Program Chair} \longrightarrow \text{Dean} \longrightarrow \text{AQAU} \longrightarrow \text{VPAA}$$

The codebase establishes approval routing via [`apps/backend/lib/forms/approval-routes.ts`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/lib/forms/approval-routes.ts) and [`state-machine.ts`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/lib/forms/state-machine.ts). A comprehensive cross-examination reveals significant structural differences:

| Form Code & Title | Documented Approval Chain | Codebase Registered Chain (`approval-routes.ts`) | Preparer Roles in Code | Discrepancy Analysis |
| :--- | :--- | :--- | :--- | :--- |
| `curriculum_map` (F01) | Chair $\to$ Comm $\to$ AQAU | `['aqau']` | `program_chair`, `faculty` | Skips Dean; Committee omitted (offline). |
| `portfolio_roadmap` (F02) | Chair $\to$ Dean $\to$ AQAU | `['dean', 'aqau']` | `program_chair`, `faculty` | Synchronized. |
| `assessment_calendar` (F03) | Chair $\to$ Dean $\to$ AQAU | `['dean', 'aqau']` | `program_chair` | Synchronized. |
| `target_setting_matrix` (F04) | Chair/Dean $\to$ AQAU | `['aqau']` | `program_chair`, `dean` | Synchronized. |
| `assessment_budget` (F06) | Dean $\to$ VPAA (copy AQAU) | `['vpaa']` | `dean` | AQAU informational copy collapsed out. |
| `clo_raw_data` (F07) | Faculty $\to$ Chair | `['program_chair']` | `faculty`, `program_chair` | Chair permitted to prepare on behalf of program. |
| `mid_cycle_attainment` (F08)| Faculty $\to$ Chair | `['program_chair']` | `faculty` | Synchronized. |
| `resource_monitoring` (F09) | Dean/Chair $\to$ VPAA | `['vpaa']` | `dean`, `program_chair` | Synchronized. |
| `course_assessment_report` (CAR)| Faculty $\to$ Chair $\to$ AQAU | `['program_chair', 'dean', 'aqau']` | `faculty` | Injects `dean` step not specified in F13 header. |
| `clo_attainment_summary` (F14)| Faculty $\to$ Chair | `['program_chair']` | `faculty` | Synchronized. |
| `plo_attainment_summary` (F15)| Chair $\to$ Dean $\to$ AQAU | `['dean', 'aqau']` | `program_chair` | Synchronized. |
| `cohort_tracking` (F16) | Chair $\to$ AQAU | `['aqau']` | `program_chair` | Synchronized. |
| `plo_gap_analysis` (F22) | Chair $\to$ Dean | `['dean']` | `program_chair` | Synchronized. |
| `cqi_action_plan` (F23) | Chair $\to$ Dean $\to$ AQAU | `['dean', 'aqau']` | `program_chair` | Synchronized. |
| `annual_program_report` (F24) | Chair $\to$ Dean $\to$ VPAA | `['dean', 'vpaa']` | `program_chair` | Synchronized (Due June 30). |
| `closing_the_loop` (F25) | Chair $\to$ AQAU | `['aqau']` | `program_chair` | Synchronized. |
| `systemic_gap_report` (F26) | Dean $\to$ PAC + VPAA | `['vpaa']` | `dean` | PAC omitted (offline body); AQAU copy collapsed. |
| `capa_plan` (F27) | Dean/VPAA $\to$ AQAU | `['aqau']` | `dean`, `vpaa` | Synchronized. |
| `institutional_review` (F28) | VPAA/QA $\to$ President | `['vpaa']` | `aqau`, `vpaa` | President role mapped to VPAA in code. |

- **Critical Hierarchy Reality:**
  1. **Faculty is Never an Approver:** In code, `faculty` is categorized strictly as a preparer. No workflow route permits faculty to approve any document.
  2. **Zero Forms Implement the Full 4-Step Approver Chain:** Not a single institutional form routes through all 4 approver roles (`program_chair` $\to$ `dean` $\to$ `aqau` $\to$ `vpaa`). The full chain exists solely as an uninvoked `DEFAULT_APPROVAL_ROUTE` fallback.
  3. **VPAA Archive Monopoly:** Archiving approved forms is restricted to `vpaa` and `system_admin` ([`apps/backend/lib/role-access.ts`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/lib/role-access.ts)). AQAU can approve institutional quality filings but cannot archive them.

### 3.2 The Missing At-Risk Remediation / Action-Taken Workflow
- **Institutional Requirement:** Manual §3.5.8 mandates that any student failing to meet the 70% CLO threshold must be placed on an At-Risk Watchlist, requiring the course instructor to submit an official **Action-Taken / Remediation Record** detailing tutoring, re-assessment, or academic counseling before the flag can be resolved.
- **Codebase Reality:**
  - Table `AtRiskFlag` ([`prisma/schema/08-monitoring.prisma`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/prisma/schema/08-monitoring.prisma)) consists strictly of:
    ```prisma
    model AtRiskFlag {
      id              String   @id
      studentId       String   @map("student_id")
      cloAttainmentId String?  @map("clo_attainment_id")
      reason          String
      flaggedAt       DateTime @default(now()) @map("flagged_at")
    }
    ```
  - **No Lifecycle State:** There is no `status` field (e.g., `flagged`, `remediating`, `resolved`), no `actionTaken` description, no `resolvedAt` timestamp, and no resolving faculty ID.
  - **No Remediation Form or Endpoint:** There is no backend route or frontend UI to file an action taken.
  - **Falsification Dilemma:** In [`apps/backend/lib/ingest/score-edit.ts`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/lib/ingest/score-edit.ts), the only way an at-risk flag is deleted from the database is by manually updating raw student assessment scores to $\ge 70\%$. This creates a severe compliance violation: faculty cannot record remediation actions without tampering with historical student grades.
- **Audit Verdict:** **NON-COMPLIANT / ARCHITECTURAL GAP.** The remediation workflow mandated by OBE accreditation is entirely absent from the schema and API.

---

## 4. Phase-by-Phase Digitization & Development Ledger (Phases 0 – 7)

**Build Strategy:** Backend-First. All backend models, validators, service routes, and approval routing are completed before UI form screens.

### 4.1 Phase 0 — Backend Foundation & Stabilization `[COMPLETED]`
- [x] Prisma Schema (Auth, Academic, Outcomes, Assessment, Forms, Attainment, Monitoring, Reports, Archive).
- [x] Better-Auth (email/password, sessions), `/auth/me`, OpenAPI specs.
- [x] TypeScript configuration (`tsconfig.json` set to `moduleResolution: "bundler"`).
- [x] Code Quality Scripts: Biome linting, typechecking, `bun:test` test harness.
- [x] Forms Module: `FormSubmission` / `ApprovalStep` CRUD + submit/approve lifecycle state machine.
- [x] Python-Server Ingest Client: `POST /upload` with asynchronous polling on `GET /jobs/{job_id}`.
- [x] Shared Validators: $\ge 70\%$ floor, $70/30$ composite constants, 6-category root-cause enums.

### 4.2 Phase 1 — Per-Student CLO Raw Data (`clo_raw_data` / F07) `[COMPLETED]`
- [x] Backend Ingest Endpoint: Accept uploaded AUN-OBE class record, forward to python-server, persist parsed results.
- [x] Attainment Persistence: `AssessmentItem`, `StudentScore`, `CloAttainment`, `ComputationRun`.
- [x] At-Risk Auto-Derivation: Computed flag inserted for any CLO $< 70\%$ (`AtRiskFlag`).
- [x] Score Editing & Re-import: `PUT /attainments` (direct score edit + threshold recompute) and `POST /attainments/reimport` (wide-format CSV roster upsert).
- [x] Frontend UI: `/forms/clo-raw-data` upload panel, polling bar, upload history table.

### 4.3 Phase 2 — Course Assessment Report (`course_assessment_report` / F13) `[PARTIALLY BLOCKED]`
- [x] Backend CAR Service: 7-part CAR assembly in `src/v1/car/` (`compute.ts`, `service.ts`, `controller.ts`).
- [x] Attainment Aggregation: Auto-populates Part 3 (CLO summaries) and Part 4 (at-risk watchlist) directly from stored database rows.
- [x] Frontend UI: Tabbed 7-part interface in `/forms/course-assessment-report`.
- [ ] **Active Blockers:**
  - HTTP method mismatch on save: Frontend POSTs to `/car/:id`, backend listens on PUT (Section 7.2).
  - Part 1 Enrolled count is hardcoded to 0 because `Enrollment` table is never populated (Section 7.6).
  - Part 2 Assessment Category breakdown yields null because template lacks TLA/AT categorization (Section 7.7).

### 4.4 Phase 3 — Roll-up Chain (F14, F15, F16) `[PARTIALLY BLOCKED]`
- [x] Backend `clo_attainment_summary` (F14): Term-level CLO attainment by cohort.
- [x] Backend `cohort_tracking` (F16): Longitudinal tracking with permanent audit trails and CQI trigger flags.
- [x] Frontend UI: Screens built for F14, F15, and F16 under `/forms/attainment/`.
- [ ] **Critical Blocker on `plo_attainment_summary` (F15):** Backend `PloSummaryService` passes empty `clo_plo_mapping: []` snapshot to Python server, preventing all PLO rollups from computing (Section 7.4).

### 4.5 Phase 4 — CQI / ACT Loop (F22, F23, F24, F25) `[COMPLETED]`
- [x] `plo_gap_analysis` (F22): Generates gap rows for NOT-MET PLO-cohort combinations with 6-category root-cause validation.
- [x] `cqi_action_plan` (F23): Two-phase stateful lifecycle (Planned $\to$ Tracked to Completion).
- [x] `closing_the_loop` (F25): Hard-computed loop closure status (`closed` requires all 5 condition flags `true` and action executed).
- [x] `annual_program_report` (F24): Blocks submission if F16 Cohort Tracking Sheet is absent.
- [x] Frontend UI: Screens built for F22, F23, F24, F25 under `/forms/cqi/`.

### 4.6 Phase 5 — PLAN-Phase Setup Forms (F01, F03, F04, F06) `[COMPLETED]`
- [x] `curriculum_map` (F01): Dynamic CLO-PLO matrix, coverage check, and `CloToPloMapService` connection panel.
  - *Note:* Save currently blocked by POST vs PUT method mismatch (Section 7.3).
- [x] `assessment_calendar` (F03): 17 pre-seeded institutional template milestones (editable, non-deletable).
- [x] `target_setting_matrix` (F04): Enforces $\ge 70\%$ hard floor with mandatory rationale above floor.
- [x] `assessment_budget` (F06): 12 fixed line items by PDCA phase with auto-computed totals.
- [x] Frontend UI: Screens built for all 4 setup forms under `/forms/plan/`.

### 4.7 Phase 6 — Supporting & Periodic / Institutional Instruments `[MIXED STATE]`
- **DO/CHECK Instruments (CHECK Module `/api/v1/check`):**
  - [x] Backend services & endpoints live: F08 (Mid-Cycle), F10 (Peer Observation), F11 (Exhibition Feedback), F12 (CLO Perception), F17 (Student Exit Survey), F18 (Portfolio Assessment), F19 (Capstone Panel).
  - [x] Frontend UI: All 7 screens built under `/forms/check/` and wired with the shared `FormWorkflow` approval bar.
- **Periodic / Institutional Instruments (Periodic Module `/api/v1/periodic`):**
  - [x] Backend services & submit gates live: F09 (Resource Monitoring), F20 (Alumni Tracer), F21 (Employer Survey), F26 (Systemic Gap), F27 (CAPA Plan), F28 (Institutional Review), F02 (Portfolio Roadmap).
  - [ ] Frontend UI: **Screens unbuilt.** No Next.js routes exist under `/forms/periodic/`.

### 4.8 Phase 7 — Graduation-Cluster Archival Pipeline `[DEFERRED / INCOMPLETE]`
- **Architectural Scope:** Compiles finished cohorts into compact, read-only snapshots keyed by actual graduation term, purging granular hot rows (`StudentScore`, raw `CloAttainment`) while retaining permanent `PloAttainment`.
- **Status:**
  - [x] Database Schema Complete: Models `GraduationCluster`, `GraduationClusterEntry`, `PeoAttainment`, and enums `StudentStatus`, `GraduationClusterStatus` applied in DB (`20260805000000_add_graduation_cluster_archival`).
  - [x] Frontend Archives Viewer Shell: Route `/archives` and `[clusterId]` exist behind role gate (`aqau`, `vpaa`, `dean`, `system_admin`).
  - [ ] Backend Compilation Pipeline: Auto-clustering at AY end, purge execution, and detail artifact export (`detailArtifactUrl`) remain unbuilt.
  - [ ] **PEO Prerequisite Gate:** Archival compilation cannot run until biennial PEO attainment evidence (F20/F21) is captured.

---

### 4.9 Comprehensive 37-Form Digitization Ledger

| Form ID | Official Form Title | PDCA Phase | Backend Service & Route | Frontend Route & Status | Approval Chain | Actual Status |
| :--- | :--- | :---: | :--- | :--- | :---: | :--- |
| **F01** | CLO-PLO Curriculum Map | PLAN | `CurriculumMapService`<br>`/api/v1/plan/curriculum-map` | `/forms/plan/curriculum-map` | `['aqau']` | **Partially Blocked** (Save POST/PUT bug) |
| **F02** | Portfolio Roadmap & Rubric | PLAN | `PortfolioRoadmapService`<br>`/api/v1/periodic/portfolio-roadmap` | **MISSING** (No UI route) | `['dean', 'aqau']` | **Backend-Only** |
| **F03** | Assessment Calendar | PLAN | `AssessmentCalendarService`<br>`/api/v1/plan/assessment-calendar` | `/forms/plan/assessment-calendar` | `['dean', 'aqau']` | **Fully Implemented** |
| **F04** | Target-Setting Matrix | PLAN | `TargetSettingMatrixService`<br>`/api/v1/plan/target-setting-matrix` | `/forms/plan/target-setting-matrix` | `['aqau']` | **Fully Implemented** |
| **F05** | Stakeholder Consultation | PLAN | Generic form handler | **MISSING** (No UI route) | `['program_chair']` | **Backend-Only** (JSON store only) |
| **F06** | Approved Assessment Budget | PLAN | `AssessmentBudgetService`<br>`/api/v1/plan/assessment-budget` | `/forms/plan/assessment-budget` | `['vpaa']` | **Fully Implemented** |
| **F07** | Per-Student CLO Raw Data Sheet | DO | `IngestService`<br>`/api/v1/ingest/upload` | `/forms/clo-raw-data` | `['program_chair']` | **Fully Implemented** |
| **F08** | Mid-Cycle CLO Attainment | DO | `MidCycleAttainmentService`<br>`/api/v1/check/mid-cycle-attainment` | `/forms/check/mid-cycle-attainment` | `['program_chair']` | **Fully Implemented** |
| **F09** | Resource Monitoring | DO | `ResourceMonitoringService`<br>`/api/v1/periodic/resource-monitoring` | **MISSING** (No UI route) | `['vpaa']` | **Backend-Only** |
| **F10** | Peer Observation Record | DO | `PeerObservationService`<br>`/api/v1/check/peer-observation` | `/forms/check/peer-observation` | `['program_chair']` | **Fully Implemented** |
| **F11** | Exhibition Industry Feedback | DO | `ExhibitionFeedbackService`<br>`/api/v1/check/exhibition-feedback` | `/forms/check/exhibition-feedback` | `['program_chair']` | **Fully Implemented** |
| **F12** | CLO Perception Survey | DO | `CloPerceptionSurveyService`<br>`/api/v1/check/clo-perception-survey` | `/forms/check/clo-perception-survey` | `['program_chair']` | **Fully Implemented** |
| **F13** | Course Assessment Report (CAR) | CHECK | `CarService`<br>`/api/v1/car` | `/forms/course-assessment-report` | `['chair', 'dean', 'aqau']` | **Partially Blocked** (Save verb, Part 2 null, Enrolled=0) |
| **F14** | CLO Attainment Summary | CHECK | `CloSummaryService`<br>`/api/v1/rollup/clo-attainment-summary` | `/forms/attainment/clo-attainment-summary` | `['program_chair']` | **Fully Implemented** |
| **F15** | PLO Attainment Summary | CHECK | `PloSummaryService`<br>`/api/v1/rollup/plo-attainment-summary` | `/forms/attainment/plo-attainment-summary` | `['dean', 'aqau']` | **Critical Break** (Empty mapping bridge) |
| **F16** | Cohort Tracking Sheet | CHECK | `CohortTrackingService`<br>`/api/v1/rollup/cohort-tracking` | `/forms/attainment/cohort-tracking` | `['aqau']` | **Fully Implemented** |
| **F17** | Student Exit Survey Tabulation | CHECK | `StudentExitSurveyService`<br>`/api/v1/check/student-exit-survey` | `/forms/check/student-exit-survey` | `['program_chair']` | **Fully Implemented** |
| **F18** | Portfolio Assessment Record | CHECK | `PortfolioAssessmentService`<br>`/api/v1/check/portfolio-assessment` | `/forms/check/portfolio-assessment` | `['aqau']` | **Fully Implemented** |
| **F19** | Capstone Panel Evaluation | CHECK | `CapstonePanelEvaluationService`<br>`/api/v1/check/capstone-panel` | `/forms/check/capstone-panel` | `['chair', 'aqau']` | **Fully Implemented** |
| **F20** | Alumni Tracer Study Report | CHECK | `AlumniTracerService`<br>`/api/v1/periodic/alumni-tracer` | **MISSING** (No UI route) | `['chair', 'dean']` | **Deferred per Scope** |
| **F21** | Employer Satisfaction Survey | CHECK | `EmployerSurveyService`<br>`/api/v1/periodic/employer-survey` | **MISSING** (No UI route) | `['chair', 'dean']` | **Deferred per Scope** |
| **F22** | PLO Gap Analysis Report | ACT | `PloGapAnalysisService`<br>`/api/v1/cqi/plo-gap-analysis` | `/forms/cqi/plo-gap-analysis` | `['dean']` | **Fully Implemented** |
| **F23** | CQI Action Plan | ACT | `CqiActionPlanService`<br>`/api/v1/cqi/cqi-action-plan` | `/forms/cqi/cqi-action-plan` | `['dean', 'aqau']` | **Fully Implemented** |
| **F24** | Annual Program Report (APAR) | ACT | `AnnualProgramReportService`<br>`/api/v1/cqi/annual-program-report` | `/forms/cqi/annual-program-report` | `['dean', 'vpaa']` | **Fully Implemented** |
| **F25** | Closing-the-Loop (CTL) Report | ACT | `ClosingTheLoopService`<br>`/api/v1/cqi/closing-the-loop` | `/forms/cqi/closing-the-loop` | `['aqau']` | **Fully Implemented** |
| **F26** | Systemic Gap Report | ACT | `SystemicGapReportService`<br>`/api/v1/periodic/systemic-gap-report` | **MISSING** (No UI route) | `['vpaa']` | **Backend-Only** |
| **F27** | CAPA Plan | ACT | `CapaPlanService`<br>`/api/v1/periodic/capa-plan` | **MISSING** (No UI route) | `['aqau']` | **Backend-Only** |
| **F28** | Institutional Review | ACT | `InstitutionalReviewService`<br>`/api/v1/periodic/institutional-review` | **MISSING** (No UI route) | `['vpaa']` | **Backend-Only** |
| **F29–F37, F41** | Specialty & Consolidation Schedules | VARIOUS | None (Undefined in manual) | None | None | **Unspecified / Future Scope** |

---

## 5. Frontend & UI Infrastructure Status

### 5.1 Architecture & Role-Scoped Gating
- **Shell & Navigation:** Layouts, theme, sidebar, and login are operational. Routing is config-driven via `lib/roles.ts` and `config/navigation.ts`.
- **Adaptive Dashboards:** A single entry point at `/dashboard` loads adaptive views for each of the 6 system roles (`faculty`, `program_chair`, `dean`, `aqau`, `vpaa`, `system_admin`).
- **Workflow Stepper Bar (`FormWorkflow`):** Embedded on all 13 Phase 0–5 forms and all 7 Phase 6 CHECK forms. Provides real-time status badges, reviewer comments, and role-authorized buttons (`Submit`, `Approve`, `Return with Comment`, `Archive`).
- **Submission Inboxes:** Dedicated user views at `/submissions` ("My Submissions") and `/approvals` ("Pending Approvals") backed by `GET /forms?scope=mine|pending`.

### 5.2 State Management (Jotai Atoms) & Chart Rendering
- **Data Hydration:** Client state uses Jotai atoms under `apps/frontend/lib/store/atoms/`. Atoms resolve live payloads from backend list endpoints via `atomWithAsyncData` and `fetchLatestPayload`.
- **Zero-Fabrication Policy:** All static `MOCK_*` datasets were eradicated from client code. If an endpoint returns an unseeded or empty array, atoms resolve to empty arrays `[]` and render clean `ChartEmptyState` components.
- **Defect — Hardcoded Empty Stat Banner:** In [`apps/frontend/app/(app)/dashboard/role-dashboard.tsx:87`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/frontend/app/(app)/dashboard/role-dashboard.tsx#L87), `stats: StatCard[] = []` is hardcoded across all 6 roles. Summary KPI cards (active at-risk students, pending approvals, program attainment rate) remain permanently unpopulated.

### 5.3 Missing Components & Reporting Engine
- **Dedicated OBE Primitives:** Components such as Bloom's selectors, Likert scales, and I-P-D selectors are currently inlined within individual screen files rather than packaged in a reusable `components/obe/` library.
- **Physical Report Export Engine:** Although model `ReportExport` exists in [`prisma/schema/09-reports.prisma`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/prisma/schema/09-reports.prisma), no server-side document rendering microservice (PDF/Puppeteer/ExcelJS) exists. UI export buttons are non-functional placeholders.

---

## 6. Service Readiness & Operational Architecture

### 6.1 Python Server (`apps/python-server`)
- **Implemented Capabilities:**
  - Dynamic CLO and roster discovery via `openpyxl`.
  - Independent Formula 1A direct CLO attainment with Rule-1 completeness verification.
  - Analytics rollups (Formulas 2A, 7A, 7C, Rule 3).
  - PII scrubbing before LLM prompt compilation.
- **Pending Capabilities:**
  - Real loader delivery to backend (currently uses in-memory / dummy loader mechanism).
  - Production job queue (currently uses an in-memory job dictionary).
  - Live Gemini API enablement (currently defaults to `IS_DEBUG_MODE = True`).

### 6.2 TypeScript Backend (`apps/backend`)
- **Implemented Capabilities:**
  - Elysia framework with Better-Auth session management and OpenAPI schemas.
  - Full Prisma ORM schema across 13 modular schema files.
  - Centralized server-side approval routes and RBAC assertions (`lib/forms/approval-routes.ts`).
  - Score edit, CSV wide-format re-import, and automatic at-risk calculation.
- **Pending Capabilities:**
  - Archival pipeline execution (Phase 7).
  - At-risk remediation / action-taken lifecycle routes.

### 6.3 Database & Environment Separation
- **Branch Topology:** Local dev environment and remote production use **separate Neon branches sharing identical schemas**.
- **Test Database Wipe:** The integration test runner (`apps/backend/test/helpers/run-tests.ts`) executes a complete truncate of all 39 tables before and after each run. This isolates the dev branch safely without endangering production, but requires re-running `just db-seed` before browser testing.

---

## 7. Critical Code Discrepancies & Blocker Registry

### 7.1 Blocker 1: Missing Production Guard in Database Seeder (CRITICAL)
- **Source Location:** [`apps/backend/prisma/seed.ts:231-253`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/prisma/seed.ts#L231-L253)
- **Defect:** `main()` executes destructive `deleteMany` calls across `atRiskFlag`, `cloAttainment`, `computationRun`, `student`, and institutional `user` rows without checking `NODE_ENV === "production"`.
- **Impact:** Running `bun run db:seed` against production permanently wipes institutional academic records.
- **Remedy:** Add an immediate guard:
  ```typescript
  if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL?.includes("prod")) {
    throw new Error("FATAL: Seeding is blocked on production instances.");
  }
  ```

### 7.2 Blocker 2: HTTP Method Mismatch on CAR Save (HIGH)
- **Source Locations:**
  - Client: [`apps/frontend/server/actions/car.ts:50`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/frontend/server/actions/car.ts#L50)
  - Server: [`apps/backend/src/v1/car/controller.ts:96`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/car/controller.ts#L96)
- **Defect:** Frontend Server Action calls `actionApi.post('/car/${id}', parts)`, but backend controller listens on `.put("/:id")`.
- **Impact:** Clicking "Save Draft" on CAR throws 404/405, preventing saving parts 1, 5, 6, and 7.
- **Remedy:** Change `actionApi.post` to `actionApi.put` in `apps/frontend/server/actions/car.ts`.

### 7.3 Blocker 3: HTTP Method Mismatch on Curriculum Map Save (HIGH)
- **Source Locations:**
  - Client: [`apps/frontend/server/actions/plan.ts:69`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/frontend/server/actions/plan.ts#L69)
  - Server: [`apps/backend/src/v1/plan/controller.ts:169`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/plan/controller.ts#L169)
- **Defect:** Frontend calls `actionApi.post('/plan/curriculum-map/${id}', body)`, but backend listens on `.put("/curriculum-map/:id")`.
- **Impact:** Program chairs cannot persist matrix changes to the CLO-PLO Curriculum Map (F01).
- **Remedy:** Change `actionApi.post` to `actionApi.put` in `apps/frontend/server/actions/plan.ts`.

### 7.4 Blocker 4: Broken Mapping Bridge in PLO Rollup (CRITICAL)
- **Source Locations:**
  - Extractor: [`apps/python-server/app/etl/extract/extractor.py:191`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/python-server/app/etl/extract/extractor.py#L191)
  - Rollup Service: [`apps/backend/src/v1/rollup/service.ts:376`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/rollup/service.ts#L376)
- **Defect:** Extractor returns `clo_plo_mapping: []`. Backend rollup service constructs python `/analytics/summary` payload directly from the snapshot without querying database table `CloToPloMap`.
- **Impact:** PLO rollups find 0 mapped CLOs for all programs, breaking F15 and halting the CHECK/ACT compliance pipeline.
- **Remedy:** In `rollup/service.ts`, query `prisma.cloToPloMap.findMany({ where: { courseId: ... } })` and inject active mappings into the payload.

### 7.5 Blocker 5: Duplicate Computation Runs on Class Record Re-Upload (MEDIUM)
- **Source Location:** [`apps/backend/src/v1/ingest/service.ts:221-236`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/ingest/service.ts#L221-L236)
- **Defect:** Re-uploading a class record creates a new `ComputationRun` and appends duplicate `CloAttainment` rows without invalidating prior runs.
- **Impact:** Database accumulates orphaned runs, and rollup queries without run IDs risk double-counting scores.
- **Remedy:** Implement replace-or-supersede logic marking earlier runs as inactive prior to persisting new attainment records.

### 7.6 Blocker 6: CAR Part 1 Enrolled Count Always Zero (HIGH)
- **Source Location:** [`apps/backend/src/v1/car/service.ts:150`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/car/service.ts#L150)
- **Defect:** CAR Part 1 calculates enrollment via `prisma.enrollment.count()`. However, zero routines in the ingest service write to `Enrollment`.
- **Impact:** CAR displays "No. Enrolled: 0 | No. Completed: 35".
- **Remedy:** During class record persistence, upsert `Enrollment` rows for each student in the section, or fall back to counting distinct students with scores in that section.

### 7.7 Blocker 7: CAR Part 2 Category Breakdown Always Null (HIGH)
- **Source Location:** [`apps/backend/src/v1/car/service.ts:467-488`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/car/service.ts#L467-L488)
- **Defect:** Official AUN-OBE v2 template provides aggregate scores per term without category-level breakdown (exam, rubric, TLA).
- **Impact:** CAR Part 2 renders tables of dashes/nulls.
- **Remedy:** Update CAR UI empty state to gracefully handle un-categorized templates without displaying broken tables.

---

## 8. Development Backlog & Technical Inquiries

### 8.1 Data Pipeline & Integration
- [ ] **Enforce Class Record as Mandatory Pipeline Prerequisite:** Ensure all downstream forms (CAR $\to$ PLO Rollup $\to$ Gap Analysis $\to$ CQI Action Plan) block generation with explicit validation if no verified class record ingestion exists for that section and term.
- [ ] **End-to-End Pipeline Verification:** Verify full chain: Class record upload $\to$ CLO attainment $\to$ CAR $\to$ PLO rollup $\to$ Gap analysis $\to$ CQI loop closure without manual data re-entry.
- [ ] **At-Risk Student Remediation Form:** Build dedicated remediation record form and database schema (`status`, `actionTaken`, `resolvedBy`) to enable resolving at-risk flags without tampering with historical grades.

### 8.2 Forms, Security & Workflow
- [ ] **Draft Save Ownership & Authorization:** Resolve whether draft editing on form screens should allow collaborative role edits or enforce strict creator-only ownership as in `PUT /forms/:id`.
- [ ] **Ambiguous Approval Chain Sanity Checks:** Confirm whether `curriculum_map` routes only to `['aqau']`, `systemic_gap_report` to `['vpaa']`, and whether `peer_observation` should permit same-role chair sign-off.
- [ ] **Server Investigation — Phantom GET Requests:** Investigate and eliminate unprompted background GET requests observed hitting backend endpoints (verify if caused by stale client polling or prefetching).

---

## 9. Executive Remediation & Milestone Matrix

| Category | Finding / Work Item | Severity | Target Remediation |
| :--- | :--- | :---: | :--- |
| **Pipeline Bridge** | Empty `clo_plo_mapping` sent to python-server in F15 rollup. | **CRITICAL** | In `rollup/service.ts:376`, query `prisma.cloToPloMap` and inject real mappings. |
| **Database Safety** | `seed.ts` wipes database without environment check. | **CRITICAL** | Wrap cleanup in `seed.ts` with `if (process.env.NODE_ENV === 'production') throw`. |
| **Frontend/Backend Sync** | CAR Save calls `POST /car/:id` instead of `PUT`. | **HIGH** | In `actions/car.ts:50`, switch `actionApi.post` to `actionApi.put`. |
| **Frontend/Backend Sync** | Curriculum Map calls `POST /plan/curriculum-map/:id` instead of `PUT`. | **HIGH** | In `actions/plan.ts:69`, switch `actionApi.post` to `actionApi.put`. |
| **Academic Ledger** | CAR Part 1 `noEnrolled` counts unpopulated `Enrollment` table. | **HIGH** | Upsert `Enrollment` rows during ingest or count distinct `CloAttainment` students. |
| **Accreditation Workflow** | Missing At-Risk Student Action-Taken / Remediation workflow. | **HIGH** | Add lifecycle fields to `AtRiskFlag` schema; build remediation form and API route. |
| **Ingest Stability** | Class record re-upload appends duplicate `ComputationRun` records. | **MEDIUM** | Mark prior runs superseded or purge prior unapproved run attainments. |
| **Executive UI** | Dashboard KPI stats banner hardcoded empty (`stats = []`). | **MEDIUM** | Wire role dashboard shell to aggregate queries (pending approvals, at-risk count). |
| **Institutional UI** | 7 Periodic/ACT form screens (F02, F09, F20, F21, F26, F27, F28) unbuilt. | **MEDIUM** | Build frontend route pages connecting to `/api/v1/periodic` backend endpoints. |
| **Compliance Output** | Report Export (PDF/Excel) engine unbuilt. | **LOW** | Implement server-side document rendering targeting official JMCFI form templates. |
