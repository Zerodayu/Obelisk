# OBELISK: System Synchronization, Architecture Audit & Development Roadmap

> **Auditor Notice, Architecture Audit & Development Ledger**  
> **Evaluation Mode:** Read-Only Systems Cross-Examination & Unified Engineering Roadmap  
> **Project Scope:** Jose Maria College Foundation, Inc. (JMCFI) — Outcomes-Based Educational Learning and Intelligent System Kit (OBELISK)  
> **Target Pilot:** College of Information Technology Education (CITE) — BS Information Technology (BSIT) Program, Section 1A Pilot  
> **Document Purpose:** Single consolidated source of truth unifying the institutional OBE documentation cross-examination (37 forms, 8-level hierarchy, assessment formulas) with the codebase implementation status, phased roadmap (Phases 0–7), service readiness, and active backlog.  
> **Last verified:** 2026-09-30 against HEAD `d9ddeb8`, the §9 live-run results in [`testing_results.md`](testing_results.md), and [`roadmap.md`](roadmap.md).

---

## 1. Architectural & Methodological Alignment

### 1.1 Scope Limitation Agreement & Pilot Parameterization
- **Institutional Documentation:** The institutional manual (*JMCFI WIN-OBE Forms Digitization Reference Guide*) designs the OBE framework for campus-wide adoption across all academic divisions (CITE, CAS, CBA, CED, etc.), mandating 37 distinct forms, university-wide committee reviews, and longitudinal cohort tracking across all degree programs.
- **System Reality:** The system has formally pivoted to an isolated pilot configuration:
  - Program scope is locked to **CITE / BS Information Technology (`BSIT`)**.
  - Section enrollment and database seeding target a single class section (`clv92a9f1000108l3d26b52b3` — BSIT Section 1A, Course `IT 101`, hardcoded as `TARGET_CLASS_SECTION_ID` in [`apps/backend/prisma/seed.ts:86`](../apps/backend/prisma/seed.ts)).
  - Cross-department routing, multi-program comparative dashboards, and non-CITE grading templates (e.g., Practicum, Clinical, and Research-only course types) are rejected or unpopulated in data.
- **Audit Verdict:** **Aligned with Scope Limitation Agreement.** The system reflects the authorized pilot boundary, though broader institutional deployment remains unsupported in the current schema state.

### 1.2 Program Educational Objectives (PEO) Deferral
- **Institutional Documentation:** Chapter 1 and the Digitization Reference dictate an unbroken 8-level outcomes hierarchy:
  $$\text{Institutional Mission/Vision} \longrightarrow \text{Core Values} \longrightarrow \text{Institutional Outcomes (IO)} \longrightarrow \text{PEOs} \longrightarrow \text{PLOs} \longrightarrow \text{CLOs} \longrightarrow \text{TLA/AT} \longrightarrow \text{Rubric Scoring}$$
  Attainment of PEOs must be assessed biennially (3–5 years post-graduation) through Alumni Tracer Studies (F20) and Employer Satisfaction Surveys (F21).
- **System Reality:**
  - Prisma schema defines `Peo` ([`prisma/schema/04-outcomes.prisma:36`](../apps/backend/prisma/schema/04-outcomes.prisma)), `PloToPeoMap` ([`04-outcomes.prisma:63`](../apps/backend/prisma/schema/04-outcomes.prisma)), and `PeoAttainment` ([`prisma/schema/07-attainment.prisma:96`](../apps/backend/prisma/schema/07-attainment.prisma), unique `[peoId, termId]` with `evidenceJson`).
  - Dedicated backend endpoints exist behind `/api/v1/periodic/alumni-tracer` and `/api/v1/periodic/employer-survey` ([`src/v1/periodic/controller.ts`](../apps/backend/src/v1/periodic/controller.ts)).
  - **Pipeline Severance:** No automated computational rollup connects F20/F21 survey data to `PeoAttainment` — zero references to `peoAttainment` exist in `apps/backend/src/**` or `apps/python-server/app/**` outside tests. The graduation-cluster archival pipeline explicitly defers execution: *"Sequenced after PEO attainment capture… a cluster must not be compiled until its PEO evidence exists"* ([`apps/backend/SYSTEM-DESIGN.md:89`](../apps/backend/SYSTEM-DESIGN.md)).
  - Frontend interfaces for F20 and F21 are completely unbuilt, and the PEO attainment dashboard atoms are still empty mocks ([`apps/frontend/lib/store/atoms/attainments.ts:157-163`](../apps/frontend/lib/store/atoms/attainments.ts)).
- **Audit Verdict:** **Deferred per Scope Agreement.** PEO attainment capture is structurally stubbed in the database but functionally inoperative in the application runtime.

### 1.3 Baseline Methodology & Weighting Policies
- **Institutional Benchmark Floor:**
  - Documentation establishes a fixed threshold: $\ge 70.0\%$ attainment across all Course Learning Outcomes (CLOs) and Program Learning Outcomes (PLOs).
  - Codebase strictly enforces this floor: `MIN_ATTAINMENT_PCT = 70` is exported from [`apps/backend/lib/validators/attainment.ts:1`](../apps/backend/lib/validators/attainment.ts) and imported by the target-setting matrix ([`src/v1/plan/compute.ts:2`](../apps/backend/src/v1/plan/compute.ts)), CQI, CAR, and rollup compute modules. On the Python side the equivalent lives as `Transformation.INSTITUTIONAL_THRESHOLD = 0.70` in [`apps/python-server/app/etl/etl_const.py:167`](../apps/python-server/app/etl/etl_const.py) (there is no `MIN_ATTAINMENT_PCT` symbol in Python). Setting targets below 70% throws `TargetBelowFloorError` ([`src/v1/plan/compute.ts:11-17`](../apps/backend/src/v1/plan/compute.ts)), mapped to **HTTP 409** by [`src/v1/plan/controller.ts:74-81`](../apps/backend/src/v1/plan/controller.ts).
- **Direct vs. Indirect Attainment Weighting:**
  - Manual §3.5.13 establishes a composite attainment model:
    $$\text{Composite Attainment} = (0.70 \times \text{Direct Assessment}) + (0.30 \times \text{Indirect Assessment})$$
  - In `ComputationRun` ([`prisma/schema/07-attainment.prisma:5-7`](../apps/backend/prisma/schema/07-attainment.prisma)), fields `directWeight = 0.70` and `indirectWeight = 0.30` are defaulted with `formulaVersion = "70_30_v1"` (persisted paths hard-code the same 0.7/0.3 in `src/v1/ingest/service.ts:227-228` and `src/v1/rollup/service.ts:505-506`).
  - In execution, wide-format CSV score re-imports and single-sheet class records only populate direct scores; when indirect exit ratings are null, the pipeline defaults `compositeScorePct` to 100% direct score without flagging data incompleteness — ETL persist sets `indirectScorePct: null, compositeScorePct: directScore` ([`src/v1/ingest/service.ts:296-304`](../apps/backend/src/v1/ingest/service.ts)) and the edit/re-import path mirrors direct in [`lib/ingest/score-edit.ts:8-22`](../apps/backend/lib/ingest/score-edit.ts). (The shared helper `compositeScorePct(direct, indirect = 0)` in `lib/validators/attainment.ts:31-33` applies the true 70/30 formula but is currently referenced only by unit tests, not by any persist path.)
- **Audit Verdict:** **Partially Synchronized.** The 70% threshold is rigidly guarded. The 70/30 composite calculation exists in schema and pure functions, but downstream workflows predominantly execute in direct-only mode.

### 1.4 Gemini AI Strategic Advisory Role & Safety Guardrails
- **Institutional & Policy Mandate:** AI-driven analytics must operate in a strictly advisory capacity. Generative models must never:
  1. Alter grades or attainment metrics autonomously.
  2. Write directly to primary academic or student tables.
  3. Bypass faculty or administrative approval chains.
  4. Expose Personally Identifiable Information (PII) to external model providers.
  5. Route institutional recommendations to unauthorized roles.
- **Codebase Implementation:**
  - **Role Guard:** Endpoint `POST /api/v1/ai/recommendation/generate` is gated via `assertCanGenerateAiInsights` ([`apps/backend/lib/role-access.ts:38,89-94`](../apps/backend/lib/role-access.ts)): `generateAiInsights: ["vpaa", "system_admin"]`, asserted in [`src/v1/ai/controller.ts:79`](../apps/backend/src/v1/ai/controller.ts) before any DB/python call (403 mapping at `:27-29`). Live-verified (`testing_results.md` 9.5): faculty, program_chair, dean, and aqau each received 403; vpaa and system_admin received 200. Note `GET /ai/recommendation/latest` remains open to every authenticated role — only *generation* is restricted.
  - **PII Scrubbing:** Before prompt compilation, `institutional_summary.py` calls `anonymize_students` on every submission's attainments ([`apps/python-server/app/analytics/institutional_summary.py:171-172`](../apps/python-server/app/analytics/institutional_summary.py)); the scrub implementation lives in [`cqi_recommender.py:71-86`](../apps/python-server/app/analytics/cqi_recommender.py), replacing student IDs and names with anonymized tokens (`Student A`, `Student B`) and nulling `student_id`. **Standing caveat:** raw `student_name` still travels in the request body from backend to python-server ([`src/v1/ai/compute.ts`](../apps/backend/src/v1/ai/compute.ts)) and is anonymized only inside Python — names cross the process boundary but never reach the prompt (verified against the stored `promptUsed` in `testing_results.md` 9.4).
  - **Database Isolation:** Recommendations write exclusively to table `AiRecommendation` ([`prisma/schema/08-monitoring.prisma`](../apps/backend/prisma/schema/08-monitoring.prisma)) with `status = "pending_review"` — the only write in `src/v1/ai/service.ts` is `aiRecommendation.create` (`:219`). No write pathways exist from the AI service to `StudentScore`, `CloAttainment`, or `PloAttainment`.
  - **Request-Body Fix:** The generate action previously posted no body against a required `t.Object` route — a guaranteed 422. [`apps/frontend/server/actions/ai.ts:70-75`](../apps/frontend/server/actions/ai.ts) now posts `{}`, keeping `termId` optional (live-verified 200, `testing_results.md` 9.4).
  - **Offline/Debug Mode:** `IS_DEBUG_MODE: bool = True` remains the default in [`cqi_recommender.py:14`](../apps/python-server/app/analytics/cqi_recommender.py) (restored by commit `4103a8b`), so responses are deterministic placeholders gated at `:120-126` — no external API reliance in the current configuration.
  - **Live-LLM Readiness (built, gated off):** A multi-key failover pool exists in [`apps/python-server/app/core/config.py:57-131`](../apps/python-server/app/core/config.py) — `LLM_API_KEY` / `LLM_API_KEYS` (env `OBELISK_LLM_API_KEY` / `OBELISK_LLM_API_KEYS`), default `LLM_MODEL = "gemini-3.6-flash"`, ordered + deduped key list — with a per-key rotation loop in `cqi_recommender.py:128-186`. It is currently unreachable because `IS_DEBUG_MODE` is `True` and no key is set.
- **Audit Verdict:** **Fully Synchronized & Guarded.** System boundaries and data privacy controls for AI integration comply strictly with policy; the two standing caveats (placeholder mode, process-boundary name crossing) are tracked in §8.

---

## 2. Computational Pipeline (Python ETL & Backend)

### 2.1 Formula 1A: Direct CLO Attainment (Per-Student Independent Recomputation)
- **Mathematical Specification:**
  $$\text{direct\_clo\_attainment\_pct} = \frac{\text{Prelim Score} + \text{Midterm Score} + \text{Final Score}}{\text{Prelim Max} + \text{Midterm Max} + \text{Final Max}} \times 100$$
- **Code Execution:** Formula 1A is computed independently in `_compute_direct_clo_attainment` ([`apps/python-server/app/etl/transform/transformer.py:222-230`](../apps/python-server/app/etl/transform/transformer.py)) — Σ raw scores ÷ Σ max scores — followed by 4-tier level assignment (`:233-243`) and formula version stamp `direct_attainment_v2_aunobe` ([`etl_const.py:172`](../apps/python-server/app/etl/etl_const.py)). The workbook itself is opened with `openpyxl` in the extract stage ([`app/etl/extract/extractor.py:6-8`](../apps/python-server/app/etl/extract/extractor.py)); the transformer never touches Excel and the workbook's internal formulas are ignored.
- **Rule 1 Evaluation:** The transformer verifies that scores exist across all three terms (Prelim, Midterm, Final). If any are null, `is_record_complete` is flagged `False` ([`transformer.py:41`](../apps/python-server/app/etl/transform/transformer.py)). Section completeness is verified against a 60% threshold (`Transformation.COMPLETENESS_THRESHOLD = 0.60`, [`etl_const.py:168`](../apps/python-server/app/etl/etl_const.py); `rule1_met = section_completeness_pct >= 0.60`).
- **Audit Verdict:** **Fully Synchronized.** Computation is mathematically rigorous and independent.

### 2.2 Formula 1B: Indirect CLO Attainment
- **Mathematical Specification:**
  $$\text{indirect\_clo\_attainment\_pct} = \left(\frac{\text{Likert Rating (1–5)}}{5.0}\right) \times 100$$
- **Code Execution:** Implemented in [`apps/python-server/app/etl/transform/transformer.py:58-61`](../apps/python-server/app/etl/transform/transformer.py): `indirect_rating` is converted to percentage points when non-null, otherwise persisted as `None` (no fabrication).
- **Audit Verdict:** **Fully Synchronized.** Correctly converted to percentage points (e.g., Rating 4 $\rightarrow$ 80.0%).

### 2.3 Formula 7A & 7C: PLO Rollup — The Mapping Bridge `[RESOLVED 2026-09-29]`
- **Mathematical Specification (Formula 7A):**
  $$\text{PLO Attainment} = \frac{\sum \text{Mean Attainment of Mapped CLOs}}{\text{Total Number of Mapped CLOs}}$$
- **Code Implementation (Python Server):** Implemented in [`apps/python-server/app/analytics/institutional_summary.py`](../apps/python-server/app/analytics/institutional_summary.py). Correctly averages mapped CLO attainments.
- **Historical Defect (for the record):** The extractor permanently retired reading CLO-PLO mappings from Excel workbooks ([`extractor.py:191-192`](../apps/python-server/app/etl/extract/extractor.py): `clo_plo_mapping: list[dict[str, Any]] = []`), and `PloSummaryService` originally built the python `/analytics/summary` payload straight from that snapshot — so `submissions[n].clo_plo_mapping` was always `[]`, Python found 0 mapped CLOs for every PLO, and no `PloAttainment` rows were ever written.
- **Resolution Record:**
  1. `PloSummaryService.loadCloPloMapping(programId)` ([`src/v1/rollup/service.ts:545-562`](../apps/backend/src/v1/rollup/service.ts)) queries `prisma.cloToPloMap` scoped to the program on both the CLO and PLO side, shaped `{clo_code, plo_code, correlation_strength}` from `weight`; injected at `:359` and merged with snapshot fallback at `:380-384` ("DB mappings win; the snapshot copy is a legacy fallback").
  2. The duplicated AI path received the same injection: [`src/v1/ai/service.ts:125-150,176-178`](../apps/backend/src/v1/ai/service.ts) loads DB mappings per program, and [`src/v1/ai/compute.ts:15-20,44-46`](../apps/backend/src/v1/ai/compute.ts) prefers `meta.cloPloMapping` over the always-empty snapshot.
  3. The extractor's `[]` remains **by design** as a dead legacy field — every consumer now prefers DB rows.
- **Verification:** Live run 2026-09-29 (`testing_results.md` 9.1/9.2): 5 `POST /plan/clo-plo-map` → dean generates PLO summary → **5 `PloAttainment` rows persisted** (PLO1 81.3%, PLO2 77.98%, PLO3 84.67%, PLO4 79.33%, PLO5 82.53%); deleting a mapping drops its PLO without a crash. Regressions: `rollup.test.ts` asserts the DB mapping wins over the snapshot copy; `ai.compute.test.ts` covers `meta.cloPloMapping` precedence.
- **Audit Verdict:** **RESOLVED — Synchronized.** End-to-end PLO attainment generation now works; the CHECK/ACT compliance pipeline is unblocked.

### 2.4 Longitudinal & CQI Evaluation Logic
- **Cohort Tracking (F16):** Pure function `buildCohortLines` ([`apps/backend/src/v1/rollup/compute.ts:82`](../apps/backend/src/v1/rollup/compute.ts)) computes trends ($\uparrow, \downarrow, \rightarrow$) across consecutive terms and flags CQI triggers when any latest-term CLO is $< 70\%$.
- **Closing-the-Loop Evaluation (F25):** Function `computeLoopStatus` ([`apps/backend/src/v1/cqi/compute.ts:146`](../apps/backend/src/v1/cqi/compute.ts)) hard-computes `LoopStatus`:
  - `closed`: Only if all 5 condition booleans are `True` AND `interventionImplemented === "yes"`.
  - `open_not_implemented`: If `interventionImplemented === "no"` or narrative is blank.
  - `open_reassess`: All other partial states.
- **Audit Verdict:** **Fully Synchronized.** The 5-condition validation and non-editable computed status match institutional compliance rules.

---

## 3. Workflow & Approval Chain Validation

### 3.1 Canonical Approval Hierarchy vs. Implemented Approval Routes
The institutional manual specifies a 5-tier institutional hierarchy:
$$\text{Faculty (Preparer)} \longrightarrow \text{Program Chair} \longrightarrow \text{Dean} \longrightarrow \text{AQAU} \longrightarrow \text{VPAA}$$

The codebase establishes approval routing via [`apps/backend/lib/forms/approval-routes.ts`](../apps/backend/lib/forms/approval-routes.ts) and [`state-machine.ts`](../apps/backend/lib/forms/state-machine.ts). The registry now holds **29 form codes**; PDCA stage and sequence numbers are assigned separately by each module's `ensure*FormType` (not by the registry). Cross-examination against the manual:

| Form Code & Title | Documented Approval Chain | Codebase Registered Chain (`approval-routes.ts`) | Preparer Roles in Code | Discrepancy Analysis |
| :--- | :--- | :--- | :--- | :--- |
| `curriculum_map` (F01) | Chair $\to$ Comm $\to$ AQAU | `['aqau']` | `program_chair`, `faculty` | Skips Dean; Committee omitted (offline). |
| `portfolio_roadmap` (F02) | Chair $\to$ Dean $\to$ AQAU | `['dean', 'aqau']` | `program_chair`, `faculty` | Synchronized. |
| `assessment_calendar` (F03) | Chair $\to$ Dean $\to$ AQAU | `['dean', 'aqau']` | `program_chair` | Synchronized. |
| `target_setting_matrix` (F04) | Chair/Dean $\to$ AQAU | `['aqau']` | `program_chair`, `dean` | Synchronized. |
| `stakeholder_consultation` (F05) | Chair $\to$ Dean | `['program_chair']` | `program_chair`, `faculty`, `dean` | Registry-only: no FormType, no service, no UI. |
| `assessment_budget` (F06) | Dean $\to$ VPAA (copy AQAU) | `['vpaa']` | `dean` | AQAU informational copy collapsed out. |
| `clo_raw_data` (F07) | Faculty $\to$ Chair | `['program_chair']` | `faculty`, `program_chair` | Chair permitted to prepare on behalf of program; no FormType row created in production code. |
| `mid_cycle_attainment` (F08)| Faculty $\to$ Chair | `['program_chair']` | `faculty` | Synchronized. |
| `resource_monitoring` (F09) | Dean/Chair $\to$ VPAA | `['vpaa']` | `dean`, `program_chair` | Synchronized. |
| `peer_observation` (F10) | Chair $\to$ Chair (self) | `['program_chair']` | `program_chair`, `faculty` | Same-role chain; no self-approval rule enforced. |
| `exhibition_feedback` (F11) | Chair $\to$ Chair | `['program_chair']` | `program_chair`, `faculty` | Synchronized. |
| `clo_perception_survey` (F12) | Chair $\to$ Chair | `['program_chair']` | `program_chair`, `faculty` | Synchronized. |
| `course_assessment_report` (CAR)| Faculty $\to$ Chair $\to$ AQAU | `['program_chair', 'dean', 'aqau']` | `faculty` | Injects `dean` step not specified in F13 header. |
| `clo_attainment_summary` (F14)| Faculty $\to$ Chair | `['program_chair']` | `faculty` | Synchronized. |
| `plo_attainment_summary` (F15)| Chair $\to$ Dean $\to$ AQAU | `['dean', 'aqau']` | `program_chair` | Synchronized. |
| `cohort_tracking` (F16) | Chair $\to$ AQAU | `['aqau']` | `program_chair` | Synchronized. |
| `student_exit_survey` (F17) | Chair $\to$ Chair | `['program_chair']` | `program_chair`, `faculty` | Synchronized. |
| `portfolio_assessment_record` (F18)| Chair $\to$ AQAU | `['aqau']` | `faculty`, `program_chair` | Synchronized. |
| `capstone_panel_evaluation` (F19)| Chair $\to$ AQAU | `['program_chair', 'aqau']` | `faculty`, `program_chair` | Synchronized. |
| `alumni_tracer` (F20) | Chair $\to$ Dean | `['program_chair', 'dean']` | `program_chair`, `faculty` | Synchronized (code: `alumni_tracer`). |
| `employer_satisfaction_survey` (F21) | Chair $\to$ Dean | `['program_chair', 'dean']` | `program_chair`, `faculty` | Synchronized (code is **not** `employer_survey`). |
| `plo_gap_analysis` (F22) | Chair $\to$ Dean | `['dean']` | `program_chair` | Synchronized. |
| `cqi_action_plan` (F23) | Chair $\to$ Dean $\to$ AQAU | `['dean', 'aqau']` | `program_chair` | Synchronized. |
| `annual_program_report` (F24) | Chair $\to$ Dean $\to$ VPAA | `['dean', 'vpaa']` | `program_chair` | Synchronized (Due June 30). |
| `closing_the_loop` (F25) | Chair $\to$ AQAU | `['aqau']` | `program_chair` | Synchronized. |
| `systemic_gap_report` (F26) | Dean $\to$ PAC + VPAA | `['vpaa']` | `dean` | PAC omitted (offline body); AQAU copy collapsed. |
| `capa_plan` (F27) | Dean/VPAA $\to$ AQAU | `['aqau']` | `dean`, `vpaa` | Synchronized. |
| `institutional_review` (F28) | VPAA/QA $\to$ President | `['vpaa']` | `aqau`, `vpaa` | President role mapped to VPAA in code. |
| `action_taken` (seq 35) | *Not in manual* (client requirement) | `['program_chair']` | `faculty`, `program_chair` | New: at-risk intervention record (§3.2). |

- **Critical Hierarchy Reality:**
  1. **Faculty is Never an Approver:** In code, `faculty` is categorized strictly as a preparer. No workflow route permits faculty to approve any document.
  2. **Zero Forms Implement the Full 4-Step Approver Chain:** Not a single institutional form routes through all 4 approver roles (`program_chair` $\to$ `dean` $\to$ `aqau` $\to$ `vpaa`). The longest registered chain is 3 steps (`course_assessment_report`: chair $\to$ dean $\to$ aqau); several forms terminate at `vpaa` but never traverse the full path. The full chain exists solely as an uninvoked `DEFAULT_APPROVAL_ROUTE` fallback (`approval-routes.ts:224-227`). Live-verified in `testing_results.md` 9.6.
  3. **VPAA Archive Monopoly:** Archiving approved forms is restricted to `vpaa` and `system_admin` (`FEATURE_ACCESS.archive`, [`apps/backend/lib/role-access.ts:21`](../apps/backend/lib/role-access.ts)). AQAU can approve institutional quality filings but cannot archive them.

### 3.2 At-Risk Remediation / Action-Taken Workflow `[IMPLEMENTED 2026-09-30]`
- **Institutional Requirement:** Manual §3.5.8 mandates that any student failing to meet the 70% CLO threshold must be placed on an At-Risk Watchlist, requiring the course instructor to submit an official **Action-Taken / Remediation Record** detailing tutoring, re-assessment, or academic counseling before the flag can be resolved.
- **Design Decision (differs from the original recommendation):** The workflow was built **without schema changes**. `AtRiskFlag` ([`prisma/schema/08-monitoring.prisma:17-28`](../apps/backend/prisma/schema/08-monitoring.prisma)) is unchanged — no `status`, `actionTaken`, `resolvedAt`, or `resolvedBy` fields:
  ```prisma
  model AtRiskFlag {
    id              String   @id
    studentId       String   @map("student_id")
    cloAttainmentId String?  @map("clo_attainment_id")
    reason          String
    flaggedAt       DateTime @default(now()) @map("flagged_at")
  }
  ```
  Instead, remediation state lives in `FormSubmission.formData`, and resolution = flag **deletion inside the approval transaction**.
- **Implementation:**
  - **Form type:** `action_taken` — "Action-Taken Record (At-Risk Students)", PDCA stage ACT, sequence 35, registered in `APPROVAL_ROUTES` (preparers `faculty`/`program_chair`, chain `['program_chair']`) and mirrored in the frontend `FORM_ACCESS` (drift-guarded by `test/unit/role-access-sync.test.ts`).
  - **Endpoints** ([`src/v1/atrisk/controller.ts`](../apps/backend/src/v1/atrisk/controller.ts), mounted at `/api/v1/atrisk`): `GET /flags` (watchlist, optionally scoped by `classSectionId`, role-gated by `assertCanCaptureClassRecords`, deliberately **not** `cached()` — the 60s TTL served a stale watchlist during the live run); `POST /action/init` (opens/reuses a draft, term/program resolved server-side); `GET /action/:id`; `PUT /action/:id` (owner + draft/returned only).
  - **Submit gate** (registered from [`src/v1/atrisk/service.ts:206-222`](../apps/backend/src/v1/atrisk/service.ts)): rejects empty `studentIds` and blank/whitespace `actionTaken`.
  - **Clear-on-final-approval effect** ([`lib/forms/approval-effects.ts`](../apps/backend/lib/forms/approval-effects.ts)): runs **inside the same transaction** that flips the submission to `approved` (invoked from `src/v1/forms/service.ts:272-285`), deleting `AtRiskFlag` rows for the selected students scoped to the form's `classSectionId`; returns `{ flagsCleared }` merged into the audit entry. A crash can never leave a "cleared without approval" or "approved but not cleared" state.
  - **Frontend:** page [`/forms/cqi/action-taken`](../apps/frontend/app/(app)/forms/cqi/action-taken/page.tsx) with [`action-taken-form.tsx`](../apps/frontend/components/forms/action-taken-form.tsx) (section picker → grouped watchlist → `FormWorkflow` bar), server actions in [`server/actions/at-risk.ts`](../apps/frontend/server/actions/at-risk.ts), nav entry "Action Taken (At-Risk)" under CQI & Loop (`config/navigation.ts:144-149`).
  - **Tests:** `test/integration/atrisk.test.ts` — 5 tests covering section scoping, idempotent init, the submit gate, return-doesn't-clear + clear scoping, and wrong-form-doesn't-clear.
- **Live Verification (2026-09-30, `testing_results.md` 9.9):** fresh seed + template upload → **34 `AtRiskFlag` rows**; faculty init/save/submit → flags still 34; program_chair return → still 34; final approval → **34 → 25**, audit `flagsCleared: 9` (only the 3 selected students' flags in `1A` deleted, other students and other sections untouched).
- **Residual Findings:**
  - The score-edit/re-import reconciliation path still **deletes** flags when a composite crosses $\ge 70\%$ and **re-creates** them when it falls below ([`src/v1/ingest/service.ts:441,606`](../apps/backend/src/v1/ingest/service.ts) via [`lib/ingest/score-edit.ts:34-42`](../apps/backend/lib/ingest/score-edit.ts)) — so a later score edit can resurrect a flag an approval cleared. This is now a secondary reconciliation path rather than the only deletion path; the original "falsification dilemma" (tamper with grades to clear a flag) is no longer the *only* way, but historical score edits remain able to mutate the watchlist.
  - CAR Part 4 still derives its at-risk count from `row.isBelowThreshold` ([`src/v1/car/service.ts:421,555`](../apps/backend/src/v1/car/service.ts)), not from live `AtRiskFlag` rows — clearing flags does not change the CAR count.
  - The dashboard donut `atRiskDataAtom` is still `atomWithMockData([])` ([`lib/store/atoms/governance.ts:63-67`](../apps/frontend/lib/store/atoms/governance.ts)) despite `GET /atrisk/flags` now existing (agreed scope).
- **Audit Verdict:** **SYNCHRONIZED (with residual caveats).** The remediation workflow mandated by OBE accreditation and requested by the client now exists end-to-end and is transactionally safe; the three residual items above are tracked in §8.

---

## 4. Phase-by-Phase Digitization & Development Ledger (Phases 0 – 7)

**Build Strategy:** Backend-First. All backend models, validators, service routes, and approval routing are completed before UI form screens.

### 4.1 Phase 0 — Backend Foundation & Stabilization `[COMPLETED]`
- [x] Prisma Schema (Auth, Academic, Outcomes, Assessment, Forms, Attainment, Monitoring, Reports, Archive) — now 14 modular files under [`apps/backend/prisma/schema/`](../apps/backend/prisma/schema).
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
- [x] Section verification: workbook-vs-selected-section binding with structured errors (`MissingWorksheet`, `UnsupportedCourseType`) surfaced through the job API.

### 4.3 Phase 2 — Course Assessment Report (`course_assessment_report` / F13) `[PARTIALLY BLOCKED]`
- [x] Backend CAR Service: 7-part CAR assembly in `src/v1/car/` (`compute.ts`, `service.ts`, `controller.ts`).
- [x] Attainment Aggregation: Auto-populates Part 3 (CLO summaries) and Part 4 (at-risk watchlist) directly from stored database rows.
- [x] Part 2 category breakdown: `buildPart2` computes exam/rubric/perf-task/portfolio means from real `CloAttainment` category columns ([`src/v1/car/service.ts:467-489`](../apps/backend/src/v1/car/service.ts)).
- [x] Frontend UI: Tabbed 7-part interface in `/forms/course-assessment-report`.
- [ ] **Active Blockers:**
  - HTTP method mismatch on save: Frontend POSTs to `/car/:id`, backend listens on PUT (Section 7.2).
  - Part 1 Enrolled count is hardcoded to 0 because `Enrollment` table is never populated (Section 7.6).
  - Part 2 renders dashes for the current template: the ETL emits NULL category columns for the AUN-OBE template, and the empty-state is unreachable because `buildPart2` always emits one row per CLO (Section 7.7).

### 4.4 Phase 3 — Roll-up Chain (F14, F15, F16) `[COMPLETED]`
- [x] Backend `clo_attainment_summary` (F14): Term-level CLO attainment by cohort.
- [x] Backend `plo_attainment_summary` (F15): DB `CloToPloMap` injection into the Python payload, persisted to `PloAttainment` — **bridge fixed 2026-09-29 and verified live** (5 rows; Section 2.3 / Section 7.4).
- [x] Backend `cohort_tracking` (F16): Longitudinal tracking with permanent audit trails and CQI trigger flags.
- [x] Frontend UI: Screens built for F14, F15, and F16 under `/forms/attainment/`.

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
- **Client-Requirement Instrument:**
  - [x] `action_taken` (At-Risk Action-Taken Record): backend `/api/v1/atrisk/*`, frontend `/forms/cqi/action-taken`, approval effect clearing flags on final approval (§3.2).

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
| **F05** | Stakeholder Consultation | PLAN | None (registry entry `stakeholder_consultation` only) | **MISSING** (No UI route) | `['program_chair']` | **Registry-Only** (no FormType, service, or store) |
| **F06** | Approved Assessment Budget | PLAN | `AssessmentBudgetService`<br>`/api/v1/plan/assessment-budget` | `/forms/plan/assessment-budget` | `['vpaa']` | **Fully Implemented** |
| **F07** | Per-Student CLO Raw Data Sheet | DO | `IngestService`<br>`/api/v1/ingest/upload` | `/forms/clo-raw-data` | `['program_chair']` | **Fully Implemented** (no FormType row; data-capture route) |
| **F08** | Mid-Cycle CLO Attainment | DO | `MidCycleAttainmentService`<br>`/api/v1/check/mid-cycle-attainment` | `/forms/check/mid-cycle-attainment` | `['program_chair']` | **Fully Implemented** |
| **F09** | Resource Monitoring | DO | `ResourceMonitoringService`<br>`/api/v1/periodic/resource-monitoring` | **MISSING** (No UI route) | `['vpaa']` | **Backend-Only** |
| **F10** | Peer Observation Record | DO | `PeerObservationService`<br>`/api/v1/check/peer-observation` | `/forms/check/peer-observation` | `['program_chair']` | **Fully Implemented** |
| **F11** | Exhibition Industry Feedback | DO | `ExhibitionFeedbackService`<br>`/api/v1/check/exhibition-feedback` | `/forms/check/exhibition-feedback` | `['program_chair']` | **Fully Implemented** |
| **F12** | CLO Perception Survey | DO | `CloPerceptionSurveyService`<br>`/api/v1/check/clo-perception-survey` | `/forms/check/clo-perception-survey` | `['program_chair']` | **Fully Implemented** |
| **F13** | Course Assessment Report (CAR) | CHECK | `CarService`<br>`/api/v1/car` | `/forms/course-assessment-report` | `['program_chair', 'dean', 'aqau']` | **Partially Blocked** (Save verb, Enrolled=0; P2 dashes for this template) |
| **F14** | CLO Attainment Summary | CHECK | `CloSummaryService`<br>`/api/v1/rollup/clo-attainment-summary` | `/forms/attainment/clo-attainment-summary` | `['program_chair']` | **Fully Implemented** |
| **F15** | PLO Attainment Summary | CHECK | `PloSummaryService`<br>`/api/v1/rollup/plo-attainment-summary` | `/forms/attainment/plo-attainment-summary` | `['dean', 'aqau']` | **Fully Implemented** (mapping bridge fixed 2026-09-29, live-verified) |
| **F16** | Cohort Tracking Sheet | CHECK | `CohortTrackingService`<br>`/api/v1/rollup/cohort-tracking` | `/forms/attainment/cohort-tracking` | `['aqau']` | **Fully Implemented** |
| **F17** | Student Exit Survey Tabulation | CHECK | `StudentExitSurveyService`<br>`/api/v1/check/student-exit-survey` | `/forms/check/student-exit-survey` | `['program_chair']` | **Fully Implemented** |
| **F18** | Portfolio Assessment Record | CHECK | `PortfolioAssessmentService`<br>`/api/v1/check/portfolio-assessment` | `/forms/check/portfolio-assessment` | `['aqau']` | **Fully Implemented** (code: `portfolio_assessment_record`) |
| **F19** | Capstone Panel Evaluation | CHECK | `CapstonePanelEvaluationService`<br>`/api/v1/check/capstone-panel` | `/forms/check/capstone-panel` | `['program_chair', 'aqau']` | **Fully Implemented** |
| **F20** | Alumni Tracer Study Report | CHECK | `AlumniTracerService`<br>`/api/v1/periodic/alumni-tracer` | **MISSING** (No UI route) | `['program_chair', 'dean']` | **Deferred per Scope** |
| **F21** | Employer Satisfaction Survey | CHECK | `EmployerSurveyService`<br>`/api/v1/periodic/employer-survey` | **MISSING** (No UI route) | `['program_chair', 'dean']` | **Deferred per Scope** (code: `employer_satisfaction_survey`) |
| **F22** | PLO Gap Analysis Report | ACT | `PloGapAnalysisService`<br>`/api/v1/cqi/plo-gap-analysis` | `/forms/cqi/plo-gap-analysis` | `['dean']` | **Fully Implemented** |
| **F23** | CQI Action Plan | ACT | `CqiActionPlanService`<br>`/api/v1/cqi/cqi-action-plan` | `/forms/cqi/cqi-action-plan` | `['dean', 'aqau']` | **Fully Implemented** |
| **F24** | Annual Program Report (APAR) | ACT | `AnnualProgramReportService`<br>`/api/v1/cqi/annual-program-report` | `/forms/cqi/annual-program-report` | `['dean', 'vpaa']` | **Fully Implemented** |
| **F25** | Closing-the-Loop (CTL) Report | ACT | `ClosingTheLoopService`<br>`/api/v1/cqi/closing-the-loop` | `/forms/cqi/closing-the-loop` | `['aqau']` | **Fully Implemented** |
| **F26** | Systemic Gap Report | ACT | `SystemicGapReportService`<br>`/api/v1/periodic/systemic-gap-report` | **MISSING** (No UI route) | `['vpaa']` | **Backend-Only** |
| **F27** | CAPA Plan | ACT | `CapaPlanService`<br>`/api/v1/periodic/capa-plan` | **MISSING** (No UI route) | `['aqau']` | **Backend-Only** |
| **F28** | Institutional Review | ACT | `InstitutionalReviewService`<br>`/api/v1/periodic/institutional-review` | **MISSING** (No UI route) | `['vpaa']` | **Backend-Only** |
| **Seq 35** | Action-Taken Record (At-Risk) | ACT | `AtRiskService`<br>`/api/v1/atrisk/*` | `/forms/cqi/action-taken` | `['program_chair']` | **Fully Implemented** (client requirement, not in manual) |
| **F29–F37, F41** | Specialty & Consolidation Schedules | VARIOUS | None (Undefined in manual) | None | None | **Unspecified / Future Scope** |

---

## 5. Frontend & UI Infrastructure Status

### 5.1 Architecture & Role-Scoped Gating
- **Shell & Navigation:** Layouts, theme, sidebar, and login are operational. Routing is config-driven via `lib/roles.ts` (7 role labels: `user` + the 6 institutional roles) and `config/navigation.ts`.
- **Adaptive Dashboards:** A single entry point at `/dashboard` loads adaptive views for each of the 6 system roles (`faculty`, `program_chair`, `dean`, `aqau`, `vpaa`, `system_admin`).
- **Workflow Stepper Bar (`FormWorkflow`):** Embedded on **21 screens** — all 13 Phase 0–5 forms (the `clo_raw_data` data-capture page carries `submissionId={null}`), all 7 Phase 6 CHECK forms, and the new action-taken form. Provides real-time status badges, reviewer comments, and role-authorized buttons (`Submit`, `Approve`, `Return with Comment`, `Archive`). The 8 screens without it are exactly the unbuilt ones (7 periodic + `stakeholder_consultation`).
- **Submission Inboxes:** Dedicated user views at `/submissions` ("My Submissions") and `/approvals` ("Pending Approvals") backed by `GET /forms?scope=mine|pending`.
- **Known workflow caveat:** approval-step comments are wiped when a submission is resubmitted — both original comments survive only in `audit_log` (`testing_results.md` 9.7).

### 5.2 State Management (Jotai Atoms) & Chart Rendering
- **Data Hydration:** Client state uses Jotai atoms under `apps/frontend/lib/store/atoms/`. Atoms resolve live payloads from backend list endpoints via `atomWithAsyncData` and `fetchLatestPayload`.
- **Zero-Fabrication Policy:** All static `MOCK_*` datasets were eradicated from client code (the only remaining mention is a historical note in `apps/frontend/SYSTEM-DESIGN.md`). If an endpoint returns an unseeded or empty array, atoms resolve to empty arrays `[]` and render clean `ChartEmptyState` components. Residual sample data (`SAMPLE_MY_SUBMISSIONS`, `SAMPLE_PENDING_APPROVALS`) renders only behind `DEVELOPMENT=true` preview mode, which is currently off.
- **Defect — Hardcoded Empty Stat Banner:** In [`apps/frontend/app/(app)/dashboard/role-dashboard.tsx:87`](../apps/frontend/app/(app)/dashboard/role-dashboard.tsx), `stats: StatCard[] = []` is hardcoded across all 6 roles and no other file passes a `stats` prop, so the header KPI row (active at-risk students, pending approvals, program attainment rate) is unreachable by construction. Browser-confirmed 2026-09-29: the chart cards below render live numbers, the header row stays blank.

### 5.3 Missing Components & Reporting Engine
- **Dedicated OBE Primitives:** No `components/obe/` package exists. Components such as Bloom's selectors, Likert scales, and I-P-D selectors are inlined within individual screen files rather than packaged (shared pieces that do exist: `reui/frame|badge`, `ui/status`, `ui/form-select`, `lib/constants/obe.ts`).
- **Physical Report Export Engine:** Model `ReportExport` exists in [`prisma/schema/09-reports.prisma:1-13`](../apps/backend/prisma/schema/09-reports.prisma) but is consumed by **no route** (only the generated Prisma client references it). There is no server-side document rendering (no PDF/Puppeteer/ExcelJS dependency anywhere), **no export/print buttons exist at all** — the only "export" UI is a cosmetic `ExportFormatBars` chart fed from sample data on the system-admin dashboard.

---

## 6. Service Readiness & Operational Architecture

### 6.1 Python Server (`apps/python-server`)
- **Implemented Capabilities:**
  - Dynamic CLO and roster discovery via `openpyxl` ([`etl/extract/extractor.py`](../apps/python-server/app/etl/extract/extractor.py)), with structured error mapping (`MissingWorksheet`, `UnsupportedCourseType`) delivered through the job API.
  - Independent Formula 1A direct CLO attainment with Rule-1 completeness verification ([`etl/transform/transformer.py`](../apps/python-server/app/etl/transform/transformer.py)).
  - Analytics rollups (Formulas 2A, 7A, 7C, Rule 3).
  - PII scrubbing (`anonymize_students`) before LLM prompt compilation.
  - **Persistent job queue:** Redis-backed ([`app/services/job_queue.py`](../apps/python-server/app/services/job_queue.py), keys `obelisk:job_queue` / `obelisk:job:*`); the worker refuses to start without Redis. (The python-server `AGENTS.md` still says "in-memory" — stale doc, not stale code.)
- **Pending Capabilities:**
  - Real loader delivery to backend (still `DummyLoader`, [`etl/load/loader.py`](../apps/python-server/app/etl/load/loader.py)).
  - Live LLM enablement: the multi-key failover pool is built but gated off — `IS_DEBUG_MODE = True` with no `OBELISK_LLM_API_KEY` set, so responses are placeholders.

### 6.2 TypeScript Backend (`apps/backend`)
- **Implemented Capabilities:**
  - Elysia framework with Better-Auth session management and OpenAPI schemas.
  - Full Prisma ORM schema across **14** modular schema files (`00-datasource` … `13-phase6`).
  - Centralized server-side approval routes and RBAC assertions across **29 form codes** (`lib/forms/approval-routes.ts`), with module-registered submit gates and approval effects.
  - Score edit, CSV wide-format re-import, and automatic at-risk calculation.
  - At-risk action-taken workflow with transactional flag clearing (`src/v1/atrisk/` + `lib/forms/approval-effects.ts`).
- **Pending Capabilities:**
  - Archival pipeline execution (Phase 7).
  - Production guard on the database seeder (Section 7.1).

### 6.3 Database & Environment Separation
- **Branch Topology:** Local dev environment and remote production use **separate Neon branches sharing identical schemas**.
- **Test Database Wipe:** The integration test runner (`apps/backend/test/helpers/run-tests.ts`) executes a full truncate before and after each run via `wipe-db.ts` — an explicit list of **43 tables** covering all **50** mapped schema tables (plan child tables are pulled in by `TRUNCATE … CASCADE`). Harness-level tests now run with a **60 s timeout** (`run-tests.ts:12-21`, added for slow Neon runs). This isolates the dev branch safely without endangering production, but requires re-running `just db-seed` before browser testing.

---

## 7. Critical Code Discrepancies & Blocker Registry

### 7.1 Blocker 1: Missing Production Guard in Database Seeder (CRITICAL) `[OPEN]`
- **Source Location:** [`apps/backend/prisma/seed.ts:226-250`](../apps/backend/prisma/seed.ts) — `main()` at `:226`, destructive `deleteMany` block at `:232-250`.
- **Defect:** `main()` executes destructive `deleteMany` calls across `atRiskFlag`, `cloAttainment`, `computationRun`, `student`, and institutional `user` rows without checking `NODE_ENV === "production"`. A grep for `NODE_ENV|process.env|production` in `seed.ts` returns **zero matches**.
- **Impact:** Running `bun run db:seed` against production permanently wipes institutional academic records. The seeded accounts (`<role>@jmcfi.edu.ph`, shared default password) must never exist on an internet-facing instance.
- **Remedy:** Add an immediate guard:
  ```typescript
  if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL?.includes("prod")) {
    throw new Error("FATAL: Seeding is blocked on production instances.");
  }
  ```
- **Tracking:** `testing_results.md` 1.3 (❌) and §10 pre-deployment checklist.

### 7.2 Blocker 2: HTTP Method Mismatch on CAR Save (HIGH) `[OPEN]`
- **Source Locations:**
  - Client: [`apps/frontend/server/actions/car.ts:51-54`](../apps/frontend/server/actions/car.ts) — `actionApi.post(\`/car/${id}\`, parts)` inside `saveCar` (`:41`).
  - Server: [`apps/backend/src/v1/car/controller.ts:96-97`](../apps/backend/src/v1/car/controller.ts) — `.put("/:id")` (POST exists only on `/generate`).
- **Defect:** Frontend Server Action calls `actionApi.post('/car/${id}', parts)`, but backend controller listens on `.put("/:id")` — `actionApi.post` really sends `POST`, with no verb translation.
- **Impact:** Clicking "Save Draft" on CAR throws 404/405, preventing saving parts 1, 5, 6, and 7 (live-observed "Save failed", `testing_results.md` 6.3).
- **Remedy:** Change `actionApi.post` to `actionApi.put` in `apps/frontend/server/actions/car.ts` (as `check.ts:83` and `plan.ts:362` already do).

### 7.3 Blocker 3: HTTP Method Mismatch on Curriculum Map Save (HIGH) `[OPEN]`
- **Source Locations:**
  - Client: [`apps/frontend/server/actions/plan.ts:70-73`](../apps/frontend/server/actions/plan.ts) — `actionApi.post('/plan/curriculum-map/${id}', body)` inside `saveCurriculumMap` (`:46`).
  - Server: [`apps/backend/src/v1/plan/controller.ts:168-169`](../apps/backend/src/v1/plan/controller.ts) — `.put("/curriculum-map/:id")`.
- **Defect:** Frontend calls `actionApi.post`, but backend exposes only GET/PUT on that path → 404.
- **Impact:** Program chairs cannot persist matrix changes to the CLO-PLO Curriculum Map (F01).
- **Remedy:** Change `actionApi.post` to `actionApi.put` in `apps/frontend/server/actions/plan.ts`.

### 7.4 Blocker 4: Broken Mapping Bridge in PLO Rollup (CRITICAL) `[RESOLVED 2026-09-29]`
- **Original Defect:** The extractor returned `clo_plo_mapping: []` ([`extractor.py:191-192`](../apps/python-server/app/etl/extract/extractor.py)) and the backend rollup service constructed the python `/analytics/summary` payload from the snapshot without querying `CloToPloMap` — so every PLO was skipped and `persistPloAttainment` wrote nothing.
- **Fix Applied:** `PloSummaryService.loadCloPloMapping(programId)` ([`src/v1/rollup/service.ts:545-562`](../apps/backend/src/v1/rollup/service.ts)) queries `prisma.cloToPloMap` and injects the rows at `:359` (snapshot fallback `:380-384`); the duplicated AI path received the same injection ([`src/v1/ai/service.ts:125-178`](../apps/backend/src/v1/ai/service.ts), [`src/v1/ai/compute.ts:15-46`](../apps/backend/src/v1/ai/compute.ts)).
- **Verification:** Live run 2026-09-29 — **5 `PloAttainment` rows persisted** (PLO1–PLO5), dropping a mapping removes its PLO without a crash (`testing_results.md` 9.1/9.2); regressions added in `rollup.test.ts` and `ai.compute.test.ts`.
- **Residual:** The extractor's `clo_plo_mapping: []` field is retained as a dead legacy fallback and could be removed for clarity.

### 7.5 Blocker 5: Duplicate Computation Runs on Class Record Re-Upload (MEDIUM) `[OPEN]`
- **Source Location:** [`apps/backend/src/v1/ingest/service.ts:222-233`](../apps/backend/src/v1/ingest/service.ts) — `computationRun.create` on every upload, with `cloAttainment.create` per row at `:299-315` and **no invalidation of prior runs anywhere in `src/`**.
- **Defect:** Re-uploading a class record creates a new `ComputationRun` and appends duplicate `CloAttainment` rows without superseding prior runs.
- **Impact:** The database accumulates orphaned runs. Mitigation exists but is partial: CAR and rollup readers resolve the latest run (`resolveRun` `:641-665`, `orderBy runAt desc` — "latest wins"), but the gap-analysis loader queries `cloAttainment` by section with **no run-id filter** ([`src/v1/cqi/service.ts:275-280`](../apps/backend/src/v1/cqi/service.ts)) and would double-count scores after a re-upload.
- **Remedy:** Implement replace-or-supersede logic marking earlier runs as inactive prior to persisting new attainment records — or make every reader run-scoped.
- **Tracking:** `testing_results.md` 5.5 (❌): "Decide block-or-replace before real use."

### 7.6 Blocker 6: CAR Part 1 Enrolled Count Always Zero (HIGH) `[OPEN]`
- **Source Location:** [`apps/backend/src/v1/car/service.ts:150`](../apps/backend/src/v1/car/service.ts) — `prisma.enrollment.count({ where: { classSectionId } })`.
- **Defect:** Zero routines in the entire repo write to `Enrollment` (no `enrollment.create|upsert|createMany` anywhere in `apps/` or `packages/`); the model exists unused at [`prisma/schema/03-academic.prisma:122-132`](../apps/backend/prisma/schema/03-academic.prisma).
- **Impact:** CAR displays "No. Enrolled: 0" next to a real completed count. Related: Year Level / Faculty headers also render dashes because the ETL-extracted values sit unused in `ComputationRun.etlSnapshotJson` (`testing_results.md` 6.5).
- **Remedy:** During class record persistence, upsert `Enrollment` rows for each student in the section, or fall back to counting distinct students with scores in that section.

### 7.7 Blocker 7: CAR Part 2 Category Breakdown Renders Dashes (MEDIUM, re-scoped) `[PARTIALLY MITIGATED]`
- **Source Locations:**
  - Backend: [`apps/backend/src/v1/car/service.ts:467-489`](../apps/backend/src/v1/car/service.ts) — `buildPart2` now computes exam/rubric/perf-task/portfolio means from `examPct/atPct/tlaPct/outputPct` columns (written by ingest at `src/v1/ingest/service.ts:305-308`), with `meanPct` returning `null` for absent values ([`car/compute.ts:39-47`](../apps/backend/src/v1/car/compute.ts)).
  - Frontend: empty-state message exists in [`car-form.tsx:166-187`](../apps/frontend/components/forms/car-form.tsx).
- **Current Defect (narrowed):** The backend logic is no longer the problem — the **source columns are NULL for the current template**: `AssessmentCategory` was removed from the ETL for the AUN-OBE template (`etl_const.py:205-215`), so `transformer.py:166` always yields `None`. Because `buildPart2` emits one row per CLO, the frontend empty-state is unreachable and the tables render dashes.
- **Impact:** CAR Part 2 shows four tables of dashes for this template. Rows created via CSV re-import also carry NULL category columns (they set only direct/composite) and contribute nothing to the means.
- **Remedy:** Make the empty-state fire on all-null rows, or restore per-assessment category granularity in the ETL.
- **Tracking:** `testing_results.md` 6.6 (❌).

---

## 8. Development Backlog & Technical Inquiries

### 8.1 Data Pipeline & Integration
- [ ] **Enforce Class Record as Mandatory Pipeline Prerequisite:** Ensure all downstream forms (CAR $\to$ PLO Rollup $\to$ Gap Analysis $\to$ CQI Action Plan) block generation with explicit validation if no verified class record ingestion exists for that section and term.
- [x] **End-to-End Pipeline Verification:** Verify full chain: Class record upload $\to$ CLO attainment $\to$ CAR $\to$ PLO rollup $\to$ Gap analysis $\to$ CQI loop closure without manual data re-entry. — **Done 2026-09-29** against the live stack with seeded role sessions (upload → 150 `CloAttainment` → CAR → 5 `PloAttainment` → 2 `GapRow`s → full approval chain), after fixing the two blocker bugs in §7.4 and the AI request body (`testing_results.md` §9).
- [x] **At-Risk Student Remediation Form:** Build dedicated remediation record form and workflow to resolve at-risk flags without tampering with historical grades. — **Done 2026-09-30** (schema lifecycle fields were *not* added; resolution is deletion-in-transaction on final approval). See §3.2. Residual: score edits can still re-create flags; CAR Part 4 and the dashboard donut do not read live flags.

### 8.2 Forms, Security & Workflow
- [ ] **Draft Save Ownership & Authorization:** Resolve whether draft editing on form screens should allow collaborative role edits or enforce strict creator-only ownership as in `PUT /forms/:id`.
- [ ] **Ambiguous Approval Chain Sanity Checks:** Confirm whether `curriculum_map` routes only to `['aqau']`, `systemic_gap_report` to `['vpaa']`, and whether `peer_observation` should permit same-role chair sign-off.
- [ ] **Server Investigation — Phantom GET Requests:** Investigate and eliminate unprompted background GET requests observed hitting backend endpoints (verify if caused by stale client polling or prefetching).

---

## 9. Executive Remediation & Milestone Matrix

| Category | Finding / Work Item | Severity | Status / Target Remediation |
| :--- | :--- | :---: | :--- |
| **Pipeline Bridge** | Empty `clo_plo_mapping` sent to python-server in F15 rollup. | **CRITICAL** | ✅ **RESOLVED 2026-09-29** — `loadCloPloMapping` injects DB `CloToPloMap` (rollup + AI paths); verified live with 5 `PloAttainment` rows. |
| **Accreditation Workflow** | Missing At-Risk Student Action-Taken / Remediation workflow. | **HIGH** | ✅ **RESOLVED 2026-09-30** — `action_taken` form + `/api/v1/atrisk/*` + clear-on-final-approval effect; verified live (34 → 25 flags). |
| **Database Safety** | `seed.ts` wipes database without environment check. | **CRITICAL** | ⬜ Open — wrap cleanup in `if (process.env.NODE_ENV === 'production') throw` (§7.1). |
| **Frontend/Backend Sync** | CAR Save calls `POST /car/:id` instead of `PUT`. | **HIGH** | ⬜ Open — in `actions/car.ts:51`, switch `actionApi.post` to `actionApi.put` (§7.2). |
| **Frontend/Backend Sync** | Curriculum Map calls `POST /plan/curriculum-map/:id` instead of `PUT`. | **HIGH** | ⬜ Open — in `actions/plan.ts:70`, switch `actionApi.post` to `actionApi.put` (§7.3). |
| **Academic Ledger** | CAR Part 1 `noEnrolled` counts unpopulated `Enrollment` table. | **HIGH** | ⬜ Open — upsert `Enrollment` rows during ingest or count distinct `CloAttainment` students (§7.6). |
| **Ingest Stability** | Class record re-upload appends duplicate `ComputationRun` records; gap analysis reads without a run id. | **MEDIUM** | ⬜ Open — mark prior runs superseded or purge prior unapproved run attainments (§7.5). |
| **Compliance Output** | CAR Part 2 renders dashes — ETL category columns NULL for this template; empty-state unreachable. | **MEDIUM** | ⬜ Open — fire empty-state on all-null rows or restore ETL category granularity (§7.7). |
| **Executive UI** | Dashboard KPI stats banner hardcoded empty (`stats = []`). | **MEDIUM** | ⬜ Open — wire role dashboard shell to aggregate queries (pending approvals, at-risk count) or drop the dead prop (§5.2). |
| **Institutional UI** | 7 Periodic form screens (F02, F09, F20, F21, F26, F27, F28) unbuilt. | **MEDIUM** | ⬜ Open — build frontend route pages connecting to `/api/v1/periodic` backend endpoints. |
| **Workflow UX** | Approval-step comments wiped on resubmit (survive only in `audit_log`). | **LOW** | ⬜ Open — preserve comments on the rebuilt steps (`testing_results.md` 9.7). |
| **AI Readiness** | AI recommendation runs in placeholder mode (`IS_DEBUG_MODE=True`, no LLM key). | **LOW** | ⬜ Open — set `OBELISK_LLM_API_KEYS` and flip `IS_DEBUG_MODE` before real LLM turns. |
| **Compliance Output** | Report Export (PDF/Excel) engine unbuilt — no export buttons exist. | **LOW** | ⬜ Open — implement server-side document rendering targeting official JMCFI form templates. |
