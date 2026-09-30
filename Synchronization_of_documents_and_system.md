# OBELISK: Synchronization of Documents and System

> **Auditor Notice & System Ledger**  
> **Evaluation Mode:** Read-Only Systems Cross-Examination  
> **Project Scope:** Jose Maria College Foundation, Inc. (JMCFI) — Outcomes-Based Educational Learning and Intelligent System Kit (OBELISK)  
> **Target Pilot:** College of Information Technology Education (CITE) — BS Information Technology (BSIT) Program, Section 1A Pilot  
> **Document Purpose:** Definitive, objective cross-examination between institutional OBE documentation (37 forms, 8-level hierarchy, assessment formulas) and actual system execution across Backend (Elysia/Prisma), Frontend (Next.js 16/Jotai), and Analytics Engine (FastAPI/Python).

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
  - **PII Scrubbing:** Before generating prompts for Google Gemini (`gemini-3.6-flash`), [`apps/python-server/app/analytics/institutional_summary.py`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/python-server/app/analytics/institutional_summary.py#L166-L173) scrubs student identities, replacing student IDs and names with anonymized tokens (`Student A`, `Student B`).
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

## 4. Form Digitization Ledger (Phases 0 - 6)

The following ledger cross-references the 37 institutional forms recognized in JMCFI documentation against actual codebase assets:

| Form ID | Official Form Title | PDCA Phase | Prisma Models / Storage | Backend Service & Route | Frontend Screen & Route | Approval Chain Wired | Actual Implementation Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :---: | :--- |
| **F01** | CLO-PLO Curriculum Map | PLAN | `PloDirectoryRow`, `CurriculumCourseRow`, `CurriculumMapCell` | `CurriculumMapService`<br>`/api/v1/plan/curriculum-map` | `/forms/plan/curriculum-map` | `['aqau']` | **Partially Implemented** (Blocked by Save POST/PUT bug) |
| **F02** | Portfolio Roadmap & Rubric | PLAN | `PortfolioRoadmapRow`, `PortfolioRubricRow` | `PortfolioRoadmapService`<br>`/api/v1/periodic/portfolio-roadmap` | **MISSING** (No UI route) | `['dean', 'aqau']` | **Backend-Only** (Phase 6 API live, screen unbuilt) |
| **F03** | Assessment Calendar | PLAN | `CalendarEventRow`, `FormSubmission` | `AssessmentCalendarService`<br>`/api/v1/plan/assessment-calendar` | `/forms/plan/assessment-calendar` | `['dean', 'aqau']` | **Fully Implemented** (17 fixed templates protected) |
| **F04** | Target-Setting Matrix | PLAN | `PloTargetRow`, `CourseCloTargetRow` | `TargetSettingMatrixService`<br>`/api/v1/plan/target-setting-matrix` | `/forms/plan/target-setting-matrix` | `['aqau']` | **Fully Implemented** ($\ge 70\%$ floor enforced) |
| **F05** | Stakeholder Consultation | PLAN | `FormSubmission.formData` | Backend routes active in generic forms module | **MISSING** (No UI route) | `['program_chair']` | **Backend-Only** (JSON store only) |
| **F06** | Approved Assessment Budget | PLAN | `BudgetLineItem`, `FormSubmission` | `AssessmentBudgetService`<br>`/api/v1/plan/assessment-budget` | `/forms/plan/assessment-budget` | `['vpaa']` | **Fully Implemented** (12 fixed items non-deletable) |
| **F07** | Per-Student CLO Raw Data Sheet | DO | `ClassSection`, `CloAttainment`, `StudentScore`, `AtRiskFlag` | `IngestService`<br>`/api/v1/ingest/upload` | `/forms/clo-raw-data` | `['program_chair']` | **Fully Implemented** (AUN-OBE Excel ingestion) |
| **F08** | Mid-Cycle CLO Attainment | DO | `MidCycleCohortRow`, `FormSubmission` | `MidCycleAttainmentService`<br>`/api/v1/check/mid-cycle-attainment` | `/forms/check/mid-cycle-attainment` | `['program_chair']` | **Fully Implemented** (Cohort rows + watchlist) |
| **F09** | Resource Monitoring | DO | `ResourceItemRow`, `CqiImplementRow` | `ResourceMonitoringService`<br>`/api/v1/periodic/resource-monitoring` | **MISSING** (No UI route) | `['vpaa']` | **Backend-Only** (Phase 6 API live, screen unbuilt) |
| **F10** | Peer Observation Record | DO | `FormSubmission.formData` | `PeerObservationService`<br>`/api/v1/check/peer-observation` | `/forms/check/peer-observation` | `['program_chair']` | **Fully Implemented** (7 fixed criteria) |
| **F11** | Exhibition Industry Feedback | DO | `ExhibitionGuestRow`, `FormSubmission` | `ExhibitionFeedbackService`<br>`/api/v1/check/exhibition-feedback` | `/forms/check/exhibition-feedback` | `['program_chair']` | **Fully Implemented** ($\ge 3$ guests submit gate) |
| **F12** | CLO Perception Survey | DO | `FormSubmission.formData` | `CloPerceptionSurveyService`<br>`/api/v1/check/clo-perception-survey` | `/forms/check/clo-perception-survey` | `['program_chair']` | **Fully Implemented** (Likert tab + divergence flag) |
| **F13** | Course Assessment Report (CAR) | CHECK | `FormSubmission`, `CloAttainment`, `AtRiskFlag` | `CarService`<br>`/api/v1/car` | `/forms/course-assessment-report` | `['chair', 'dean', 'aqau']` | **Partially Implemented** (Blocked by Save verb bug, Part 2 null, Enrolled=0) |
| **F14** | CLO Attainment Summary | CHECK | `CloAttainment`, `FormSubmission` | `CloSummaryService`<br>`/api/v1/rollup/clo-attainment-summary` | `/forms/attainment/clo-attainment-summary` | `['program_chair']` | **Fully Implemented** (Term-level per-CLO rollup) |
| **F15** | PLO Attainment Summary | CHECK | `PloAttainment`, `ComputationRun` | `PloSummaryService`<br>`/api/v1/rollup/plo-attainment-summary` | `/forms/attainment/plo-attainment-summary` | `['dean', 'aqau']` | **Broken Execution** (Blocked by empty mapping bridge) |
| **F16** | Cohort Tracking Sheet | CHECK | `PloAttainment`, `CloAttainment`, `AuditLog` | `CohortTrackingService`<br>`/api/v1/rollup/cohort-tracking` | `/forms/attainment/cohort-tracking` | `['aqau']` | **Fully Implemented** (Longitudinal, audited writes) |
| **F17** | Student Exit Survey Tabulation | CHECK | `FormSubmission.formData` | `StudentExitSurveyService`<br>`/api/v1/check/student-exit-survey` | `/forms/check/student-exit-survey` | `['program_chair']` | **Fully Implemented** (Response rate + divergence) |
| **F18** | Portfolio Assessment Record | CHECK | `PortfolioCriterionRow` | `PortfolioAssessmentService`<br>`/api/v1/check/portfolio-assessment` | `/forms/check/portfolio-assessment` | `['aqau']` | **Fully Implemented** (Panel consensus rubric) |
| **F19** | Capstone Panel Evaluation | CHECK | `CapstonePanelistRow` | `CapstonePanelEvaluationService`<br>`/api/v1/check/capstone-panel` | `/forms/check/capstone-panel` | `['chair', 'aqau']` | **Fully Implemented** ($\ge 2$ fac + 1 ind gate) |
| **F20** | Alumni Tracer Study Report | CHECK | `FormSubmission.formData` | `AlumniTracerService`<br>`/api/v1/periodic/alumni-tracer` | **MISSING** (No UI route) | `['chair', 'dean']` | **Deferred per Scope Agreement** (Biennial gate live) |
| **F21** | Employer Satisfaction Survey | CHECK | `FormSubmission.formData` | `EmployerSurveyService`<br>`/api/v1/periodic/employer-survey` | **MISSING** (No UI route) | `['chair', 'dean']` | **Deferred per Scope Agreement** (Biennial gate live) |
| **F22** | PLO Gap Analysis Report | ACT | `GapRow`, `FormSubmission` | `PloGapAnalysisService`<br>`/api/v1/cqi/plo-gap-analysis` | `/forms/cqi/plo-gap-analysis` | `['dean']` | **Fully Implemented** (6 root causes validated) |
| **F23** | CQI Action Plan | ACT | `CqiEntry`, `GapRow` | `CqiActionPlanService`<br>`/api/v1/cqi/cqi-action-plan` | `/forms/cqi/cqi-action-plan` | `['dean', 'aqau']` | **Fully Implemented** (2-phase planned $\to$ tracked) |
| **F24** | Annual Program Report (APAR) | ACT | `FormSubmission.formData` | `AnnualProgramReportService`<br>`/api/v1/cqi/annual-program-report` | `/forms/cqi/annual-program-report` | `['dean', 'vpaa']` | **Fully Implemented** (11 KPIs; F16 attachment gate) |
| **F25** | Closing-the-Loop (CTL) Report | ACT | `CtlRow`, `CqiEntry` | `ClosingTheLoopService`<br>`/api/v1/cqi/closing-the-loop` | `/forms/cqi/closing-the-loop` | `['aqau']` | **Fully Implemented** (5 condition flags hard-computed) |
| **F26** | Systemic Gap Report | ACT | `FormSubmission.formData` | `SystemicGapReportService`<br>`/api/v1/periodic/systemic-gap-report` | **MISSING** (No UI route) | `['vpaa']` | **Backend-Only** (Trigger gate: 3 NOT-MET cycles) |
| **F27** | CAPA Plan | ACT | `FormSubmission.formData` | `CapaPlanService`<br>`/api/v1/periodic/capa-plan` | **MISSING** (No UI route) | `['aqau']` | **Backend-Only** ($\le 8$ actions; F26 approval gate) |
| **F28** | Institutional Review | ACT | `FormSubmission.formData` | `InstitutionalReviewService`<br>`/api/v1/periodic/institutional-review` | **MISSING** (No UI route) | `['vpaa']` | **Backend-Only** (Decisions D1–D5; Due July 15) |
| **F29–F37, F41** | Specialty & Consolidation Schedules | VARIOUS | None (Undefined in manual) | None | None | None | **Unspecified / Future Placeholders** |

---

## 5. Critical Code-to-Document Discrepancies (Blockers)

### 5.1 Blocker 1: Missing Production Safety Guard in Database Seeder
- **Source Location:** [`apps/backend/prisma/seed.ts:231-253`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/prisma/seed.ts#L231-L253)
- **Code Behavior:**
  ```typescript
  console.log("Cleaning up previous seed data...");
  await prisma.atRiskFlag.deleteMany({});
  await prisma.cloAttainment.deleteMany({});
  await prisma.computationRun.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { endsWith: "@jmcfi.edu.ph" } } });
  ```
- **Discrepancy / Impact:** Running `bun run db:seed` in an environment configured with a production database connection immediately wipes all student records, attainment computations, at-risk flags, and active institutional user accounts. No `process.env.NODE_ENV === "production"` assertion exists to abort the process.

### 5.2 Blocker 2: HTTP Method Mismatch on CAR Save
- **Source Locations:**
  - Caller: [`apps/frontend/server/actions/car.ts:50`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/frontend/server/actions/car.ts#L50)
  - Receiver: [`apps/backend/src/v1/car/controller.ts:96`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/car/controller.ts#L96)
- **Code Behavior:** The frontend Server Action executes:
  ```typescript
  const data = await actionApi.post<{ id: string; formData: Record<string, unknown> }>(`/car/${id}`, parts);
  ```
  However, the backend Elysia controller registers:
  ```typescript
  .put("/:id", async ({ params, body, user, set }) => { ... })
  ```
- **Discrepancy / Impact:** When faculty click "Save Draft" on the Course Assessment Report (CAR) to store parts 1, 5, 6, and 7, the HTTP request fails with `404 Not Found` or `405 Method Not Allowed`, preventing CAR updates.

### 5.3 Blocker 3: HTTP Method Mismatch on Curriculum Map Save
- **Source Locations:**
  - Caller: [`apps/frontend/server/actions/plan.ts:69`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/frontend/server/actions/plan.ts#L69)
  - Receiver: [`apps/backend/src/v1/plan/controller.ts:169`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/plan/controller.ts#L169)
- **Code Behavior:** Frontend Server Action calls `actionApi.post('/plan/curriculum-map/${id}', body)`. Backend controller strictly listens on `.put("/curriculum-map/:id")`.
- **Discrepancy / Impact:** Program chairs cannot persist updates to the CLO-PLO Curriculum Map (F01).

### 5.4 Blocker 4: Broken CLO-PLO Mapping Bridge in PLO Rollup
- **Source Locations:**
  - Extractor: [`apps/python-server/app/etl/extract/extractor.py:191`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/python-server/app/etl/extract/extractor.py#L191)
  - Rollup Service: [`apps/backend/src/v1/rollup/service.ts:376`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/rollup/service.ts#L376)
- **Code Behavior:** Python ETL yields `clo_plo_mapping: []`. Backend rollup service constructs python `/analytics/summary` payload directly from `snapshot.clo_plo_mapping` without querying database table `CloToPloMap`.
- **Discrepancy / Impact:** Formula 7A PLO rollups return 0 mapped outcomes for all degree programs, completely halting the CHECK/ACT quality assurance pipeline.

### 5.5 Blocker 5: Duplicate Computation Runs on Class Record Re-Upload
- **Source Location:** [`apps/backend/src/v1/ingest/service.ts:221-236`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/ingest/service.ts#L221-L236)
- **Code Behavior:** When an instructor re-uploads a corrected Excel class record for the same section, `persistAttainment` executes `prisma.computationRun.create()` and appends a new set of `CloAttainment` rows without deleting, archiving, or superseding prior runs.
- **Discrepancy / Impact:** Orphaned computation runs accumulate in the database. CAR submissions bound to previous run IDs become desynchronized from the section's latest attainment data.

### 5.6 Blocker 6: CAR Part 1 Enrolled Count Always Zero
- **Source Locations:**
  - Loader: [`apps/backend/src/v1/car/service.ts:150`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/car/service.ts#L150)
  - Schema: [`apps/backend/prisma/schema/03-academic.prisma`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/prisma/schema/03-academic.prisma)
- **Code Behavior:** CAR Part 1 counts enrollment using `prisma.enrollment.count({ where: { classSectionId } })`. Across the entire backend and ETL ingest service, **there are zero write operations to the `Enrollment` table**.
- **Discrepancy / Impact:** CAR Part 1 displays:
  $$\text{No. Enrolled: } 0 \quad\Big|\quad \text{No. Completed: } 35$$
  This creates an obvious numerical contradiction on official accreditation documentation.

### 5.7 Blocker 7: CAR Part 2 Assessment Category Breakdown Always Null
- **Source Location:** [`apps/backend/src/v1/car/service.ts:467-488`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/src/v1/car/service.ts#L467-L488)
- **Code Behavior:** Part 2 rolls up mean percentages for `examPct`, `atPct`, `tlaPct`, and `outputPct`. In the official v2 AUN-OBE Excel template, assessment scores are reported as period totals without granular TLA/AT categorization. Python server returns `null` for these fields.
- **Discrepancy / Impact:** CAR Part 2 tables (Exams, Rubrics, Performance Tasks, Portfolio) render entirely as `null` / unpopulated values in both the API response and frontend UI.

---

## 6. Dashboard & Reporting Reality

### 6.1 Adaptive Role-Scoped Architecture
- **Implementation State:** The frontend operates a single adaptive entry point at `/dashboard` ([`apps/frontend/app/(app)/dashboard/page.tsx`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/frontend/app/(app)/dashboard/page.tsx)).
- **Role Routing:** Handled via registry `ROLE_DASHBOARDS` in [`apps/frontend/app/(app)/dashboard/role-dashboard.tsx`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/frontend/app/(app)/dashboard/role-dashboard.tsx):
  - `faculty`: Scoped to assigned `ClassSection` instances, recent raw data uploads, and CAR drafts.
  - `program_chair`: Scoped to program-wide attainment, curriculum target settings, and pending faculty submissions.
  - `dean`: Scoped to departmental approvals, budget line items, and PLO entity management.
  - `aqau`: Institution-wide QA audit view, cohort tracking overviews, and submission inboxes.
  - `vpaa`: Executive institutional dashboard with CAPA/budget endorsements and AI insight generation.
  - `system_admin`: Full administrative oversight, user role requests, and system-wide overrides.

### 6.2 Hardcoded Empty KPI Stat Cards (`stats = []`)
- **Code Reality:** In [`apps/frontend/app/(app)/dashboard/role-dashboard.tsx:87`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/frontend/app/(app)/dashboard/role-dashboard.tsx#L87):
  ```typescript
  export function RoleDashboard({ user }: { user: ApiUser }) {
    const config = ROLE_DASHBOARDS[user.role] ?? ROLE_DASHBOARDS.user;
    const Scope = config.component;
    const stats: StatCard[] = []; // <-- Hardcoded empty array across all roles
    
    return (
      <DashboardShell
        title={`${config.title} — ${roleLabel(user.role)}`}
        scopeLabel={config.scopeLabel ?? scopeLabelFor(user)}
        description={config.description}
        stats={stats}
      >
        <Scope />
      </DashboardShell>
    );
  }
  ```
- **User Impact:** No role receives high-level summary metrics (e.g., *Total Enrolled Students*, *Active At-Risk Flags*, *Pending Approval Count*, *Overall Program Attainment Rate*). The top stat banner renders empty on every dashboard.

### 6.3 Jotai Store & Empty Chart States
- **State Architecture:** Client state is managed with Jotai atoms under `apps/frontend/lib/store/atoms/`. Atoms utilize `atomWithAsyncData` and `fetchLatestPayload` to resolve data from backend list endpoints (`GET /rollup/*`, `GET /cqi/*`).
- **Data Rendering:** To avoid displaying fabricated numbers, sample mock constants were eradicated. Consequently, when an endpoint returns an unseeded or empty array, atoms resolve to `[]`.
- **Visual Impact:** Charts in EvilCharts / ECharts display clean, unpopulated empty states (*"No data available"*), awaiting completed end-to-end ingest and rollup runs.

### 6.4 Missing Report Export Engine
- **Documentation Demand:** Accrediting agencies (CHED, PACUCOA, AUN-QA) demand printable, signed physical documentation with institutional headers, exact form borders, and official signatures.
- **Codebase Reality:** Model `ReportExport` is defined in [`prisma/schema/09-reports.prisma`](file:///D:/Jetbrains_IDE_Projects/pycharm/Obelisk_FINAL/apps/backend/prisma/schema/09-reports.prisma) (`format` enum `pdf`, `excel`, `word`), but no PDF/Excel generation microservice (e.g., Puppeteer, WeasyPrint, or ExcelJS templating) has been developed. The export buttons in the UI are non-functional placeholders.

---

## 7. Executive Summary & Remediation Matrix

| Category | Finding | Severity | Direct Code Remedy |
| :--- | :--- | :---: | :--- |
| **Pipeline Bridge** | Empty `clo_plo_mapping` sent to python-server in F15 rollup. | **CRITICAL** | In `apps/backend/src/v1/rollup/service.ts:376`, query `prisma.cloToPloMap` by course/program and inject real mappings into the python payload. |
| **Database Safety** | `seed.ts` wipes database without checking environment. | **CRITICAL** | In `apps/backend/prisma/seed.ts`, wrap cleanup in `if (process.env.NODE_ENV === 'production') throw new Error(...)`. |
| **Frontend/Backend Sync** | CAR Save calls `POST /car/:id` instead of `PUT`. | **HIGH** | In `apps/frontend/server/actions/car.ts:50`, change `actionApi.post` to `actionApi.put`. |
| **Frontend/Backend Sync** | Curriculum Map calls `POST /plan/curriculum-map/:id` instead of `PUT`. | **HIGH** | In `apps/frontend/server/actions/plan.ts:69`, change `actionApi.post` to `actionApi.put`. |
| **Academic Ledger** | CAR Part 1 `noEnrolled` counts empty `Enrollment` table. | **HIGH** | In `apps/backend/src/v1/ingest/service.ts`, upsert `Enrollment` rows during class record persistence, or count distinct students in `CloAttainment`. |
| **Accreditation Workflow** | Missing At-Risk Student Action-Taken / Remediation workflow. | **HIGH** | Add `status`, `remediationNotes`, `actionTakenAt` to `AtRiskFlag` schema; create remediation form and API endpoint. |
| **Ingest Stability** | Class record re-upload appends duplicate `ComputationRun` records. | **MEDIUM** | In `apps/backend/src/v1/ingest/service.ts`, mark prior runs superseded or delete prior unapproved run attainments. |
| **Executive UI** | Dashboard KPI stats banner hardcoded empty (`stats = []`). | **MEDIUM** | Wire role dashboard shell to aggregate queries (count of pending approvals, active at-risk students, average attainment). |
| **Institutional UI** | 7 Periodic/ACT form screens (F02, F09, F20, F21, F26, F27, F28) unbuilt. | **MEDIUM** | Build frontend route pages in Next.js connecting to the already-complete `/api/v1/periodic` backend routes. |
| **Compliance Output** | Report Export (PDF/Excel) engine unbuilt. | **LOW** | Implement server-side document rendering service targeting JMCFI official form formats. |
