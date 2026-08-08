# Obelisk Backend — Agent Guide

**Product:** Obelisk — Outcomes-Based Educational Learning and Intelligent System Kit for **Jose Maria College Foundation, Inc. (JMCFI)**.
**Stack:** Bun runtime · Elysia (HTTP) · Prisma + PostgreSQL (Neon driver adapter) · better-auth · Zod validation.

This backend digitizes the JMCFI WIN-OBE **forms** (the paper/manual OBE assessment forms) as structured records with computed attainment fields, an approval workflow, audit trail, and program-level rollups.

## File Structure

Routes follow a feature-module pattern (see <https://github.com/Zerodayu/bun-elysia-app>):

```
src/
├── index.ts              # Elysia app entry point
├── routes.ts             # Aggregates all feature route plugins (api/v1 prefix)
└── v1/
    ├── auth/             # Auth (better-auth config, session guard macro, role requests)
    └── {feature}/
        ├── controller.ts # Route definitions (Elysia plugin with prefix + tags)
        ├── service.ts    # Business logic (class with methods)
        └── model.ts      # Validation schemas using Elysia's t + Static types
```

## Conventions

- **controller.ts**: Define routes as an Elysia plugin with `prefix` and `tags`. Mount auth guard via `.use(authPlugin)`, then guard individual routes with `{ auth: true }`. Use `detail` for OpenAPI descriptions.
- **service.ts**: Class-based business logic. One class per feature. Throws on errors; controller handles status codes.
- **model.ts**: Validation schemas using Elysia's `t` from `elysia`. Export both schema objects and `Static<typeof ...>` types.
- **routes.ts**: Import and chain feature plugins: `.use(featureRoutes)`. The `api/v1/` prefix is set here, so feature routes use relative paths.
- **env vars**: Always import `env` from `@env` instead of accessing `process.env` directly. The `env.ts` file uses Zod validation, so missing vars fail at startup with a clear error.

## Domain Rules (canonical — do not violate)

These are institutional rules from the OBE manual and the forms implementation reference. Enforce them in services, not the client. See `SYSTEM-DESIGN.md` for the authoritative mapping.

- **≥70% hard floor** — every attainment target/benchmark (program, cohort, CLO, PLO, KPI) validates to at least 70%. Shared validator lives in the service layer.
- **Composite attainment formula** — `Direct × 70% + Indirect × 30%`. Mirrors default `directWeight = 0.70` / `indirectWeight = 0.30` on `ComputationRun`.
- **At-risk auto-flag** — a student is at-risk if *any* CLO score `< 70%`. Computed, never manually entered (see `CloAttainment.isBelowThreshold`, `AtRiskFlag`).
- **Loop Status is computed, not a free field** — the Closing-the-Loop (CTL) report may only mark a CQI loop `CLOSED` when all five documented conditions are met; otherwise it is `OPEN - Re-assess` or `OPEN - Not Implemented`. Do not accept a manually-forced CLOSED value.
- **APAR validation gate** — the Annual Program Report is blocked from submission if the Cohort Tracking Sheet is not attached.
- **Approval chains** descend by role: `faculty → program_chair → dean → aqau → vpaa` (exact chain varies by form; see `FormSubmission.currentApproverRole` + `ApprovalStep`).
- **Retention classes** — forms are either `5 years` or `Permanent` retention. Permanent-retention records (longitudinal/audit: cohort tracking, APAR, CTL, system gap, CAPA, institutional review) also carry a strict audit-trail requirement.
- **Repeated 6-category root cause** (used by gap/CQI/systemic analysis): `1-Curriculum Design | 2-Instruction & Pedagogy | 3-Assessment Design | 4-Student Factors | 5-Resources & Tools | 6-Industry & Field Alignment`. Model as a type/enum constant, not free text.

## Form Identification

The manual references forms by ephemeral IDs (`F01`, `F02`, ... `F28`). **These IDs are provisional and may change when the manual is revised — never rely on them in code, DB, or documentation.**

Refer to forms by either:
1. **the form title**, or
2. the **stable snake_case code** (maps directly to `FormType.code`).

Stable codes (defined in `SYSTEM-DESIGN.md`):

```
curriculum_map            -> CLO-PLO Curriculum Map
portfolio_roadmap         -> Portfolio Roadmap and Rubric Standards
assessment_calendar       -> Assessment Calendar with Cohort Tracking Milestones
target_setting_matrix     -> Target-Setting Matrix
stakeholder_consultation  -> Stakeholder Consultation Records
assessment_budget         -> Approved Assessment Budget
clo_raw_data              -> Per-Student CLO Raw Data Sheet
mid_cycle_attainment      -> Mid-Cycle CLO Attainment Summary
resource_monitoring       -> Resource Acquisition and Implementation Monitoring
peer_observation          -> Peer Observation Record
exhibition_feedback       -> Portfolio Exhibition Industry Feedback Record
clo_perception_survey     -> CLO Achievement Perception Survey Tabulation
course_assessment_report  -> Course Assessment Report (CAR)
clo_attainment_summary    -> CLO Attainment Summary (Full Term)
plo_attainment_summary    -> PLO Attainment Summary
cohort_tracking           -> Cohort CLO/PLO Attainment Tracking Sheet
student_exit_survey       -> Student Exit Survey Tabulation
portfolio_assessment_record -> Portfolio Assessment Record with CLO Evidence
capstone_panel_evaluation -> Capstone/Culminating Panel Evaluation Sheet
alumni_tracer             -> Alumni Tracer Study Report
employer_satisfaction_survey -> Employer Satisfaction Survey Report
plo_gap_analysis          -> PLO Attainment Report with Gap Analysis Matrix
cqi_action_plan           -> CQI Action Plan
annual_program_report     -> Annual Program Assessment Report (APAR)
closing_the_loop          -> Closing-the-Loop (CTL) Report
systemic_gap_report       -> Systemic Gap Report
capa_plan                 -> Corrective and Preventive Action (CAPA) Plan
institutional_review      -> Institutional Management Review Records
```

**Not-yet-developed forms** (portfolio/consolidation/specialty schedules; no field structure defined yet) have **no stable code** — represent them as titles/topics only, and do not fabricate values.

## Build Priority

**Backend-first strategy:** the whole backend is built and stabilized before any frontend work resumes (frontend work is consolidated in `../roadmap.md` under a deferred section). When implementing forms incrementally, follow this order (rationale in `SYSTEM-DESIGN.md`):

0. **Foundation/stabilization** — `tsconfig` fix (moduleResolution `bundler`), `typecheck`/`lint`/`test` scripts, bun:test harness, shared validators (≥70% floor, `direct×0.70 + indirect×0.30`, 6-category root-cause enum), `forms` module, python-server ingest client.
1. `clo_raw_data` (per-student raw data entry — everything rolls up from here)
2. `course_assessment_report` (CAR — the term-level hub)
3. `clo_attainment_summary` → `plo_attainment_summary` → `cohort_tracking` (roll-up chain)
4. `plo_gap_analysis` → `cqi_action_plan` → `closing_the_loop` (CQI/ACT loop)
5. `curriculum_map`, `assessment_calendar`, `target_setting_matrix`, `assessment_budget` (PLAN-phase setup)
6. `mid_cycle_attainment`, `resource_monitoring`, `peer_observation`, `exhibition_feedback`, `clo_perception_survey`, `student_exit_survey`, `portfolio_assessment_record`, `capstone_panel_evaluation` (supporting DO/CHECK instruments)
7. `alumni_tracer`, `employer_satisfaction_survey`, `annual_program_report`, `systemic_gap_report`, `capa_plan`, `portfolio_roadmap`, `institutional_review` (periodic/escalation/institutional — lowest MVP urgency)
8. Graduation-cluster archival pipeline (after PEO attainment capture)

Each phase's Definition of Done includes unit tests (bun:test) for services/validators plus integration tests against the dev DB (gated on Neon reachability), with lint and typecheck green.

## System Design Documentation

When adding a new feature (new endpoints, database tables, service methods, or auth changes) or modifying existing ones, update `SYSTEM-DESIGN.md` to reflect the changes. Keep the following sections in sync:

- **API Endpoints** — add/modify route table entries
- **Database Schema** — add/modify table definitions and ERD
- **Roles Table / Authorization Matrix** — update if role checks change
- **Service Layer** — document new/updated service methods
- **System Architecture / Request Flow** — update if middleware or request pipeline changes