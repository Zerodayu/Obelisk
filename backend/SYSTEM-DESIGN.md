# Obelisk Backend — System Design

> **Product:** Obelisk — Outcomes-Based Educational Learning and Intelligent System Kit for Jose Maria College Foundation, Inc. (JMCFI)
> **Status:** Backend-first build in progress — **Phase 0 foundation/stabilization complete** (typecheck/lint/bun:test green; forms module, python-server ingest client, and shared validators shipped behind `api/v1`; archival migration applied). Feature phases (1–7) build on this. **Frontend work is deferred until the backend is stable** (see `../roadmap.md`). This doc records the **current state** and the **target design** mapped from the JMCFI OBE forms so future work lands on stable ground.

---

## 1. Architecture & Runtime

- **Runtime:** Bun. **HTTP:** Elysia. **DB:** PostgreSQL via Prisma + Neon driver adapter. **Auth:** better-auth (Google OAuth for new accounts — restricted to the organization's Workspace domain; email/password sign-in kept for existing accounts, new email sign-ups disabled). **Validation:** Elysia `t` (backend) and Zod.
- **Shared plumbing:** `lib/prisma.ts` (single `PrismaClient` singleton with the Neon adapter — shared by auth, forms, and future modules), `lib/forms/state-machine.ts` (pure submission lifecycle rules — status transitions, approval-chain validation, editable states), `lib/validators/` (attainment, root-cause, retention constants), `lib/ingest/ingest-client.ts` (python-server HTTP client).
- **App bootstrap** `src/index.ts`:
  1. `@elysia/openapi` (served at `/openapi`; gathers paths from the better-auth OpenAPI plugin + feature routes).
  2. `@elysia/cors` — origins from `FRONTEND_URL` + `http://localhost:3000`, credentials enabled.
  3. `.mount(auth.handler)` — better-auth at basePath `/api/v1/auth`.
  4. `.use(apiRoutesV1)` — feature routes under prefix `api/v1`.
  5. `listen(8080)`.
- **Auth guard macro:** `src/v1/auth/controller.ts` exposes a `auth: true` macro (resolves session via `auth.api.getSession`, returns `user`/`session`, 401 on failure) plus `/auth/me`. `OpenAPI` helper aggregates better-auth paths with tag `Better Auth`. The macro bypasses better-auth's `session_data` cookie cache (`query: { disableCookieCache: true }`) so role/status reads always reflect the DB — a role request filed on `/onboarding` shows as `pending` immediately instead of waiting out the 5-minute cache.

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

`user` (with institutional extensions: `role`, `requestedRole`, `roleRequestStatus`, `employeeId`, `programId`, `departmentId`, `isActive`), `session`, `account`, `verification`. `user` holds back-relations for dean/chair/faculty submitter/approver roles.

**Role request flow:** new accounts sign in through the org-restricted Google provider with no role (`role = user`, `roleRequestStatus = none`). After login they file a role request on the frontend `/onboarding` route via `POST /api/v1/auth/role-request` (`requestedRole` ∈ faculty/program_chair/dean/aqau/vpaa → `roleRequestStatus = pending`). A `system_admin` confirms (approve → `role = requestedRole`, `roleRequestStatus = approved`; deny → `roleRequestStatus = denied`, `requestedRole` cleared) via `GET/POST /api/v1/auth/role-requests*`. Until confirmed the user keeps the default `user` role.

**Account-creation gate:** only organization-email addresses may open an account. The Google provider passes `hd: ORG_EMAIL_DOMAIN` — sent to Google as the hosted-domain authorization hint and enforced against the id-token's `hd` claim (sign-in is rejected when the claim is missing or doesn't match), with the Google Cloud Console Workspace restriction as the outer gate. Email/password **sign-up** is disabled (`emailAndPassword.disableSignUp`); email/password **sign-in** remains available for existing accounts.

### 2.2 Academic — `03-academic.prisma`

`Department` (has `dean`), `Program` (has `programChair`), `AcademicTerm` (unique `[schoolYear, semester]`, `isActive`), `Course` (unique `[programId, code]`), `ClassSection` (unique `[courseId, termId, sectionCode]`), `Student` (`anonymizedId` for privacy), `Enrollment` (unique `[studentId, classSectionId]`).

### 2.3 Outcomes — `04-outcomes.prisma`

`Clo`, `Plo` (has `targetAttainmentPct` default 70.00), `Peo`, `CloToPloMap` (unique `[cloId, ploId]`), `PloToPeoMap`.

### 2.4 Assessment — `05-assessment.prisma`

`AssessmentItem` (links `classSection` + `clo`; `AssessmentType` direct/indirect, `maxScore`, `weightPct`), `StudentScore` (unique `[assessmentItemId, studentId]`, `rawScore`).

### 2.5 Forms & Approval — `06-forms.prisma`

`FormType` (`code`, `pdcaStage`, `sequenceNo`), `FormSubmission` (`formData Json`, `status`, `currentApproverRole`; links formType/section/program/term/submitter; back-relations to approvalSteps/reportExports/attainments), `ApprovalStep` (unique `[formSubmissionId, sequenceNo]`; `ApprovalDecision`, `ApproverRole`).

### 2.6 Attainment & Computation — `07-attainment.prisma`

`ComputationRun` (`scope`, `formulaVersion` default `70_30_v1`, `directWeight` 0.70, `indirectWeight` 0.30), `CloAttainment` (unique `[classSectionId, cloId, studentId, computationRunId]`, `directScorePct`, `indirectScorePct`, `compositeScorePct`, `isBelowThreshold`), `PloAttainment` (unique `[ploId, programId, termId, computationRunId]`, `attainedPct`, `studentsBelowTargetCount`), `PeoAttainment` (unique `[peoId, termId]`, `attainedPct`, `evidenceJson`, `formSubmissionId?`).

### 2.7 Monitoring — `08-monitoring.prisma`

`AuditLog`, `AtRiskFlag` (links student + optional `CloAttainment`, `reason`), `AiRecommendation` (`status`, `sourceDataSnapshot Json`).

### 2.8 Reports — `09-reports.prisma`

`ReportExport` (`format` pdf/excel/word, `fileUrl`).

### 2.9 Enums — `01-enums.prisma`

`UserRole` (user, faculty, program_chair, dean, aqau, vpaa, system_admin), `RoleRequestStatus` (none, pending, approved, denied), `AssessmentType` (direct, indirect), `SubmissionStatus` (draft, submitted, returned, approved, archived), `ApprovalDecision` (pending, approved, returned), `ApproverRole`, `RecommendationStatus`, `ExportFormat`, `StudentStatus` (active, irregular, transferee, graduated, transferred_out, withdrawn), `GraduationClusterStatus` (open, compiling, archived).

### 2.10 Archive — `10-archive.prisma`

**Graduation-Cluster Archival** — compiles finished cohorts into compact, permanent, **read-only** snapshots to reclaim space while keeping data viewable.

- `GraduationCluster` — a batch of students who finish their relationship with a program in a given `graduationTermId` (`AcademicTerm`): `id`, `programId`, `graduationTermId`, `label` (e.g. "BSIT — AY 2026–2027"), `status` (open → compiling → archived), `stats Json`, `confirmedByUserId?`, `confirmedAt?`, `compiledAt?`, `archivedAt?`, `createdAt`. Unique `[programId, graduationTermId]`, index `[status]`.
- `GraduationClusterEntry` — the permanent write-once snapshot per student (no `updatedAt`): `id`, `clusterId` (Cascade), `studentId` (Restrict, unique), `anonymizedId`, `studentStatusAtArchive`, `isGraduationEntry` (false for `transferred_out`/`withdrawn`), `graduatedAt?`, `compiledData Json` (per-year CLO/PLO rollups, at-risk counts, CQI refs), `detailArtifactUrl?` (exported full-detail artifact), `purgedRowCounts Json` (audit), `createdAt`. Unique `[clusterId, anonymizedId]`.

**`Student` additions** (`03-academic.prisma`): `studentStatus` (default `active`), `graduationTermId?` → `AcademicTerm` (relation `"StudentGraduationTerm"`, SetNull), `graduationClusterId?` → `GraduationCluster` (relation `"StudentCluster"`, SetNull), `archiveEntry GraduationClusterEntry?`. `Program` gains `graduationClusters`; `AcademicTerm` gains `graduationClusters` (relation `"GraduationClusterTerm"`) + `studentsGraduated`; `user` gains `clustersConfirmed` (relation `"ClusterConfirmer"`).

**Key rules encoded in the model:** cluster membership is keyed by actual `graduationTermId`, never `yearLevel` (protects transferees + irregular students); non-graduating departures get an entry with `isGraduationEntry = false`; entries are permanent (accreditation evidence). Archival pipeline (compile → export artifact → purge granular hot rows → read-only lock) is **pending implementation** — see §7 `archival-service`. **Sequenced after PEO attainment capture** (biennial alumni/employer surveys from `alumni_tracer`/`employer_satisfaction_survey`): a cluster must not be compiled until its PEO evidence exists, so the snapshot includes it.

## 3. Roles & Authorization Matrix

| Role | Scope | Typical actions |
| --- | --- | --- |
| `user` | default | — |
| `faculty` | own `ClassSection` + own courses | Enter per-student raw scores (`clo_raw_data`), author CAR, fill direct instruments |
| `program_chair` | one `Program` | Set targets, publish calendar, approve faculty records, gap analysis, CQI plans |
| `dean` | `department` | Approve budgets/plans, endorse APAR |
| `aqau` | institution-wide QA | Receive/review filings, cohort tracking oversight, **confirm graduation-cluster compile** |
| `vpaa` | institution-wide | Approve CAPA/budget, institutional decisions |
| `system_admin` | everything | Admin/roles, **confirm role requests**, **confirm graduation-cluster compile** |

**Role request:** new accounts (org Google sign-in) file a `requestedRole` on the `/onboarding` route and start as `user` (`roleRequestStatus = pending`). Only `system_admin` may list/approve/deny requests; approval promotes `role = requestedRole`, denial leaves the account at `user`.

**Approval chain (target):** governed by `FormSubmission.currentApproverRole` + ordered `ApprovalStep` rows. Canonical descent: `faculty → program_chair → dean → aqau → vpaa` (exact chain and who prepares/receives each form is form-specific; see §5 catalog).

**Cluster confirm:** a `GraduationCluster` is confirmed for compile by `aqau` or `system_admin` (no registrar role exists yet). Confirmation flips the cluster `open → compiling → archived` and locks its entries read-only.

## 4. API Endpoints

### Implemented

| Method | Path | Guard | Summary |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/sign-up/email` | — | better-auth email sign-up (**disabled** — new accounts must use Google) |
| POST | `/api/v1/auth/sign-in/email` | — | better-auth sign-in (existing accounts) |
| POST | `/api/v1/auth/sign-in/social` | — | better-auth Google OAuth (org-email gate at Google Console + `user.create.before` hook) |
| POST | `/api/v1/auth/sign-out` | — | sign-out |
| GET | `/api/v1/auth/me` | `auth: true` | current user + session |
| POST | `/api/v1/auth/role-request` | `auth: true` | file/re-file a role request (`requestedRole` → `pending`) |
| GET | `/api/v1/auth/role-requests` | `auth: true` + system_admin | list role requests (filter by `status`, default `pending`) |
| POST | `/api/v1/auth/role-requests/:userId/approve` | `auth: true` + system_admin | grant the user's requested role |
| POST | `/api/v1/auth/role-requests/:userId/deny` | `auth: true` + system_admin | reject the role request (keeps `user` role) |
| GET | `/api/v1/forms` | `auth: true` | list form submissions (filter by formTypeId/classSectionId/status) |
| POST | `/api/v1/forms` | `auth: true` | create a draft `FormSubmission` |
| GET | `/api/v1/forms/:id` | `auth: true` | get a submission with its ordered `ApprovalStep` chain |
| PUT | `/api/v1/forms/:id` | `auth: true` | edit a draft/returned submission |
| POST | `/api/v1/forms/:id/submit` | `auth: true` | submit — creates the ordered approval chain, `draft → submitted` |
| POST | `/api/v1/forms/:id/approve/:role` | `auth: true` | approve the current pending step for the given role; advances the chain or `submitted → approved` |
| POST | `/api/v1/forms/:id/return` | `auth: true` | return the current pending step (`submitted → returned`) |
| POST | `/api/v1/forms/:id/archive` | `auth: true` | archive an approved submission (`approved → archived`) |
| POST | `/api/v1/ingest/upload` | `auth: true` | Uploads class record, runs ETL, and persists attainment results. Returns `{ etl, persistence }`. |
| GET | `/api/v1/ingest/jobs/:jobId` | `auth: true` | poll a python-server ETL job |
| GET | `/openapi` | — | OpenAPI docs |

> **Status machine** (enforced in `lib/forms/state-machine.ts`): `draft → submitted → returned → approved → archived`. `returned` is re-submittable; edits are restricted to `draft`/`returned`; approval chains must ascend the canonical role order (`program_chair → dean → aqau → vpaa`, skipping allowed). Every lifecycle action writes an `AuditLog` row (`forms` module).

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

## 7. Service Layer

### Implemented
- **`submission-service`** *(src/v1/forms/service.ts)* — `FormSubmission`/`ApprovalStep` CRUD + lifecycle (submit/approve/return/archive) driven by `lib/forms/state-machine.ts`; ordered approval-chain routing by role; `AuditLog` writes. Chain order: `program_chair → dean → aqau → vpaa`.
- **`ingest-service`** *(src/v1/ingest/controller.ts)* — Orchestrates the `POST /upload` flow: calls `ingestClient` to forward the file to python-server, polls for completion, then passes the result to `attainment-service` for persistence.
- **`attainment-service`** *(src/v1/ingest/attainment-service.ts)* — Takes a completed ETL job result. Creates a `ComputationRun`, then iterates through attainment records to find or create `Student` rows and create the corresponding `CloAttainment` records in the database.

### Planned
- **`at-risk-service`** — derives `AtRiskFlag` from `CloAttainment.isBelowThreshold`; no manual writes.
- **`cqi-service`** — stateful `cqi_action_plan` entries; enforces CLOSED only when 5 CTL conditions met; feeds gap/systemic/CAPA.
- **`dashboard/rollup-service`** — APAR KPI/dashboard and institutional completion-rate computations.
- **`archival-service`** *(schema complete + migration applied; pipeline pending)* — graduation-cluster archival lifecycle. **Must run after PEO attainment capture** (biennial alumni/employer surveys) so compiled snapshots include PEO evidence:
  1. **Auto-create** at end of AY (June 30 / July 15 cycle): per program, find students whose `graduationTermId` = the closing term (graduates + `transferred_out`/`withdrawn`) → create `GraduationCluster(status=open)` listing candidates; nothing locked.
  2. **Confirm to compile** (`aqau`/`system_admin`): blocked until `peoAttainmentCapturedAt` is set; set `compiling`; per student in a transaction — (a) compile snapshot from lifetime `CloAttainment`/`PloAttainment`/`AtRiskFlag`/`FormSubmission` plus **PEO attainment** (`PeoAttainment` → entry `peoAttainment` column) into `compiledData`; (b) export full granular detail to a `detailArtifactUrl` (configurable storage); (c) purge granular hot rows (`StudentScore`, per-student `CloAttainment`, `AtRiskFlag`, detached `FormSubmission.formData`) while keeping `PloAttainment` + `class_section`/`enrollment`; (d) write `GraduationClusterEntry` + `AuditLog`.
  3. **Lock read-only**: set cluster `archived`. Writes to `GraduationClusterEntry` are rejected — service guard (GET-only endpoints) as primary, optional Postgres trigger as defense-in-depth. Archived entries are permanent and viewable via `GET` only.

## 8. External Services

- **`python-server/`** — the authoritative pure-compute engine for spreadsheet-derived attainment (FastAPI, port 8000; no DB, no auth). It parses class-record `.xlsx` (Formula 1A direct CLO attainment, 4-tier levels, Rule-1 completeness) and provides program/department/AVP rollups (Formulas 2A/7A/7C) + AI CQI recommendations. Docs: `../python-server/AGENTS.md`, `../python-server/SYSTEM-DESIGN.md`, `../python-server/documentations/INTEGRATION.md`.

  **Ownership boundary (see `python-server/SYSTEM-DESIGN.md` §7):** this backend is the **sole persister** — it stores python-server's results into `CloAttainment`/`PloAttainment`/`ComputationRun` (recording formula version/weights) and performs all auth/RBAC, approvals, form lifecycle, audit, exports. It must **not** re-implement Formula 1A or the rollups. It calls python-server via `POST /upload` → poll `GET /jobs/{job_id}`, then the `attainment-service` persists the results directly to the `CloAttainment` table.

## 9. Deferred / Open Questions

- **Build strategy: backend-first.** All backend feature phases (forms, ingest, rollups, CQI, archival) are built and stabilized (typecheck + lint + bun:test green) before any frontend work resumes; see `../roadmap.md` for the tracking. **Phase 0 is complete**; the archival migration is applied, so DB integration tests now run against the live dev database.
- I-P-D stage representation for curriculum-map cells and cohort progression (new column on `CloToPloMap` vs. JSON).
- Stateful CQI/logical status fields beyond the clean single-table forms (may warrant dedicated CQI/CTL tables rather than `FormSubmission.formData` JSON).
- Survey long-guide vs. row-normalized tabulations (JSON now, consider normalized later).
- Portfolio/capstone per-criterion rubric rows — JSON within `FormSubmission` vs. dedicated tables.
- **Archival (schema done, pipeline pending):** implementation follows **after PEO attainment capture** (biennial alumni/employer surveys) — snapshots must include PEO evidence before granular purge. `PeoAttainment` rows (biennial, per `[peoId, termId]`) are the capture records; cluster compile is gated by `GraduationCluster.peoAttainmentCapturedAt`. Open items: object-storage provider for detail artifacts (`ARCHIVE_STORAGE_URL`; S3/MinIO/local in dev); how `graduated`/`graduationTermId` get set (registrar action for now — manual flag, external SIS sync later); DB-level write-blocking trigger as optional hardening; scope of granular purge (keep `PloAttainment`/`class_section`/`enrollment`).