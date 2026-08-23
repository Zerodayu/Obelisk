# Obelisk Backend — System Design

> **Product:** Obelisk — Outcomes-Based Educational Learning and Intelligent System Kit for Jose Maria College Foundation, Inc. (JMCFI)
> **Status:** Backend-first build in progress — **Phase 0 foundation/stabilization complete** (typecheck/lint/bun:test green; forms module, python-server ingest client, and shared validators shipped behind `api/v1`; archival migration applied). Feature phases (1–7) build on this. **Frontend work is deferred until the backend is stable** (see `../roadmap.md`). This doc records the **current state** and the **target design** mapped from the JMCFI OBE forms so future work lands on stable ground.

---

## 1. Architecture & Runtime

- **Runtime:** Bun. **HTTP:** Elysia. **DB:** PostgreSQL via Prisma + Neon driver adapter. **Auth:** better-auth (Google OAuth for new accounts — restricted to the organization's Workspace domain; email/password sign-in kept for existing accounts, new email sign-ups disabled). **Validation:** Elysia `t` (backend) and Zod.
- **Shared plumbing:** `lib/prisma.ts` (single `PrismaClient` singleton with the Neon adapter — shared by auth, forms, and future modules), `lib/forms/state-machine.ts` (pure submission lifecycle rules — status transitions, approval-chain validation, editable states), `lib/validators/` (attainment, root-cause, retention constants), `lib/ingest/ingest-client.ts` (python-server HTTP client), `lib/ingest/csv.ts` (CSV/TSV parsing helpers — delimiter detection, quoted-cell parsing, name/percent coercion), `lib/ingest/score-edit.ts` (pure recompute helpers for score edits — composite recomputation and at-risk reconciliation).
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

`ComputationRun` (`scope`, `formulaVersion` default `70_30_v1`, `directWeight` 0.70, `indirectWeight` 0.30, `etlSnapshotJson Json?` — the raw `{header, attainments, clo_plo_mapping}` written at persist time, so the roll-up feed can reproduce the exact `StudentCLOAttainment` records that produced the run), `CloAttainment` (unique `[classSectionId, cloId, studentId, computationRunId]`, `directScorePct`, `indirectScorePct`, `compositeScorePct`, `isBelowThreshold`, per-assessment-category percentages `exam_pct`, `at_pct`, `tla_pct`, `output_pct` — populated by ETL, consumed by the CAR part-2 assessment-type means; index `[classSectionId, computationRunId]`), `PloAttainment` (unique `[ploId, programId, termId, computationRunId]`, `attainedPct`, `studentsBelowTargetCount`, index `[programId, termId]` for the term-level roll-up feed), `PeoAttainment` (unique `[peoId, termId]`, `attainedPct`, `evidenceJson`, `formSubmissionId?`).

`UploadRecord` (`UploadStatus` queued/completed/failed; `userId`, `classSectionId`, `filename`, optional `etlJobId`/`computationRunId`, `summary Json` carrying the persistence summary, `error`; index `[userId, createdAt]`). One row is created when a user uploads a class record and updated when the ETL job finishes — this is the per-user upload history surfaced by `GET /ingest/history`, and it records failed attempts that never produce a `ComputationRun`.

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

### 2.11 CQI / ACT Loop — `11-cqi.prisma`

**Implemented (Phase 4).** Dedicated stateful tables backing `plo_gap_analysis` → `cqi_action_plan` → `closing_the_loop` (migration `20260820193045_add_cqi_act_models`):

- `GapRow` — one row per NOT-MET PLO × year-level cohort combo: `ploGapAnalysisId` → `FormSubmission` (relation `"GapAnalysisSubmission"`, Cascade), `ploId` → `Plo` (Cascade), `cohortYearLevel Int`, `attainmentPct Decimal(5,2)`, `rootCauseCategory String?`, `rootCauseAnalysis Text?`, `namedOwner String?`, `cqiActionPlanEntryId String?` → `CqiEntry` (SetNull, unique — the F23 link). Indexes `[ploGapAnalysisId]`, `[ploId]`.
- `CqiEntry` — the stateful two-phase action (planned → tracked): `cqiActionPlanId` → `FormSubmission` (relation `"CqiActionPlanSubmission"`, Cascade), `ploId` → `Plo`, `cohortYearLevel Int`, `evidenceSource`, `priorAttainmentPct Decimal(5,2)`, `rootCauseCategory`, `intervention Text`, `owner`, `ownerRole`, `timelineAndKpi`, `status CqiEntryStatus` (planned/tracked), `interventionImplemented InterventionStatus?` (yes/partial/no), `currentAttainmentPct Decimal(5,2)?`. Back-relations: `gapRow GapRow?` (1:1) and `ctlRow CtlRow?`. Indexes `[cqiActionPlanId]`, `[ploId]`.
- `CtlRow` — per-entry loop-closure record: `closingTheLoopId` → `FormSubmission` (relation `"ClosingTheLoopSubmission"`, Cascade), `cqiEntryId String` → `CqiEntry` (unique, Cascade), `gapFindingAndEvidence Text?`, `interventionImplementedText Text?`, `priorAttainmentPct Decimal(5,2)?`, `currentAttainmentPct Decimal(5,2)?`, the five condition booleans `conditions12Met`/`condition3Met`/`condition4Met`/`condition5Met` (default false), `loopStatus LoopStatus` (default `open_reassess`). Index `[closingTheLoopId]`.

**Enums appended to `01-enums.prisma`:** `PloStatus` (all_met, partial, not_met), `LoopStatus` (closed, open_reassess, open_not_implemented), `CqiEntryStatus` (planned, tracked), `InterventionStatus` (yes, partial, no). `Plo` gains `gapRows`/`cqiEntries`; `FormSubmission` gains `gapRows`/`cqiEntries`/`ctlRows`.

### 2.12 PLAN-phase setup forms — `12-plan.prisma`

**Implemented (Phase 5).** Dedicated row tables backing the four PLAN setup forms (migration `20260823170939_add_plan_phase_setup_forms`). Each row set is owned by a `FormSubmission` that carries the document header metadata in `formData.header`; template/fixed rows are flagged (`isTemplate`/`isFixed`) so the service layer can protect them from deletion:

- `PloDirectoryRow` — curriculum_map Section B PLO directory: `curriculumMapId` → `FormSubmission` (relation `"CurriculumMapSubmission"`, Cascade), optional `ploId` → `Plo` (SetNull), `code`, `statement`, `evidenceSources String[]` (exam/rubric/portfolio/capstone/ojt), `dStageCourse String?`, `validationStatus CurriculumValidationStatus` (default pending_review), `sortOrder`.
- `CurriculumCourseRow` — curriculum_map Section C matrix rows grouped by year level: `curriculumMapId`, `yearLevel Int`, `courseCode`, `courseTitle`, `sortOrder`; has many `cells`.
- `CurriculumMapCell` — one cell per course × PLO: `courseRowId` → `CurriculumCourseRow` (Cascade), `ploCode`, optional `ploId` (SetNull), `stage IpdStage?` (i/p/d), `cloCodes String?`; unique `[courseRowId, ploCode]`. The Coverage Check row is computed = any cell in that PLO column has stage `d`.
- `CalendarEventRow` — assessment_calendar event rows across three sections (`CalendarSection`: semester1 / annual_and_semester2 / program_specific): `assessmentCalendarId` (relation `"CalendarSubmission"`), `templateKey String?`, `isTemplate Boolean` (the 17 seeded institutional milestones — editable but non-deletable), `periodWeeks?`, `activity`, `cohortYears Int[]`, `responsibleParty?`, `outputForms String[]` (stable form codes); unique `[assessmentCalendarId, templateKey]`.
- `PloTargetRow` — target_setting_matrix per-PLO benchmark row: `targetSettingMatrixId` (relation `"TargetSettingSubmission"`), optional `ploId`, `ploCode`, `statement?`, `y1–y4TargetPct Decimal(5,2)` (each validated ≥70; rationale required above floor), `rationale Text?`, `sortOrder`.
- `CourseCloTargetRow` — priority-course CLO targets: same owner, `courseCode`, `courseTitle?`, `cloCode`, nullable `y1–y4TargetPct`, `notes?`.
- `BudgetLineItem` — assessment_budget line items grouped by PDCA phase (`PdcaPhase`): `assessmentBudgetId` (relation `"AssessmentBudgetSubmission"`), `name`, `isFixed Boolean` (the 12 seeded institutional items — non-deletable), `estimatedCost Decimal(12,2)` (default 0), `approvedCost Decimal(12,2)?`, `source BudgetSource?` (aqau/dean/vpaa), `notes?`; unique `[assessmentBudgetId, name]`.

**Enums appended to `01-enums.prisma`:** `IpdStage` (i, p, d), `CurriculumValidationStatus` (confirmed, pending_review, needs_update), `CalendarSection`, `PdcaPhase` (plan, do, check, act), `BudgetSource`. `CloToPloMap` gains a nullable `stage IpdStage?` column (attainment-side I-P-D modeling); `Plo` gains back-relations `directoryRows`/`targetRows`/`curriculumCells`; `FormSubmission` gains the six mirrored row relations above.

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
| POST | `/api/v1/ingest/upload` | `auth: true` | Uploads class record, starts ETL, returns `{ jobId }`. Records an `UploadRecord` (`queued`) for the user's history. |
| GET | `/api/v1/ingest/upload/:jobId/status` | `auth: true` | poll an ETL job; on completion triggers persistence and marks the `UploadRecord` `completed`/`failed`. |
| GET | `/api/v1/ingest/history` | `auth: true` | List the current user's upload history (any class section), newest first, including failed attempts. |
| GET | `/api/v1/ingest/attainments` | `auth: true` | List per-student CLO attainment rows (editable roster) for a class section's computation run (latest by default). |
| PUT | `/api/v1/ingest/attainments` | `auth: true` | Manually edit per-student CLO direct scores; recomputes composite/threshold and reconciles at-risk flags (computed, never manual). |
| POST | `/api/v1/ingest/attainments/reimport` | `auth: true` | Re-import scores from a wide-format roster CSV/TSV (`student_name, student_id?, CLO1, CLO2, …`); upserts `CloAttainment` rows and reconciles at-risk flags. |
| POST | `/api/v1/car/generate` | `auth: true` | Ensure the section's CAR draft and assemble all 7 parts; `computationRunId` optional (defaults to the section's latest run). |
| GET | `/api/v1/car` | `auth: true` | List CAR submissions (optional `classSectionId` filter), newest first. |
| GET | `/api/v1/car/:id` | `auth: true` | Assemble a CAR from its submission id (re-derives 2/3/4, merges saved 1/5/6/7). |
| PUT | `/api/v1/car/:id` | `auth: true` | Save editable parts (1/5/6/7 only) into CAR `formData`; allowed while `draft`/`returned`. |
| POST | `/api/v1/rollup/clo-attainment-summary/generate` | `auth: true` | F14 — ensure the section's CLO-summary draft and assemble the full-term per-CLO attainment summary (defaults to the section's latest computation run). |
| GET | `/api/v1/rollup/clo-attainment-summary` | `auth: true` | List CLO attainment summary submissions (optional `classSectionId`/`programId` filter), newest first. |
| GET | `/api/v1/rollup/clo-attainment-summary/:id` | `auth: true` | Re-assemble a CLO summary from its submission id. |
| POST | `/api/v1/rollup/plo-attainment-summary/generate` | `auth: true` | F15 — feed the program+term section ETL snapshots to python-server `/analytics/summary`, persist PLO roll-ups into `PloAttainment` under a fresh `ComputationRun` (`scope plo:<program>:<term>`). |
| GET | `/api/v1/rollup/plo-attainment-summary` | `auth: true` | List PLO attainment summary submissions (optional `programId` filter), newest first. |
| GET | `/api/v1/rollup/plo-attainment-summary/:id` | `auth: true` | Re-run the PLO roll-up for the submission's program+term and return the assembled payload. |
| POST | `/api/v1/rollup/cohort-tracking/generate` | `auth: true` | F16 — assemble the longitudinal per-year-level CLO grid (+ PLO roll-ups) and snapshot it into the program's cohort-tracking submission (**Permanent retention**, audited). |
| GET | `/api/v1/rollup/cohort-tracking` | `auth: true` | List cohort tracking submissions (optional `programId` filter), newest first. |
| GET | `/api/v1/rollup/cohort-tracking/:id` | `auth: true` | Re-assemble a cohort tracking sheet from its submission id. |
| PUT | `/api/v1/rollup/cohort-tracking/:id` | `auth: true` | Save CQI follow-up annotations into the sheet's `formData` (**audited**); `draft`/`returned` only. |
| POST | `/api/v1/cqi/plo-gap-analysis/generate` | `auth: true` | F22 — ensure the program+term gap-analysis draft and assemble per-PLO per-cohort attainment, reconciling one `GapRow` per NOT-MET PLO-cohort combo. |
| GET | `/api/v1/cqi/plo-gap-analysis` | `auth: true` | List gap-analysis submissions (optional `programId` filter), newest first. |
| GET | `/api/v1/cqi/plo-gap-analysis/:id` | `auth: true` | Re-assemble a gap analysis from its submission id. |
| PUT | `/api/v1/cqi/plo-gap-analysis/:id` | `auth: true` | Save gap-row edits (6-category root cause validated) + program-chair summary; `draft`/`returned` only. |
| POST | `/api/v1/cqi/cqi-action-plan/generate` | `auth: true` | F23 — create one planned `CqiEntry` per open (unlinked) gap row and link it, starting the two-phase CQI lifecycle. |
| GET | `/api/v1/cqi/cqi-action-plan` / `:id` | `auth: true` | List / re-assemble CQI action plan submissions. |
| PUT | `/api/v1/cqi/cqi-action-plan/:id` | `auth: true` | Save CQI entry edits (specific intervention, owner, timeline & KPI); `draft`/`returned` only. |
| PUT | `/api/v1/cqi/cqi-action-plan/:id/track` | `auth: true` | End-of-cycle tracking — flip entries to `tracked` with `interventionImplemented` (yes/partial/no) + `currentAttainmentPct`. |
| POST | `/api/v1/cqi/closing-the-loop/generate` | `auth: true` | F25 — open one `CtlRow` per tracked CQI entry (5 condition flags, loop status hard-computed). |
| GET | `/api/v1/cqi/closing-the-loop` / `:id` | `auth: true` | List / re-assemble CTL submissions. |
| PUT | `/api/v1/cqi/closing-the-loop/:id` | `auth: true` | Save CTL rows (condition flags + evidence) + the mandatory Identify step; loop status recomputed server-side; `draft`/`returned` only. |
| POST | `/api/v1/cqi/annual-program-report/generate` | `auth: true` | APAR — assemble the 11-KPI performance dashboard (computed: overall PLO + cohort Y1-4 CLO + CQI completion; benchmark 70). |
| GET | `/api/v1/cqi/annual-program-report` / `:id` | `auth: true` | List / re-assemble APAR submissions. |
| PUT | `/api/v1/cqi/annual-program-report/:id` | `auth: true` | Save APAR attachments/narratives/dashboard entries; **submission gate** blocks until the Cohort Tracking Sheet is attached + an approved `cohort_tracking` submission exists for the program. |
| POST | `/api/v1/plan/curriculum-map/init` | `auth: true` | F01 — ensure the program's curriculum-map draft and return its assembled payload. |
| GET | `/api/v1/plan/curriculum-map` / `/:id` | `auth: true` | List (optional `programId` filter) / re-assemble curriculum-map submissions; Coverage Check row computed per PLO (any cell with I-P-D stage D). |
| PUT | `/api/v1/plan/curriculum-map/:id` | `auth: true` | Full-replace PLO directory rows + year-grouped course matrix cells (I-P-D stage per cell); header merged into `formData`; `draft`/`returned` only. |
| POST | `/api/v1/plan/assessment-calendar/init` | `auth: true` | F03 — ensure the calendar draft and seed the 17 institutional template rows (9 Semester 1 + 8 Annual/Sem2) once. |
| GET | `/api/v1/plan/assessment-calendar` / `/:id` | `auth: true` | List / re-assemble calendar submissions (template flags included). |
| PUT | `/api/v1/plan/assessment-calendar/:id` | `auth: true` | Patch event rows (dates editable) and add program-specific events; template rows are **non-deletable** (`PlanTemplateProtectedError`); `draft`/`returned` only. |
| POST | `/api/v1/plan/target-setting-matrix/init` | `auth: true` | F04 — ensure the matrix draft and seed one 70%-default target row per program PLO. |
| GET | `/api/v1/plan/target-setting-matrix` / `/:id` | `auth: true` | List / re-assemble matrix submissions; Program PLO Avg bottom row computed per year level. |
| PUT | `/api/v1/plan/target-setting-matrix/:id` | `auth: true` | Full-replace PLO + course-CLO target rows; **≥70% hard floor enforced** and rationale required above floor (`TargetBelowFloorError`/`MissingRationaleError`); `draft`/`returned` only. |
| POST | `/api/v1/plan/assessment-budget/init` | `auth: true` | F06 — ensure the budget draft and seed the 12 fixed line items grouped by PDCA phase once. |
| GET | `/api/v1/plan/assessment-budget` / `:id` | `auth: true` | List / re-assemble budget submissions; TOTAL row computed (estimated + approved). |
| PUT | `/api/v1/plan/assessment-budget/:id` | `auth: true` | Patch line-item costs/source/notes and add program-specific items; fixed items are **non-deletable**; `draft`/`returned` only. |
| GET | `/api/v1/ingest/jobs/:jobId` | `auth: true` | poll a python-server ETL job (raw; deprecated) |
| GET | `/openapi` | — | OpenAPI docs |

> **Status machine** (enforced in `lib/forms/state-machine.ts`): `draft → submitted → returned → approved → archived`. `returned` is re-submittable; edits are restricted to `draft`/`returned`; approval chains must ascend the canonical role order (`program_chair → dean → aqau → vpaa`, skipping allowed). Every lifecycle action writes an `AuditLog` row (`forms` module).

### Planned (feature plugins, one per module mirroring the form catalog)

Per feature module `src/v1/{feature}/{controller,service,model}.ts`, mounted in `routes.ts`:

- `forms` — form CRUD, submit, approval actions, computed-field resolution, auto-population across related forms.
- `attainment` — run `ComputationRun`, compute CLO/PLO attainment, diagnostics (divergence, at-risk).
- `survey` — survey/feedback tabulation (indirect evidence).
- `rollups` — cohort/program rollup + longitudinal (`cohort_tracking`) **implemented** (F14/F15/F16 under `/api/v1/rollup`); dashboards + report exports remain planned.
- `monitoring` — audit-trail queries, systemic-gap trigger, CAPA lifecycle.

## 5. Form Catalog & Data Mapping (target)

Each row: **stable code → title → primary models → status / rules to enforce.**

| Stable code | Form title | Primary models | Notes / rules |
| --- | --- | --- | --- |
| `curriculum_map` | CLO-PLO Curriculum Map | `Program`, `Plo`, `Clo`, `CloToPloMap`, `FormSubmission`, `PloDirectoryRow`, `CurriculumCourseRow`, `CurriculumMapCell` | **Implemented (Phase 5).** Dynamic PLO directory + year-grouped course matrix (I-P-D stage per cell); **Coverage Check** computed = any cell in a PLO column has I-P-D stage *D*. I-P-D also modeled on `CloToPloMap.stage` for the attainment side. |
| `portfolio_roadmap` | Portfolio Roadmap and Rubric Standards | `Program`, `Plo`, `FormSubmission` (`formData`) | Reusable Year Roadmap (×4) + Rubric Criterion Block (×10); rubric weight **TOTAL must = 100%**. |
| `assessment_calendar` | Assessment Calendar with Cohort Tracking Milestones | `AcademicTerm`, `FormSubmission`, `CalendarEventRow` | **Implemented (Phase 5).** 17 pre-seeded template rows (9 Semester 1 + 8 Annual/Sem2 institutional milestones) — dates editable, rows non-deletable; program-specific events fully free-form. |
| `target_setting_matrix` | Target-Setting Matrix | `Plo`, `FormSubmission`, `PloTargetRow`, `CourseCloTargetRow` | **Implemented (Phase 5).** Seeded per-PLO target rows at the 70% default; **each target ≥70% hard floor**, rationale required above floor; Program PLO Avg bottom row computed per year level. |
| `stakeholder_consultation` | Stakeholder Consultation Records | `Program`, `Plo`, `FormSubmission` | Fixed stakeholder groups (Faculty/Students/Alumni/Industry/PAC); PLO retain/revise/escalate decisions. |
| `assessment_budget` | Approved Assessment Budget | `FormSubmission`, `BudgetLineItem` | **Implemented (Phase 5).** 12 fixed line items grouped by PDCA phase (11 named in the manual + Contingency/Miscellaneous) — non-deletable and extendable with program-specific items; TOTAL row computed. Mirrored downstream by `resource_monitoring`. |
| `clo_raw_data` | Per-Student CLO Raw Data Sheet | `ClassSection`, `Course`, `Clo`, `AssessmentItem`, `StudentScore`, `Student`, `Enrollment`, `FormSubmission` | **Primary data-capture form.** CSV/Excel import path; **At-Risk auto-flag if any CLO <70%** (do not accept manual checkbox). |
| `mid_cycle_attainment` | Mid-Cycle CLO Attainment Summary | `CloAttainment`, `AtRiskFlag`, `FormSubmission` | Reusable Cohort Attainment Block (×4); status vs ≥70% floor (MET/Early Warning/NOT MET); **At-Risk watchlist** sub-table. |
| `resource_monitoring` | Resource Acquisition and Implementation Monitoring | `FormSubmission`, refs `assessment_budget` + `cqi_action_plan` | Mirrors budget line items (Acquired/Pending/Not Acquired/N/A); tracks CQI action implementation (Fully/Partially/Not Yet). |
| `peer_observation` | Peer Observation Record | `FormSubmission` | 7 fixed criteria, each with its own rating scale + Evidence Observed text. |
| `exhibition_feedback` | Portfolio Exhibition Industry Feedback | `FormSubmission` | **Min 3 industry guests (validation);** per-PLO rating (0-10) × guests, Mean computed; OVERALL MEAN computed. |
| `clo_perception_survey` | CLO Achievement Perception Survey Tabulation | `FormSubmission`, refs direct attainment | 5-pt Likert tabulation; Mean + % rating 4+5 computed (target ≥80%); **divergence auto-flag** vs direct CLO attainment. |
| `course_assessment_report` | Course Assessment Report (CAR) | `FormSubmission`, `CloAttainment`, `PloAttainment`, `AtRiskFlag` | **Hub form, 7 parts.** Part 2 rolls up assessment-category means (`exam`/`rubric`/`perf.tasks`/`portfolio` vs ≥70%); Part 3 auto-populates from stored attainment grouped by year-level cohort; Part 4 at-risk watchlist derives from `isBelowThreshold`; Part 5 CQI entries feed `plo_gap_analysis`/`cqi_action_plan`. Effects: `ensureDraft` + `generate` + `save` (parts 1/5/6/7 only), `generateFromSubmission`. |
| `clo_attainment_summary` | CLO Attainment Summary (Full Term) | `CloAttainment`, `FormSubmission` | **Implemented (F14).** Per section: assembles the full-term per-CLO attainment (category means + composite vs ≥70%) from the section's computation run, groupable by year-level cohort; snapshots `computed {generatedAt, summary, rows}` into `formData` and audits. Effects: `ensureDraft`, `generate`/`generateFromSubmission`. |
| `plo_attainment_summary` | PLO Attainment Summary | `PloAttainment`, `ComputationRun`, `FormSubmission` | **Implemented (F15).** Per program+term: feeds the program's section `etlSnapshotJson` to python-server `/analytics/summary` (Formula 7A/7C + Rule 3 — never re-implemented locally), persists the returned PLO roll-ups into `PloAttainment` under a fresh `ComputationRun` (`scope plo:<program>:<term>`), reports status vs each PLO's `targetAttainmentPct` and the students-below-target count; snapshots `computed` + audits. |
| `cohort_tracking` | Cohort CLO/PLO Attainment Tracking Sheet | `Plo`, `PloAttainment`, `CloAttainment`, `ComputationRun`, `FormSubmission` | **Implemented (F16). Permanent retention + strict audit trail.** Longitudinal per-year-level CLO grid (Year 1-4), Trend (↑/↓/→) computed from consecutive term averages, CQI-triggered flag when any CLO in the latest term is NOT MET, plus stored PLO roll-ups; `generate` snapshots `computed {generatedAt, lines, plos}` and `save` merges CQI annotations into `formData` — every write audits. Cited by many later forms. |
| `student_exit_survey` | Student Exit Survey Tabulation | `FormSubmission` | Response rate target ≥70%; tabulation by PLO × cohort; divergence flag OK/FLAG. |
| `portfolio_assessment_record` | Portfolio Assessment Record with CLO Evidence | `FormSubmission` | Assessor panel (2 faculty + industry where required); rubric consensus score; attainment % computed. |
| `capstone_panel_evaluation` | Capstone/Culminating Panel Evaluation | `FormSubmission` | **Min 2 faculty + 1 industry panelist (validation);** 10-pt PLO scoring; consensus + attainment computed; Program-Readiness declaration. |
| `alumni_tracer` | Alumni Tracer Study Report | `FormSubmission` | 5 fixed employment indicators; PLO sufficiency ratings (target ≥70%, insufficiency flag ≥30%); **biennial**. |
| `employer_satisfaction_survey` | Employer Satisfaction Survey | `FormSubmission` | ≥10 employers targeted; PLO competency ratings (target ≥70%); **biennial**. |
| `plo_gap_analysis` | PLO Attainment Report with Gap Analysis | `PloAttainment`, `FormSubmission`, `GapRow` | **Implemented (Phase 4).** One `GapRow` per NOT-MET PLO-cohort combo; 6-category root cause; links CQI entries via `cqiActionPlanEntryId`. Derives per-PLO-per-cohort attainment from stored `CloAttainment` (through the CLO→PLO map + `student.year_level`), reconciles `GapRow` rows on regenerate, validates the 6-category root cause on save, snapshots `computed` + audits. Effects: `ensureDraft`, `generate`/`generateFromSubmission`, `save`. |
| `cqi_action_plan` | CQI Action Plan | `FormSubmission` (stateful lifecycle) + `CqiEntry` + `GapRow` | **Implemented (Phase 4).** Two-phase lifecycle (planned this cycle → tracked next). `generate` creates one planned `CqiEntry` per open `GapRow` and links them; `track` flips entries to `tracked` with `interventionImplemented` + `currentAttainmentPct`. **Modeled as a stateful record per entry** (`CqiEntry.status`), not a static document. Feeds `resource_monitoring` §3 + `closing_the_loop`. |
| `annual_program_report` | Annual Program Assessment Report (APAR) | `FormSubmission` | **Implemented (Phase 4).** 9 fixed attachments; 11-KPI dashboard computed (`overall_plo_attainment`, `y1–y4_cohort_clo_attainment`, `cqi_action_completion_rate` computed; remaining KPIs manual, all benchmarked ≥70% + auto MET/NOT MET); **validation gate: blocked if `cohort_tracking` absent** (enforced via submit-gate in `lib/forms/submit-gates.ts`). Due June 30. |
| `closing_the_loop` | Closing-the-Loop (CTL) Report | `FormSubmission`, `CqiEntry`, `CtlRow` | **Implemented (Phase 4).** One `CtlRow` per tracked `CqiEntry`; **Loop Status hard-computed**: CLOSED only if all 5 conditions Yes; else OPEN-Re-assess / OPEN-Not Implemented (computed by `computeLoopStatus`, never a free field). Mandatory Identify step (4 prompts) saved to `formData`. |
| `systemic_gap_report` | Systemic Gap Report | `FormSubmission` | **Trigger: 3 consecutive NOT-MET cycles (from `cohort_tracking`).** Due = trigger + 30 days (auto-computed). Structural response + CAPA outline. |
| `capa_plan` | Corrective and Preventive Action Plan | `FormSubmission` | Refs system-gap report; actions/milestones (≤8); AQAU progress monitoring; closure when benchmark sustained 2+ cycles. |
| `institutional_review` | Institutional Management Review | `FormSubmission` | Program APAR review summary; institutional CQI completion rate (target ≥70%); decisions D1-D5; July 15. |

### Provisional mapping note

The manual's provisional form IDs (`F01`–`F28`) map 1:1 onto the stable codes in the order listed above (e.g., `F07 = clo_raw_data`). Do not store the `F##` values in data or code — they are source-document cross-references only and can change.

### Not-yet-developed forms (no code, no field structure)

Treated as future/placeholder topics only — do not fabricate codes: portfolio/consolidation schedules and specialty forms without a defined field structure in the manual (the manual itself marks several early `F##` numbers as referenced-not-defined). Confirm scope with the product owner before designing.

## 6. Cross-Form Data Flow

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

**Implemented (Phase 3):** `clo_attainment_summary` (F14, per section) → `plo_attainment_summary` (F15, per program+term, feeds registered section `etlSnapshotJson` + persists `PloAttainment`) → `cohort_tracking` (F16, longitudinal, Permanent retention).

**Implemented (Phase 4):** `plo_gap_analysis` (F22, gap rows per NOT-MET PLO × cohort, reconciled on regenerate) → `cqi_action_plan` (F23, planned `CqiEntry` per open gap → `track` flips to tracked at end of cycle) → `closing_the_loop` (F25, per-entry `CtlRow`, CLOSED only when all five conditions hold). `annual_program_report` (APAR) is gated on an approved `cohort_tracking` submission (validate + gate in `lib/forms/submit-gates.ts`).

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
- **`ingest-service`** *(src/v1/ingest/service.ts)* — `IngestService.startUpload` records an `UploadRecord` (`queued`) then forwards the file to python-server; `getJobStatus` polls the ETL job, triggers persistence once, and marks the matching `UploadRecord` `completed` (with `computationRunId` + persistence `summary`) or `failed`; `listHistory` returns the current user's upload records (any class section) newest first.
- **`attainment-service`** *(src/v1/ingest/service.ts)* — `AttainmentService.persistAttainment`: takes a completed ETL job result, creates a `ComputationRun` (70/30 weights), then iterates through attainment records to find or create `Student` rows, create the corresponding `CloAttainment` records (persisting the per-assessment-category percentages `exam_pct`/`at_pct`/`tla_pct`/`output_pct` as 0–100), and auto-flag at-risk students (below the ≥70% threshold) via `AtRiskFlag`. Also exposes the editable-roster flows: `listAttainments` (returns the per-student CLO attainment rows for a class section's computation run, each with its student, CLO, scores, and at-risk state), `updateScores` (manually edits direct scores, recomputes `compositeScorePct` via `direct×0.70 + indirect×0.30` and `isBelowThreshold`, and reconciles `AtRiskFlag` rows — computed, never manual), and `reimportScores` (parses a wide-format roster CSV/TSV via `lib/ingest/csv.ts`, finds-or-creates students by student id or normalized name, upserts the matching `CloAttainment` rows, and reconciles at-risk flags).
- **`car-service`** *(src/v1/car/service.ts)* — `CarService.buildPart1/2/3/4/5/6/7`: assembles the 7-part CAR by rolling up the section's stored `CloAttainment` rows from the computation run into a Decimal-free `NormalizedRow` shape. `ensureDraft` find-or-creates the `course_assessment_report` form type and the section's CAR submission (recording `computationRunId`); `generate` derives parts 2/3/4 live (assessment-category means vs the ≥70% floor, year-level cohort summaries, at-risk watchlist) and merges saved parts 1/5/6/7 from `formData`; `save` writes those parts (guarded: idempotent JSON merge, root-cause categories validated, `draft`/`returned` only, `AuditLog` written); `generateFromSubmission` reassembles a CAR from a submission id.
- **`rollup-service`** *(src/v1/rollup/{service,compute,controller}.ts)* — the roll-up chain F14→F15→F16:
  - `compute.ts` — pure cohort primitives (no DB): `cohortMeanPct`, `trendBetween` (↑/↓/→), `cohortCqiTriggered`, `attainmentStatus`, `buildCohortLines` (groups per-year-level entries into chronological terms, sorts rows by CLO code, computes per-term average, trend across the last two terms, flags the latest term's NOT-MET) —
  - `CloSummaryService` F14 — per section: `ensureDraft`/`generate` assemble full-term per-CLO attainment rows (`buildCloRows`, category means + composite via `aggregateClo`, below-benchmark vs ≥70%, level), snapshot `computed` into the submission's `formData`, audit `clo_attainment_summary.generated`.
  - `PloSummaryService` F15 — per program+term: links each section's **latest** `ComputationRun.etlSnapshotJson` into `AnalyticsCourseSubmission`s, POSTs to python-server `/analytics/summary` (never re-implementing Formula 7A/7C), then `persistPloAttainment` writes a fresh `ComputationRun` (`scope plo:<program>:<term>`) + `PloAttainment.createMany` (per-PLO attained %, students-below-target from stored `CloAttainment`), snapshot `computed` + audit `plo_attainment_summary.generated`. The fetcher is constructor-injectable (`AnalyticsSummaryFetcher`) for test stubbing.
  - `CohortTrackingService` F16 — per program (optionally scoped to a term): builds the longitudinal year-level CLO grid from stored `CloAttainment` (`buildCohortEntries` → `buildCohortLines`) plus stored `PloAttainment`, snapshot `computed {generatedAt, lines, plos}` + audit `cohort_tracking.generated`; `save` merges CQI annotations (guarded `draft`/`returned`, audit `cohort_tracking.annotations_saved`). **Permanent retention + strict audit.**
  - `listRollupSubmissions` / `ensureRollupFormType` (race-safe `clo_attainment_summary` seq 14, `plo_attainment_summary` seq 15, `cohort_tracking` seq 16, `pdcaStage` CHECK) / `snapshotFormData` / module-level `audit` shared by the three services.
- **`cqi-service`** *(src/v1/cqi/{service,compute,controller}.ts)* — the CQI / ACT loop F22→F23→F25 + APAR (`cqi-plugin`, `pdcaStage` ACT):
  - `compute.ts` — pure, DB-free checks: `computeCohortAttainment` (per-PLO per-cohort mean from composite scores, `ploStatus` all_met/partial/not_met), `computeGapCandidates` (one per NOT-MET cohort), `computeLoopStatus` (CLOSED only when all five conditions hold; implemented=no or blank text → `open_not_implemented`; else `open_reassess`), `computeDashboardStatus` (MET/NOT MET vs benchmark).
  - `PloGapAnalysisService` F22 — per program+term: derives per-PLO-per-cohort attainment from stored `CloAttainment` (via `clo.cloToPloMaps[].plo` + `student.yearLevel`), reconciles `GapRow` rows on regenerate (drops unlinked rows that are no longer gaps, keeps CQI-linked rows), `save` validates the 6-category root cause + merges the program-chair summary, snapshot `computed {generatedAt, plos, gaps}` + audit `plo_gap_analysis.generated`/`.gaps_saved`.
  - `CqiActionPlanService` F23 — `generate` creates one planned `CqiEntry` (evidence `F22 Gap Analysis Matrix`, root cause carried from the gap) per open gap row and links `gapRow.cqiActionPlanEntryId`; `save` edits entries (specific intervention, owner, timeline & KPI); `track` flips to `tracked` with `interventionImplemented` (yes/partial/no) + `currentAttainmentPct`; audits `cqi_action_plan.generated`/`.entries_saved`/`.tracked`.
  - `ClosingTheLoopService` F25 — `generate` opens one `CtlRow` per **tracked** CQI entry without a row (condition flags false, loop status computed); `save` recomputes `loopStatus` via `computeLoopStatus` from the merged condition flags + `interventionImplemented` + implemented text (never accepts a manual CLOSED) and persists the Identify step (4 prompts) into `formData`; audits `closing_the_loop.generated`/`.rows_saved`.
  - `AnnualProgramReportService` APAR — `generate` computes the 11-KPI dashboard (`overall_plo_attainment`, `y1–y4_cohort_clo_attainment` from per-year cohort means, `cqi_action_completion_rate` from tracked entries; remaining KPIs manual; each benchmarked 70 with `computeDashboardStatus`), snapshots `computed`, audits `annual_program_report.generated`; `save` merges attachments/narratives/dashboard; `latestTermWithData` picks the newest term with stored data when `termId` is omitted. **Submit gate** (module-registered via `lib/forms/submit-gates.ts`): APAR blocks submission unless `formData.attachments.cohort_tracking` is set **and** an approved `cohort_tracking` `FormSubmission` exists for the program.
  - Shared: `ensureCqiFormType` (race-safe `plo_gap_analysis` seq 17, `cqi_action_plan` seq 18, `annual_program_report` seq 19, `closing_the_loop` seq 20, `pdcaStage` ACT) / `listCqiSubmissions` / `snapshotFormData` / module-level `cqiAudit` (moduleAffected `cqi`).
- **`plan-service`** *(src/v1/plan/{service,compute,controller}.ts)* — the four PLAN-phase setup forms F01/F03/F04/F06 (`plan-plugin`, `pdcaStage` PLAN):
  - `compute.ts` — pure, DB-free helpers: `coverageCheck` (curriculum-map Coverage Check per PLO = any cell with stage `d`), `programPloAverages` (per-year Program PLO Avg row), `assertPloTargetsValid` (≥70% hard floor via `MIN_ATTAINMENT_PCT` + rationale-required-above-floor; throws `TargetBelowFloorError`/`MissingRationaleError`), `budgetTotals` (estimated/approved TOTAL row).
  - `CurriculumMapService` F01 — `init` ensures the program's draft; `save` full-replaces directory rows + course rows (+ cells) in a transaction, linking `ploId` by code; header merged into `formData.header`; audits `.initialized`/`.saved`.
  - `AssessmentCalendarService` F03 — `init` seeds the 17 institutional template rows once (unique `[assessmentCalendarId, templateKey]`); `save` patches by id / creates program-specific events / removes only non-template rows (`PlanTemplateProtectedError` otherwise); unknown event ids rejected.
  - `TargetSettingMatrixService` F04 — `init` seeds one 70%-default target row per program PLO; `save` validates every row through `assertPloTargetsValid`, then full-replaces PLO + course-CLO target rows.
  - `AssessmentBudgetService` F06 — `init` seeds the 12 fixed line items (11 manual-named + Contingency/Miscellaneous, grouped plan/do/check/act); `save` patches costs/source/notes, adds program-specific items (default phase `plan`), and protects fixed items from removal.
  - Shared: `ensurePlanFormType` (race-safe `curriculum_map` seq 1, `assessment_calendar` seq 3, `target_setting_matrix` seq 4, `assessment_budget` seq 6, `pdcaStage` PLAN) / `ensureDraft` (find-or-create per formType+program+term, reusing editable/submitted/approved submissions) / `listPlanSubmissions` / `mergeFormData` / `assertEditable` / module-level `planAudit` (moduleAffected `plan`).

### Planned
- **`at-risk-service`** — derives `AtRiskFlag` from `CloAttainment.isBelowThreshold`; no manual writes.
- **`dashboard/rollup-service`** — institutional completion-rate and cross-program analytics (the per-program APAR KPIs ship with `cqi-service`).
- **`archival-service`** *(schema complete + migration applied; pipeline pending)* — graduation-cluster archival lifecycle. **Must run after PEO attainment capture** (biennial alumni/employer surveys) so compiled snapshots include PEO evidence:
  1. **Auto-create** at end of AY (June 30 / July 15 cycle): per program, find students whose `graduationTermId` = the closing term (graduates + `transferred_out`/`withdrawn`) → create `GraduationCluster(status=open)` listing candidates; nothing locked.
  2. **Confirm to compile** (`aqau`/`system_admin`): blocked until `peoAttainmentCapturedAt` is set; set `compiling`; per student in a transaction — (a) compile snapshot from lifetime `CloAttainment`/`PloAttainment`/`AtRiskFlag`/`FormSubmission` plus **PEO attainment** (`PeoAttainment` → entry `peoAttainment` column) into `compiledData`; (b) export full granular detail to a `detailArtifactUrl` (configurable storage); (c) purge granular hot rows (`StudentScore`, per-student `CloAttainment`, `AtRiskFlag`, detached `FormSubmission.formData`) while keeping `PloAttainment` + `class_section`/`enrollment`; (d) write `GraduationClusterEntry` + `AuditLog`.
  3. **Lock read-only**: set cluster `archived`. Writes to `GraduationClusterEntry` are rejected — service guard (GET-only endpoints) as primary, optional Postgres trigger as defense-in-depth. Archived entries are permanent and viewable via `GET` only.

## 8. External Services

- **`python-server/`** — the authoritative pure-compute engine for spreadsheet-derived attainment (FastAPI, port 8000; no DB, no auth). It parses class-record `.xlsx` (Formula 1A direct CLO attainment, 4-tier levels, Rule-1 completeness) and provides program/department/AVP rollups (Formulas 2A/7A/7C) + AI CQI recommendations. Docs: `../python-server/AGENTS.md`, `../python-server/SYSTEM-DESIGN.md`, `../python-server/documentations/INTEGRATION.md`.

  **Ownership boundary (see `python-server/SYSTEM-DESIGN.md` §7):** this backend is the **sole persister** — it stores python-server's results into `CloAttainment`/`PloAttainment`/`ComputationRun` (recording formula version/weights) and performs all auth/RBAC, approvals, form lifecycle, audit, exports. It must **not** re-implement Formula 1A or the rollups. It calls python-server via `POST /upload` → poll `GET /jobs/{job_id}`, then the `attainment-service` persists the results directly to the `CloAttainment` table; the `rollup-service` additionally calls the synchronous `POST /analytics/summary` (via `lib/ingest/ingest-client.ts` `analyticsSummary`, no auth/polling) during F15 generation.

## 9. Deferred / Open Questions

- **Build strategy: backend-first.** All backend feature phases (forms, ingest, rollups, CQI, archival) are built and stabilized (typecheck + lint + bun:test green) before any frontend work resumes; see `../roadmap.md` for the tracking. **Phase 0 is complete**; the archival migration is applied, so DB integration tests now run against the live dev database.
- I-P-D stage representation for curriculum-map cells and cohort progression (new column on `CloToPloMap` vs. JSON). — **RESOLVED in Phase 5:** nullable `IpdStage` enum column on `CloToPloMap` (attainment side) plus `IpdStage?` on `CurriculumMapCell` (curriculum-map cells).
- Stateful CQI/logical status fields beyond the clean single-table forms (may warrant dedicated CQI/CTL tables rather than `FormSubmission.formData` JSON). — **RESOLVED in Phase 4:** dedicated `gap_row` / `cqi_entry` / `ctl_row` tables adopted (see §2.11).
- Survey long-guide vs. row-normalized tabulations (JSON now, consider normalized later).
- Portfolio/capstone per-criterion rubric rows — JSON within `FormSubmission` vs. dedicated tables.
- **Archival (schema done, pipeline pending):** implementation follows **after PEO attainment capture** (biennial alumni/employer surveys) — snapshots must include PEO evidence before granular purge. `PeoAttainment` rows (biennial, per `[peoId, termId]`) are the capture records; cluster compile is gated by `GraduationCluster.peoAttainmentCapturedAt`. Open items: object-storage provider for detail artifacts (`ARCHIVE_STORAGE_URL`; S3/MinIO/local in dev); how `graduated`/`graduationTermId` get set (registrar action for now — manual flag, external SIS sync later); DB-level write-blocking trigger as optional hardening; scope of granular purge (keep `PloAttainment`/`class_section`/`enrollment`).