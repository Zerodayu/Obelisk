# Obelisk Backend — System Design

> **Product:** Obelisk — Outcomes-Based Educational Learning and Intelligent System Kit for Jose Maria College Foundation, Inc. (JMCFI)
> **Status:** Early — auth infra + full relational schema exist; form/feature routes not yet implemented. This doc records the **current state** and the **target design** mapped from the JMCFI OBE forms so future work lands on stable ground.

---

## 1. Architecture & Runtime

- **Runtime:** Bun. **HTTP:** Elysia. **DB:** PostgreSQL via Prisma + Neon driver adapter. **Auth:** better-auth (email/password, cookie sessions). **Validation:** Elysia `t` (backend) and Zod.
- **App bootstrap** `src/index.ts`:
  1. `@elysia/openapi` (served at `/openapi`; gathers paths from the better-auth OpenAPI plugin + feature routes).
  2. `@elysia/cors` — origins from `FRONTEND_URL` + `http://localhost:3000`, credentials enabled.
  3. `.mount(auth.handler)` — better-auth at basePath `/api/v1/auth`.
  4. `.use(apiRoutesV1)` — feature routes under prefix `api/v1`.
  5. `listen(8080)`.
- **Auth guard macro:** `src/v1/auth/controller.ts` exposes a `auth: true` macro (resolves session via `auth.api.getSession`, returns `user`/`session`, 401 on failure) plus `/auth/me`. `OpenAPI` helper aggregates better-auth paths with tag `Better Auth`.

### Request flow

```
Browser/Next.js ──(cookie/Auth header)──> Elysia
  └─@elysia/openapi ─ /openapi
  └─@elysia/cors
  └─better-auth handler ─ /api/v1/auth/* (sign-in, session, me)
  └─apiRoutesV1 (prefix api/v1)
       └─ feature plugin (prefix, tags)
            └─ auth guard macro (resolve user/session)
            └─ controller ─ service (business logic) ─ Prisma (Neon)
```

## 2. Database Schema (implemented)

Prisma schema is split into files under `prisma/schema/`. Names below are exact model/enum names.

### 2.1 Auth — `02-auth.prisma`

`user` (with institutional extensions: `role`, `employeeId`, `programId`, `departmentId`, `isActive`), `session`, `account`, `verification`. `user` holds back-relations for dean/chair/faculty submitter/approver roles.

### 2.2 Academic — `03-academic.prisma`

`Department` (has `dean`), `Program` (has `programChair`), `AcademicTerm` (unique `[schoolYear, semester]`, `isActive`), `Course` (unique `[programId, code]`), `ClassSection` (unique `[courseId, termId, sectionCode]`), `Student` (`anonymizedId` for privacy), `Enrollment` (unique `[studentId, classSectionId]`).

### 2.3 Outcomes — `04-outcomes.prisma`

`Clo`, `Plo` (has `targetAttainmentPct` default 70.00), `Peo`, `CloToPloMap` (unique `[cloId, ploId]`), `PloToPeoMap`.

### 2.4 Assessment — `05-assessment.prisma`

`AssessmentItem` (links `classSection` + `clo`; `AssessmentType` direct/indirect, `maxScore`, `weightPct`), `StudentScore` (unique `[assessmentItemId, studentId]`, `rawScore`).

### 2.5 Forms & Approval — `06-forms.prisma`

`FormType` (`code`, `pdcaStage`, `sequenceNo`), `FormSubmission` (`formData Json`, `status`, `currentApproverRole`; links formType/section/program/term/submitter; back-relations to approvalSteps/reportExports/attainments), `ApprovalStep` (unique `[formSubmissionId, sequenceNo]`; `ApprovalDecision`, `ApproverRole`).

### 2.6 Attainment & Computation — `07-attainment.prisma`

`ComputationRun` (`scope`, `formulaVersion` default `70_30_v1`, `directWeight` 0.70, `indirectWeight` 0.30), `CloAttainment` (unique `[classSectionId, cloId, studentId, computationRunId]`, `directScorePct`, `indirectScorePct`, `compositeScorePct`, `isBelowThreshold`), `PloAttainment` (unique `[ploId, programId, termId, computationRunId]`, `attainedPct`, `studentsBelowTargetCount`).

### 2.7 Monitoring — `08-monitoring.prisma`

`AuditLog`, `AtRiskFlag` (links student + optional `CloAttainment`, `reason`), `AiRecommendation` (`status`, `sourceDataSnapshot Json`).

### 2.8 Reports — `09-reports.prisma`

`ReportExport` (`format` pdf/excel/word, `fileUrl`).

### 2.9 Enums — `01-enums.prisma`

`UserRole` (user, faculty, program_chair, dean, aqau, vpaa, system_admin), `AssessmentType` (direct, indirect), `SubmissionStatus` (draft, submitted, returned, approved, archived), `ApprovalDecision` (pending, approved, returned), `ApproverRole`, `RecommendationStatus`, `ExportFormat`.

## 3. Roles & Authorization Matrix

| Role | Scope | Typical actions |
| --- | --- | --- |
| `user` | default | — |
| `faculty` | own `ClassSection` + own courses | Enter per-student raw scores (`clo_raw_data`), author CAR, fill direct instruments |
| `program_chair` | one `Program` | Set targets, publish calendar, approve faculty records, gap analysis, CQI plans |
| `dean` | `department` | Approve budgets/plans, endorse APAR |
| `aqau` | institution-wide QA | Receive/review filings, cohort tracking oversight |
| `vpaa` | institution-wide | Approve CAPA/budget, institutional decisions |
| `system_admin` | everything | Admin/roles |

**Approval chain (target):** governed by `FormSubmission.currentApproverRole` + ordered `ApprovalStep` rows. Canonical descent: `faculty → program_chair → dean → aqau → vpaa` (exact chain and who prepares/receives each form is form-specific; see §5 catalog).

## 4. API Endpoints

### Implemented

| Method | Path | Guard | Summary |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/sign-up/email` | — | better-auth sign-up |
| POST | `/api/v1/auth/sign-in/email` | — | better-auth sign-in |
| POST | `/api/v1/auth/sign-out` | — | sign-out |
| GET | `/api/v1/auth/me` | `auth: true` | current user + session |
| GET | `/openapi` | — | OpenAPI docs |

### Planned (feature plugins, one per module mirroring the form catalog)

Per feature module `src/v1/{feature}/{controller,service,model}.ts`, mounted in `routes.ts`:

- `forms` — form CRUD, submit, approval actions, computed-field resolution, auto-population across related forms.
- `attainment` — run `ComputationRun`, compute CLO/PLO attainment, diagnostics (divergence, at-risk).
- `survey` — survey/feedback tabulation (indirect evidence).
- `rollups` — cohort/program rollup + longitudinal (`cohort_tracking`), dashboards, report exports.
- `monitoring` — audit-trail queries, systemic-gap trigger, CAPA lifecycle.

## 5. Form Catalog & Data Mapping (target)

Each row: **stable code → title → primary models → status / rules to enforce.**

| Stable code | Form title | Primary models | Notes / rules |
| --- | --- | --- | --- |
| `curriculum_map` | CLO-PLO Curriculum Map | `Program`, `Plo`, `Clo`, `CloToPloMap`, `FormSubmission` | Dynamic PLO/course tables; **Coverage Check** computed = any cell in a PLO column has I-P-D stage *D*. Gap: I-P-D stage cell not yet modeled — add stage to `CloToPloMap`. |
| `portfolio_roadmap` | Portfolio Roadmap and Rubric Standards | `Program`, `Plo`, `FormSubmission` (`formData`) | Reusable Year Roadmap (×4) + Rubric Criterion Block (×10); rubric weight **TOTAL must = 100%**. |
| `assessment_calendar` | Assessment Calendar with Cohort Tracking Milestones | `AcademicTerm`, `FormSubmission` | Pre-seeded template rows (June-July PAC, OB syllabi, formative/midterm/finals windows, CAR windows, CQI) — editable dates, non-deletable. |
| `target_setting_matrix` | Target-Setting Matrix | `Plo`, `FormSubmission` | Per-year targets; **each target ≥70% hard floor**, rationale required above floor. |
| `stakeholder_consultation` | Stakeholder Consultation Records | `Program`, `Plo`, `FormSubmission` | Fixed stakeholder groups (Faculty/Students/Alumni/Industry/PAC); PLO retain/revise/escalate decisions. |
| `assessment_budget` | Approved Assessment Budget | `FormSubmission` | 12 fixed line items grouped by PDCA phase; pre-populated + extendable; TOTAL computed. |
| `clo_raw_data` | Per-Student CLO Raw Data Sheet | `ClassSection`, `Course`, `Clo`, `AssessmentItem`, `StudentScore`, `Student`, `Enrollment`, `FormSubmission` | **Primary data-capture form.** CSV/Excel import path; **At-Risk auto-flag if any CLO <70%** (do not accept manual checkbox). |
| `mid_cycle_attainment` | Mid-Cycle CLO Attainment Summary | `CloAttainment`, `AtRiskFlag`, `FormSubmission` | Reusable Cohort Attainment Block (×4); status vs ≥70% floor (MET/Early Warning/NOT MET); **At-Risk watchlist** sub-table. |
| `resource_monitoring` | Resource Acquisition and Implementation Monitoring | `FormSubmission`, refs `assessment_budget` + `cqi_action_plan` | Mirrors budget line items (Acquired/Pending/Not Acquired/N/A); tracks CQI action implementation (Fully/Partially/Not Yet). |
| `peer_observation` | Peer Observation Record | `FormSubmission` | 7 fixed criteria, each with its own rating scale + Evidence Observed text. |
| `exhibition_feedback` | Portfolio Exhibition Industry Feedback | `FormSubmission` | **Min 3 industry guests (validation);** per-PLO rating (0-10) × guests, Mean computed; OVERALL MEAN computed. |
| `clo_perception_survey` | CLO Achievement Perception Survey Tabulation | `FormSubmission`, refs direct attainment | 5-pt Likert tabulation; Mean + % rating 4+5 computed (target ≥80%); **divergence auto-flag** vs direct CLO attainment. |
| `course_assessment_report` | Course Assessment Report (CAR) | `FormSubmission`, `CloAttainment`, `PloAttainment`, `AtRiskFlag` | **Hub form, 7 parts.** Part 3 auto-populates from `clo_raw_data`/`mid_cycle_attainment` + Part 2 computations; Part 5 CQI entries feed `plo_gap_analysis`/`cqi_action_plan`. |
| `clo_attainment_summary` | CLO Attainment Summary (Full Term) | `CloAttainment`, `FormSubmission` | Reusable Year block (×4); full-term CLO attainment computed; cohort avg. |
| `plo_attainment_summary` | PLO Attainment Summary | `PloAttainment`, `ComputationRun`, `FormSubmission` | Aggregates CARs; Full-Year PLO attainment computed; status vs ≥70%. |
| `cohort_tracking` | Cohort CLO/PLO Attainment Tracking Sheet | `Plo`, `PloAttainment`, `CloAttainment`, `ComputationRun`, `FormSubmission` | **Permanent retention + strict audit trail.** Longitudinal columns per Year 1-4; Trend (↑/↓/→) + CQI-triggered flag. Cited by many later forms. |
| `student_exit_survey` | Student Exit Survey Tabulation | `FormSubmission` | Response rate target ≥70%; tabulation by PLO × cohort; divergence flag OK/FLAG. |
| `portfolio_assessment_record` | Portfolio Assessment Record with CLO Evidence | `FormSubmission` | Assessor panel (2 faculty + industry where required); rubric consensus score; attainment % computed. |
| `capstone_panel_evaluation` | Capstone/Culminating Panel Evaluation | `FormSubmission` | **Min 2 faculty + 1 industry panelist (validation);** 10-pt PLO scoring; consensus + attainment computed; Program-Readiness declaration. |
| `alumni_tracer` | Alumni Tracer Study Report | `FormSubmission` | 5 fixed employment indicators; PLO sufficiency ratings (target ≥70%, insufficiency flag ≥30%); **biennial**. |
| `employer_satisfaction_survey` | Employer Satisfaction Survey | `FormSubmission` | ≥10 employers targeted; PLO competency ratings (target ≥70%); **biennial**. |
| `plo_gap_analysis` | PLO Attainment Report with Gap Analysis | `PloAttainment`, `FormSubmission` | **One gap row required per NOT-MET PLO-cohort combo**; 6-category root cause; links CQI entries. |
| `cqi_action_plan` | CQI Action Plan | `FormSubmission` (stateful lifecycle) + `CampCqiEntry` (target) | Two-phase lifecycle (planned this cycle → tracked next). **Model as a stateful record per entry**, not a static document. Feeds `resource_monitoring` §3 + `closing_the_loop`. |
| `annual_program_report` | Annual Program Assessment Report (APAR) | `FormSubmission` | 9 fixed attachments; dashboard KPIs computed; **validation gate: blocked if `cohort_tracking` absent.** Due June 30. |
| `closing_the_loop` | Closing-the-Loop (CTL) Report | `FormSubmission` | **Loop Status hard-computed**: CLOSED only if all 5 conditions Yes; else OPEN-Re-assess / OPEN-Not Implemented. Mandatory identify step (4 prompts). |
| `systemic_gap_report` | Systemic Gap Report | `FormSubmission` | **Trigger: 3 consecutive NOT-MET cycles (from `cohort_tracking`).** Due = trigger + 30 days (auto-computed). Structural response + CAPA outline. |
| `capa_plan` | Corrective and Preventive Action Plan | `FormSubmission` | Refs system-gap report; actions/milestones (≤8); AQAU progress monitoring; closure when benchmark sustained 2+ cycles. |
| `institutional_review` | Institutional Management Review | `FormSubmission` | Program APAR review summary; institutional CQI completion rate (target ≥70%); decisions D1-D5; July 15. |

### Provisional mapping note

The manual's provisional form IDs (`F01`–`F28`) map 1:1 onto the stable codes in the order listed above (e.g., `F07 = clo_raw_data`). Do not store the `F##` values in data or code — they are source-document cross-references only and can change.

### Not-yet-developed forms (no code, no field structure)

Treated as future/placeholder topics only — do not fabricate codes: portfolio/consolidation schedules and specialty forms without a defined field structure in the manual (the manual itself marks several early `F##` numbers as referenced-not-defined). Confirm scope with the product owner before designing.

## 6. Cross-Form Data Flow (target)

```
curriculum_map ──┬──> portfolio_roadmap (if portfolio program)
                 ├──> target_setting_matrix
                 └──> course_assessment_report §1.1 (CLO-PLO map must match)

assessment_calendar ──> governs timing of all forms

clo_raw_data ──> mid_cycle_attainment ──> course_assessment_report
direct/indirect instruments (peer_observation, exhibition_feedback, clo_perception_survey,
  student_exit_survey, portfolio_assessment_record, capstone_panel_evaluation) ──> course_assessment_report §2/§6

course_assessment_report ──┬──> clo_attainment_summary
                           └──> Part 5 CQI entries ──> plo_gap_analysis / cqi_action_plan

clo_attainment_summary ──> plo_attainment_summary ──> cohort_tracking ──permanent──> annual_program_report

plo_gap_analysis ──> cqi_action_plan ──┬──> resource_monitoring §3
                                       └──> closing_the_loop

3+ consecutive NOT MET (from cohort_tracking) ──> systemic_gap_report ──> capa_plan

annual_program_report + closing_the_loop + systemic_gap_report + capa_plan ──> institutional_review

alumni_tracer + employer_satisfaction_survey ──> feed plo_attainment_summary composite
  (Direct×70% + Indirect×30%) and annual_program_report
```

## 7. Service Layer (target)

`ComputedField` / rollup services encapsulate the shared validation + computation rules:

- **`attainment-service`** — computes `CloAttainment`/`PloAttainment` per `ComputationRun`; formula `Direct×0.70 + Indirect×0.30`; applies ≥70% floor; sets `isBelowThreshold`.
- **`at-risk-service`** — derives `AtRiskFlag` from `CloAttainment.isBelowThreshold`; no manual writes.
- **`cqi-service`** — stateful `cqi_action_plan` entries; enforces CLOSED only when 5 CTL conditions met; feeds gap/systemic/CAPA.
- **`submission-service`** — form lifecycle (`SubmissionStatus`), `ApprovalStep` routing by role chain, APAR attach-gate, audit logging.
- **`dashboard/rollup-service`** — APAR KPI/dashboard and institutional completion-rate computations.

## 8. External Services

- **`python-server/`** — the authoritative pure-compute engine for spreadsheet-derived attainment (FastAPI, port 8000; no DB, no auth). It parses class-record `.xlsx` (Formula 1A direct CLO attainment, 4-tier levels, Rule-1 completeness) and provides program/department/AVP rollups (Formulas 2A/7A/7C) + AI CQI recommendations. Docs: `../python-server/AGENTS.md`, `../python-server/SYSTEM-DESIGN.md`, `../python-server/documentations/INTEGRATION.md`.

  **Ownership boundary (see `python-server/SYSTEM-DESIGN.md` §7):** this backend is the **sole persister** — it stores python-server's results into `CloAttainment`/`PloAttainment`/`ComputationRun` (recording formula version/weights) and performs all auth/RBAC, approvals, form lifecycle, audit, exports. It must **not** re-implement Formula 1A or the rollups. It calls python-server via `POST /upload` → poll `GET /jobs/{job_id}` → `POST /analytics/*`, storing returned `StudentCLOAttainment` records to seed `clo_raw_data` / CAR. Frontend import flow: see `frontend/SYSTEM-DESIGN.md` §4.2.

## 9. Deferred / Open Questions

- I-P-D stage representation for curriculum-map cells and cohort progression (new column on `CloToPloMap` vs. JSON).
- Stateful CQI/logical status fields beyond the clean single-table forms (may warrant dedicated CQI/CTL tables rather than `FormSubmission.formData` JSON).
- Survey long-guide vs. row-normalized tabulations (JSON now, consider normalized later).
- Portfolio/capstone per-criterion rubric rows — JSON within `FormSubmission` vs. dedicated tables.
