# OBELISK — Development Roadmap

> Live progress tracker for the OBELISK platform (JMCFI OBE system).
> Services: `backend` (Elysia/Prisma), `frontend` (Next.js 16), `python-server` (FastAPI ETL/analytics).
> Domain reference: `JMCFI-WIN-OBE-Forms-Digitization-Reference.md`.
> Architecture & ownership: `backend/SYSTEM-DESIGN.md`, `frontend/SYSTEM-DESIGN.md`, `python-server/SYSTEM-DESIGN.md`.

Legend: `[ ]` pending · `[~]` in progress · `[x]` done. Update the box when a task is truly done (including verification).

---

## Phase 0 — Glue & Shared Infrastructure

Goal: build the reusable plumbing all phases depend on.

- [ ] **Backend: forms module** — `FormSubmission`/`ApprovalStep` CRUD + submit/approve lifecycle (status machine: draft → submitted → returned → approved → archived)
- [ ] **Backend: python-server ingest client** — `POST /upload` → poll `GET /jobs/{job_id}`, structured error mapping (`error_type`/`details`)
- [ ] **Backend: shared validators** — ≥70% floor, direct×70% + indirect×30% constants
- [ ] **Frontend: `lib/api.ts`** API client (cookie credentials, typed responses, `auth/me`)
- [ ] **Frontend: role-gated app shell** — layout + nav filtered by `role` (build on existing dashboard shell)
- [ ] **Frontend: `components/obe/` primitives** — status badge, I-P-D selector, cohort selector, root-cause selector, Bloom's selector, rubric scale, Likert scale, loop-status badge, header/footer blocks, row-editor table

---

## Phase 1 — Per-Student CLO Raw Data (`clo_raw_data`)

The foundational data-capture form; exercises the full 3-service integration.

- [ ] **Backend: ingest endpoint** — accept uploaded class record, forward to python-server, persist result
- [ ] **Backend: persist ETL output** — `AssessmentItem` / `StudentScore` / `CloAttainment` + `ComputationRun` (formula version/weights recorded)
- [ ] **Backend: at-risk auto-flag** — any CLO <70% → `AtRiskFlag` (computed, no manual entry)
- [ ] **Backend: manual edit + CSV re-import** for per-student scores
- [ ] **Frontend: raw-data entry screen** (`/forms/clo-raw-data`) with per-student table
- [ ] **Frontend: import UX** — reuse `faculty` upload preview, show job progress + structured errors
- [ ] **Exit check:** an uploaded class record produces correct per-student attainment in the UI

---

## Phase 2 — Course Assessment Report (`course_assessment_report`, CAR)

The term-level hub that consolidates a term's data.

- [ ] **Backend: CAR service** — parts 1–7, auto-populate Part 3 from stored attainment (no re-entry)
- [ ] **Backend: assessment-type breakdown** (2.1–2.4) + weighted CLO avg
- [ ] **Backend: at-risk watchlist** (Part 4) + **CQI entries** (Part 5) → feeds gap analysis/CQI
- [ ] **Frontend: CAR screen** with 7 parts, computed cells read-only
- [ ] **Exit check:** CAR generates from Phase 1 data without manual re-entry

---

## Phase 3 — Roll-up Chain

`clo_attainment_summary` → `plo_attainment_summary` → `cohort_tracking`

- [ ] **Backend: `clo_attainment_summary`** — full-term CLO attainment by cohort (reusable year block ×4)
- [ ] **Backend: `plo_attainment_summary`** — aggregate CARs via python-server `/analytics/summary`, persist into `PloAttainment`
- [ ] **Backend: `cohort_tracking`** — longitudinal tracking (permanent retention, strict audit trail), trend + CQI-triggered flags
- [ ] **Frontend: roll-up screens** (`/forms/attainment/...`) + dashboard KPI cards/charts
- [ ] **Exit check:** program-level PLO attainment visible end-to-end from uploaded records

---

## Phase 4 — CQI / ACT Loop

`plo_gap_analysis` → `cqi_action_plan` → `closing_the_loop`

- [ ] **Backend: `plo_gap_analysis`** — gap row per NOT-MET PLO-cohort combo, 6-category root cause
- [ ] **Backend: `cqi_action_plan`** — stateful two-phase lifecycle (planned → tracked-to-completion)
- [ ] **Backend: `closing_the_loop`** — CTL report with **hard-computed loop status** (CLOSED only if 5 conditions met)
- [ ] **Backend: `annual_program_report` validation gate** — blocked if `cohort_tracking` absent
- [ ] **Frontend: CQI screens** (`/forms/cqi/...`)
- [ ] **Exit check:** a gap traced from analysis → CQI plan → loop closure with computed status

---

## Phase 5 — PLAN-Phase Setup Forms

- [ ] **`curriculum_map`** — dynamic CLO-PLO matrix + computed Coverage Check (D-stage)
- [ ] **`assessment_calendar`** — pre-seeded editable calendar (non-deletable template rows)
- [ ] **`target_setting_matrix`** — per-year targets, ≥70% hard floor + rationale
- [ ] **`assessment_budget`** — 12 fixed line items by PDCA phase, computed totals

---

## Phase 6 — Supporting & Periodic / Institutional Forms

### DO/CHECK instruments

- [ ] `mid_cycle_attainment` — reusable cohort attainment block ×4 + at-risk watchlist
- [ ] `resource_monitoring` — budget line-item status + CQI implementation tracking
- [ ] `peer_observation` — 7 fixed criteria, per-criterion scales
- [ ] `exhibition_feedback` — min 3 industry guests, computed means
- [ ] `clo_perception_survey` + `student_exit_survey` — Likert tabulation, divergence auto-flag (indirect evidence)
- [ ] `portfolio_assessment_record` + `capstone_panel_evaluation` — panel rubric scoring (portfolio programs / Year 4)

### Periodic / institutional (lowest MVP urgency)

- [ ] `alumni_tracer` + `employer_satisfaction_survey` — biennial surveys → feed composite (Direct×70% + Indirect×30%)
- [ ] `annual_program_report` (APAR) — dashboard KPIs, mandatory attachments
- [ ] `systemic_gap_report` — trigger: 3 consecutive NOT-MET, due trigger + 30 days
- [ ] `capa_plan` — actions/milestones, AQAU progress monitoring
- [ ] `institutional_review` — program APAR review, institutional CQI completion rate
- [ ] `portfolio_roadmap` — 4-year roadmap + rubric standards (portfolio programs)

---

## Service Readiness (underlying capabilities)

### python-server (pure-compute ETL/analytics)

- [x] Class-record `.xlsx` extraction (openpyxl, `etl_const` cell map)
- [x] Formula 1A direct CLO attainment + 4-tier levels + Rule-1 completeness
- [x] Analytics rollups (Formulas 2A/7A/7C, Rule 3)
- [ ] Real loader/delivery to backend (currently `DummyLoader`)
- [ ] Real LLM integration (currently `IS_DEBUG_MODE` placeholder)
- [ ] Indirect (30%) attainment pipeline (needs survey data)
- [ ] Persistent job queue (currently in-memory)

### backend (Elysia + Prisma)

- [x] Prisma schema (auth, academic, outcomes, assessment, forms, attainment, monitoring, reports)
- [x] better-auth (email/password, sessions), `/auth/me`, OpenAPI
- [ ] Feature routes (all forms) — see Phases 1–6
- [ ] Approval workflow on `FormSubmission`/`ApprovalStep`

### frontend (Next.js 16)

- [x] App shell, theme, sidebar, login
- [x] File-upload preview (`faculty` page)
- [ ] API client layer + role-gated routing
- [ ] OBE form components + wired form screens (see Phases 1–6)

---

## Out of scope / deferred decisions

- Forms without a defined field structure (referenced-but-not-developed in the manual) — **no code assigned**, confirm scope before designing.
- `F##` manual IDs are provisional — use form **titles / stable snake_case codes** everywhere.
- `python-server` database/auth scaffolding (`app/database`, `app/models`) is unused — pending removal decision.
