# OBELISK — Development Roadmap

> Live progress tracker for the OBELISK platform (JMCFI OBE system).
> Services: `backend` (Elysia/Prisma), `frontend` (Next.js 16), `python-server` (FastAPI ETL/analytics).
> Domain reference: `JMCFI-WIN-OBE-Forms-Digitization-Reference.md`.
> Architecture & ownership: `backend/SYSTEM-DESIGN.md`, `frontend/SYSTEM-DESIGN.md`, `python-server/SYSTEM-DESIGN.md`.

Legend: `[ ]` pending · `[~]` in progress · `[x]` done. Update the box when a task is truly done (including verification).

**Build strategy: backend-first.** The entire backend (all form phases, incl. tests/lint/typecheck green) is stabilized before **any** frontend form screens are built. Frontend work is consolidated in a single deferred section at the bottom and does not start until the backend is stable. **Phase 0 is complete** (tsconfig, scripts, test harness, validators, forms module, ingest client, archival migration applied); Phases 1–7 proceed backend-only. A routing/scope **foundation** (shell, role-gated routes, adaptive per-role dashboards, API client) was landed early to lock the frontend architecture — see the deferred section.

---

## Target Timeline — Split Sprint, Compressed (Aug 8–17)

> Hard target: full pipeline working by Aug 17. Soft target: Aug 15. Aug 18–23 is
> buffer for demo prep and client/adviser conversations — no new building in that
> window unless something broke. Dates are checkpoints, not caps — finish early,
> roll into the next task same session. But if a day's task is genuinely done and
> you're tired, stop; don't force hours just because the schedule is tight.

**Harold's lane — Phases 1–3 (partial) + AI integration + approval-chain wiring.**
Primary tool: Gemini (daily quota); Copilot as backup only.

Goal: upload a class record → compute → persist → CAR → PLO rollup → AI
recommendation → routed through the existing approval chain (program_chair →
dean → aqau → vpaa — Phase 0 machinery, no new approval logic).

- **Aug 8 (Sat)** — rest (last full rest day before the compressed sprint)
- **Aug 9 (Sun)** — audit `ingest` module; scope `attainment-service` prompt `[x]`
- **Aug 10 (Mon)** — Student/Clo matching logic + `ComputationRun`/`CloAttainment` inserts (composite fallback resolved same day) `[x]`
- **Aug 11 (Tue)** — `AtRiskFlag` auto-derivation + verify: real upload → DB rows match hand-verified Python output `[x]` — verified: 36/50 correctly flagged, cross-checked against `isBelowThreshold`, no false positives on passing attainments
- **Aug 12 (Wed)** — wire `/forms/clo-raw-data` panel to upload + polling; render real attainment `[x]` — required an unplanned rework: sync long-poll → async job-id + polling (fixed a false-401 display bug), plus a working dev-auth seed user. Verified visually in UI: "Processing Complete — 50 CLO attainments recorded, 36 at-risk"
- **Aug 13 (Thu)** — Gemini API integration in `call_llm_api()` + verify end-to-end against real gap data `[ ]`
- **Aug 14 (Fri)** — CAR Part 3 (consolidated CLO summary) + Part 4 (at-risk watchlist) auto-populate `[x]` — all 7 parts built in the `car` module: assessment-type means (Part 2), year-level cohort summaries (Part 3), at-risk watchlist from `isBelowThreshold` (Part 4), CQI entries (Part 5); integration test persists attainment → generates all 7 parts → saves Part 5 → regenerates
- **Aug 15 (Sat)** — `plo_attainment_summary` via `/analytics/summary`, persisted to `PloAttainment` — **soft target: full data pipeline complete** `[ ]`
- **Aug 16 (Sun)** — wire `FormSubmission` creation on persist → route through existing approval chain to VPAA `[ ]`
- **Aug 17 (Mon)** — verify full chain end-to-end (upload → ... → visible at every approval step incl. VPAA); dashboard check — **hard target: done** `[ ]`
-

**Aug 18–23** — buffer: demo prep, client/adviser conversations, fix whatever broke. No new scope unless Aug 17 slipped.

**Explicitly deferred, unscheduled:** `clo_attainment_summary`; `cohort_tracking`; Phase 4 (gap analysis/CQI action plan — VPAA sees raw attainment data, not a full CQI plan); Phase 7. (CAR is now done — see Phase 2. Manual edit + CSV re-import and the ingest test suite are done — see Phase 1. Phase 6 is done — see below.)

**Exit criteria:** upload → compute → persist → CAR → PLO rollup → AI recommendation → routed through full approval chain to VPAA, no manual re-entry.

---

**Kim's lane — Phase 5: PLAN-phase setup forms** (independent, parallel).

- `curriculum_map`, `assessment_calendar`, `target_setting_matrix`, `assessment_budget`

## Phase 0 — Backend Foundation & Stabilization

Goal: make the backend buildable, testable, and lint-clean, then stand up the shared plumbing all phases depend on.

- [x] Prisma schema (auth, academic, outcomes, assessment, forms, attainment, monitoring, reports, archive) — validated, client generated
- [x] better-auth (email/password, sessions), `/auth/me`, OpenAPI
- [x] **Fix `tsconfig.json`** — `moduleResolution: "node"` maps to removed `node10` (TS5108); set to `bundler` so `bunx tsc --noEmit` passes
- [x] **Add quality scripts** to `package.json` — `typecheck`, `lint` (biome), `test` (bun:test); all three green on baseline
- [x] **bun:test harness** — unit tests for services/validators (no DB); integration tests against dev DB gated on Neon reachability
- [x] Apply archival migration to DB (Neon reachable — applied, `migrate status` up to date)
- [x] **Backend: forms module** — `FormSubmission`/`ApprovalStep` CRUD + submit/approve lifecycle (status machine: draft → submitted → returned → approved → archived)
- [x] **Backend: python-server ingest client** — `POST /upload` → poll `GET /jobs/{job_id}`, structured error mapping (`error_type`/`details`)
- [x] **Backend: shared validators** — ≥70% floor, `direct×0.70 + indirect×0.30` constants, 6-category root-cause enum, retention classes

**Exit gate for Phase 0:** `bun run typecheck`, `bun run lint`, and `bun test` all pass; forms module + ingest client + validators exist behind `api/v1`.

---

## Phase 1 — Per-Student CLO Raw Data (`clo_raw_data`)

The foundational data-capture form; exercises the full 3-service integration.

- [x] **Backend: ingest endpoint** — accept uploaded class record, forward to python-server, persist result
- [x] **Backend: persist ETL output** — `AssessmentItem` / `StudentScore` / `CloAttainment` + `ComputationRun` (formula version/weights recorded)
- [x] **Backend: at-risk auto-flag** — any CLO <70% → `AtRiskFlag` (computed, no manual entry)
- [x] **Backend: manual edit + CSV re-import** for per-student scores — `PUT /attainments` (direct-score edits, composite/threshold recompute, at-risk reconciliation) + `POST /attainments/reimport` (wide-format roster CSV/TSV upsert); CSV parsing in `lib/ingest/csv.ts`
- [x] **Tests:** unit (validators, at-risk computation, CSV parsing) + integration (persist → edit → reimport, upload history) green against the live dev DB
- [x] **Exit check:** an uploaded class record produces correct per-student attainment via the API

---

## Phase 2 — Course Assessment Report (`course_assessment_report`, CAR)

The term-level hub that consolidates a term's data.

- [x] **Backend: CAR service** — parts 1–7, auto-populate Part 3 from stored attainment (no re-entry) — `src/v1/car` (`compute.ts`/`model.ts`/`service.ts`/`controller.ts`), mounted at `/api/v1/car/*`
- [x] **Backend: assessment-type breakdown** (2.1–2.4) + weighted CLO avg — `exam`/`rubric`/`perf.tasks`/`portfolio` means from the persisted `CloAttainment` category pct columns
- [x] **Backend: at-risk watchlist** (Part 4) + **CQI entries** (Part 5) → feeds gap analysis/CQI — watchlist derives from `isBelowThreshold` (computed, never manual)
- [x] **Tests:** CAR generation from Phase 1 data (no manual re-entry); watchlist/CQI wiring — `test/integration/car.test.ts` + `test/unit/car.compute.test.ts` green
- [x] **Exit check:** CAR generates from Phase 1 data without manual re-entry

---

## Phase 3 — Roll-up Chain

`clo_attainment_summary` → `plo_attainment_summary` → `cohort_tracking`

- [x] **Backend: `clo_attainment_summary`** — full-term CLO attainment by cohort (reusable year block ×4)
- [x] **Backend: `plo_attainment_summary`** — aggregate CARs via python-server `/analytics/summary`, persist into `PloAttainment`
- [x] **Backend: `cohort_tracking`** — longitudinal tracking (permanent retention, strict audit trail), trend + CQI-triggered flags
- [x] **Tests:** rollup correctness (CLO → PLO → cohort), audit-trail writes
- [x] **Exit check:** program-level PLO attainment visible end-to-end from uploaded records

**Done (Phase 3):** the roll-up chain ships as `src/v1/rollup/` exposed under `/api/v1/rollup` (`rollup-plugin`). `computation_run.etl_snapshot_json` now persists the raw `{header, attainments, clo_plo_mapping}` at ingest time so F15 can reproduce the exact source records when feeding python-server; `plo_attainment` indexes `[program_id, term_id]` and `clo_attainment` indexes `[class_section_id, computation_run_id]`. Migration `20260822000000_add_etl_snapshot_and_rollup_indexes` (apply with `bun run db:migrate`, then `bun run db:generate`). Backend gates green (`bun run typecheck`, `bun run lint`, `bun test` — 84 tests).

---

## Phase 4 — CQI / ACT Loop

`plo_gap_analysis` → `cqi_action_plan` → `closing_the_loop`

- [x] **Backend: `plo_gap_analysis`** — gap row per NOT-MET PLO-cohort combo, 6-category root cause
- [x] **Backend: `cqi_action_plan`** — stateful two-phase lifecycle (planned → tracked-to-completion)
- [x] **Backend: `closing_the_loop`** — CTL report with **hard-computed loop status** (CLOSED only if 5 conditions met)
- [x] **Backend: `annual_program_report` validation gate** — blocked if `cohort_tracking` absent
- [x] **Tests:** 5-condition CLOSED computation; APAR gate; gap → plan → loop trace
- [x] **Exit check:** a gap traced from analysis → CQI plan → loop closure with computed status

**Done (Phase 4):** the CQI / ACT loop ships as `src/v1/cqi/` exposed under `/api/v1/cqi` (`cqi-plugin`). Dedicated `gap_row` / `cqi_entry` / `ctl_row` tables (migration `20260820193045_add_cqi_act_models`) back the stateful lifecycle: `plo_gap_analysis` derives per-PLO-per-cohort attainment from stored `clo_attainment` (via the CLO→PLO map and `student.year_level`) and reconciles one gap row per NOT-MET combo with 6-category root cause; `cqi_action_plan` moves entries from planned → tracked-to-completion; `closing_the_loop` hard-computes loop status (CLOSED only when all five conditions hold, else OPEN — Re-assess / OPEN — Not Implemented) with the mandatory Identify step; `annual_program_report` blocks submission when the Cohort Tracking Sheet isn't attached (submit-gate registry in `lib/forms/submit-gates.ts`). Backend gates green (`bun run typecheck`, `bun run lint`, `bun test` — 106 tests).

---

## Phase 5 — PLAN-Phase Setup Forms

- [x] **`curriculum_map`** — dynamic CLO-PLO matrix + computed Coverage Check (D-stage)
- [x] **`assessment_calendar`** — pre-seeded editable calendar (non-deletable template rows)
- [x] **`target_setting_matrix`** — per-year targets, ≥70% hard floor + rationale
- [x] **`assessment_budget`** — 12 fixed line items by PDCA phase, computed totals
- [x] **Tests:** ≥70% floor validation, coverage check, calendar row protection

**Done (Phase 5):** the four PLAN setup forms ship as `src/v1/plan/` exposed under `/api/v1/plan` (`plan-plugin`, `pdcaStage` PLAN). Dedicated row tables in `12-plan.prisma` (migration `20260823170939_add_plan_phase_setup_forms`): `curriculum_map` full-replaces the PLO directory + year-grouped I-P-D matrix and computes the Coverage Check per PLO; `assessment_calendar` seeds 17 institutional template milestones (editable, non-deletable) plus free-form program-specific events; `target_setting_matrix` seeds 70%-default PLO rows and enforces the ≥70% hard floor with rationale-required-above-floor on save; `assessment_budget` seeds the 12 fixed line items by PDCA phase (non-deletable, extendable) with computed estimated/approved TOTALs. `CloToPloMap.stage` models the attainment-side I-P-D stage. Backend gates green (`bun run typecheck`, `bun run lint`, `bun test` — 120 tests).

---

## Phase 6 — Supporting & Periodic / Institutional Forms

### DO/CHECK instruments

- [x] `mid_cycle_attainment` — reusable cohort attainment block ×4 + at-risk watchlist
- [x] `peer_observation` — 7 fixed criteria, per-criterion scales
- [x] `exhibition_feedback` — min 3 industry guests, computed means
- [x] `clo_perception_survey` + `student_exit_survey` — Likert tabulation, divergence auto-flag (indirect evidence)
- [x] `portfolio_assessment_record` + `capstone_panel_evaluation` — panel rubric scoring (portfolio programs / Year 4)

### Periodic / institutional

- [x] `resource_monitoring` — budget line-item status + CQI implementation tracking
- [x] `alumni_tracer` + `employer_satisfaction_survey` — biennial surveys → **PEO attainment evidence** + feed composite (Direct×70% + Indirect×30%)
- [x] `systemic_gap_report` — trigger: 3 consecutive NOT-MET, due trigger + 30 days
- [x] `capa_plan` — actions/milestones, AQAU progress monitoring
- [x] `institutional_review` — program APAR review, institutional CQI completion rate
- [x] `portfolio_roadmap` — 4-year roadmap + rubric standards (portfolio programs)

- [x] **Tests:** 19 integration tests across `check.test.ts` (9) + `periodic.test.ts` (10); submit gates (F11 ≥3 guests, F19 ≥2 faculty + 1 industry, F20/F21 biennial 18mo, F26 3+ consecutive NOT-MET, F27 referenced F26 approved)

**Done (Phase 6):** 14 forms shipped across two new plugins — `check-plugin` (`/api/v1/check`, PDCA stage CHECK: F08/F10/F11/F12/F17/F18/F19, sequence nos 21–27) and `periodic-plugin` (`/api/v1/periodic`, PDCA stage ACT: F09/F20/F21/F26/F27/F28/F02, sequence nos 28–34). Schema `13-phase6.prisma` adds 8 dedicated row tables (`MidCycleCohortRow`, `ResourceItemRow`, `CqiImplementRow`, `ExhibitionGuestRow`, `PortfolioCriterionRow`, `CapstonePanelistRow`, `PortfolioRoadmapRow`, `PortfolioRubricRow`) + 3 new enums (`MidCycleStatus`, `AcquisitionStatus`, `CqiImplementationStatus`) + 8 back-relations on `FormSubmission`. 5 submit gates enforced via `lib/forms/submit-gates.ts`. Migration `20260915145318_add_phase6`. Backend gates green (`bun run typecheck`, `bun run lint`, `bun test` — 107 unit + 30 integration tests).

---

## Phase 7 — Graduation-Cluster Archival (compiled, read-only)

Purpose: compile finished cohorts into compact, permanent, read-only snapshots to reclaim space while keeping data viewable. Clustering keyed by **actual graduation term** (protects transferees + irregular students). **Runs AFTER PEO attainment is captured** — the compiled snapshot must include the cohort's PEO evidence from the biennial alumni/employer surveys (Phase 6) before granular data is purged. Schema is done; pipeline pending (post PEO data capture).

### Schema (done)

- [x] `StudentStatus` + `GraduationClusterStatus` enums
- [x] `GraduationCluster` model (per program × graduation term; open → compiling → archived) + `peoAttainmentCapturedAt` gate
- [x] `GraduationClusterEntry` (write-once read-only snapshot + `peoAttainment` snapshot column + detail-artifact URL + purge audit)
- [x] `Student` fields (`studentStatus`, `graduationTermId`, `graduationClusterId`) + relations
- [x] `PeoAttainment` model (unique `[peoId, termId]`, `attainedPct`, `evidenceJson`) — PEO capture records feeding the snapshot
- [x] Migration SQL written (`20260805000000_add_graduation_cluster_archival`) — applied to DB

### Pipeline (backend `archival-service`)

- [ ] Auto-create cluster at AY end (graduates + transferred_out/withdrawn candidates)
- [ ] Confirm to compile (aqau / system_admin only) — `open → compiling → archived`, gated on `peoAttainmentCapturedAt`
- [ ] Compile per-student snapshot into `compiledData` — **including PEO attainment (alumni/employer survey results)**
- [ ] Export full detail artifact (`detailArtifactUrl`; storage provider TBD)
- [ ] Purge granular hot rows (StudentScore, per-student CloAttainment, AtRiskFlag) — keep PloAttainment/enrollments
- [ ] Read-only enforcement: GET-only endpoints + audit log; optional DB write-block trigger
- [ ] **Tests:** write-once enforcement, purge audit, PEO gate

---

## Frontend (deferred — starts only after backend is stable)

> All frontend work is consolidated here and does **not** begin until the backend phases (0–7) are stable (typecheck + lint + tests green, DB migration applied). Carried forward from the original interleaved plan. Route sheer/scoping foundation landed ahead of full backend stabilization to lock the architecture.

### Already built

- [x] App shell, theme, sidebar, login
- [x] File-upload preview (`faculty` page)
- [x] **Role-scoped routing foundation** — `proxy.ts` coarse auth gate; `(app)` layout (server `requireUser`); single adaptive `/dashboard` with per-role dashboards (registry in `role-dashboard.tsx`); form route groups keyed by stable codes; archives viewer gated to aqau/vpaa/dean/system_admin; `/faculty` redirects → `/forms/clo-raw-data`.
- [x] **API client layer** — `lib/api.ts` (browser), `lib/api/server.ts` (server-only), `lib/auth.ts` (guards).
- [x] **Role & nav registry** — `lib/roles.ts` + `lib/navigation.tsx` drive the sidebar, forms index, and route gating (config-driven; add role/route = add one entry).
- [x] **Sign-up + role request** — `/register` with role selection; new accounts default to `user` until a `system_admin` approves (`requestedRole` + `roleRequestStatus` on the user; `GET/POST /auth/role-requests*`; approval UI on the system-admin dashboard).
- [x] **Google-only account creation** — `/register` shows only the org-restricted Google provider (email/password sign-up disabled; login kept for existing accounts); role selection moved to a post-login `/onboarding` route (`POST /auth/role-request`); the `(app)` shell redirects role-less users to `/onboarding`.
- [x] **DEVELOPMENT auth bypass** — when `DEVELOPMENT=true`, `proxy.ts` + server auth guards short-circuit to a dev `system_admin` user so every route is viewable without an account (frontend-only; backend still requires a session).
- [x] **6 role-specific dashboards** — faculty, program_chair, dean, aqau, vpaa, system_admin (chart panels with sample data; `formStatusCountsAtom` + `uploadsHistoryDataAtom` wired to real API).

### Shared infrastructure

- [x] UI primitives — `components/ui/` (button, input, select, dialog, badge, tooltip, skeleton, etc.)
- [x] Layout components — `app-shell`, `app-sidebar`, `site-header`, `nav-*`
- [x] Chart system — `evilcharts/` (ECharts wrappers) + `components/charts/` (attainment, CQI, governance, plan, ingest chart sets)
- [x] Data grid — `reui/data-grid/` (TanStack Table-based, virtual scrolling, column visibility, pagination)
- [x] Form frame — `reui/frame.tsx`, `reui/badge.tsx`, `reui/filters.tsx`
- [ ] `components/obe/` primitives — status badge, I-P-D selector, cohort selector, root-cause selector, Bloom's selector, rubric scale, Likert scale, loop-status badge, header/footer blocks, row-editor table

### Form screens — Phases 0–5 (13 forms, all fully built)

- [x] `clo_raw_data` (`/forms/clo-raw-data`) — upload panel + ETL polling + upload history table
- [x] `course_assessment_report` (`/forms/course-assessment-report`) — 7-part tabbed CAR
- [x] `clo_attainment_summary` (`/forms/attainment/clo-attainment-summary`) — generate + display
- [x] `plo_attainment_summary` (`/forms/attainment/plo-attainment-summary`) — generate + display
- [x] `cohort_tracking` (`/forms/attainment/cohort-tracking`) — generate + annotation editor + grid
- [x] `plo_gap_analysis` (`/forms/cqi/plo-gap-analysis`) — gap rows + root-cause editor
- [x] `cqi_action_plan` (`/forms/cqi/cqi-action-plan`) — action plan table with tracking
- [x] `closing_the_loop` (`/forms/cqi/closing-the-loop`) — condition editor + identify section
- [x] `annual_program_report` (`/forms/cqi/annual-program-report`) — KPIs + attachments + narratives
- [x] `curriculum_map` (`/forms/plan/curriculum-map`) — I-P-D matrix with toggle cells
- [x] `assessment_calendar` (`/forms/plan/assessment-calendar`) — calendar event table
- [x] `target_setting_matrix` (`/forms/plan/target-setting-matrix`) — PLO + CLO target tables
- [x] `assessment_budget` (`/forms/plan/assessment-budget`) — budget line-item table

### Form screens — Phase 6 (14 forms, all pending)

#### CHECK module (`/forms/check/`)

- [ ] `mid_cycle_attainment` — 4 cohort blocks, per-CLO attainment table, at-risk watchlist
- [ ] `peer_observation` — 7 criteria rows, each with own rating scale + evidence text
- [ ] `exhibition_feedback` — dynamic guest rows, per-PLO 0-10 ratings, computed means
- [ ] `clo_perception_survey` — Likert tabulation per CLO, divergence flag
- [ ] `student_exit_survey` — PLO × cohort matrix, divergence flag
- [ ] `portfolio_assessment` — rubric scoring per criterion, 3 assessor scores, consensus
- [ ] `capstone_panel` — dynamic panelist rows, per-PLO 0-10 ratings, panel composition

#### Periodic module (`/forms/periodic/`)

- [ ] `resource_monitoring` — resource items + CQI implementation rows
- [ ] `alumni_tracer` — employment indicators + PLO sufficiency table
- [ ] `employer_survey` — employer profiles + PLO competency table
- [ ] `systemic_gap_report` — 3-cycle evidence, root cause, structural response
- [ ] `capa_plan` — action rows (≤8), progress reviews, closure declaration
- [ ] `institutional_review` — program reviews + CQI completion table
- [ ] `portfolio_roadmap` — 4-year roadmap rows + rubric standards with weight validation

### Workflow UI (all pending)

- [ ] Approval workflow — submit / review / approve / return buttons on form screens
- [ ] Submission inbox — "My Submissions" + "Pending Approvals" pages
- [ ] Export / print — PDF / Excel / Word on form screens

### Archives

- [ ] `archives/` cluster list (role-gated aqau/vpaa/dean/system_admin)
- [ ] `archives/[clusterId]` read-only per-student snapshot + artifact drill-down

### Dashboard data wiring (partially done)

- [x] `formStatusCountsAtom` — wired to `GET /forms`
- [x] `uploadsHistoryDataAtom` — wired to `GET /ingest/history`
- [ ] Wire remaining ~18 atoms to real backend endpoints (attainment trends, cohort trends, PEO attainment, budget data, approval flows, audit activity, etc.)
- [ ] Populate stat cards on all 6 role dashboards (currently empty `stats: []`)

---

## Service Readiness (underlying capabilities)

### python-server (pure-compute ETL/analytics)

- [x] Class-record `.xlsx` extraction (openpyxl, `etl_const` cell map)
- [x] Formula 1A direct CLO attainment + 4-tier levels + Rule-1 completeness
- [x] Analytics rollups (Formulas 2A/7A/7C, Rule 3)
- [ ] Real loader/delivery to backend (currently `DummyLoader`)
- [x] Real LLM integration (currently `IS_DEBUG_MODE` placeholder)
- [x] Indirect (30%) attainment pipeline (needs survey data)
- [ ] Persistent job queue (currently in-memory)

### backend (Elysia + Prisma) — **active focus**

- [x] Prisma schema (auth, academic, outcomes, assessment, forms, attainment, monitoring, reports, archive)
- [x] better-auth (email/password, sessions), `/auth/me`, OpenAPI
- [x] Role request workflow — `requestedRole`/`roleRequestStatus` on `user`; system_admin-only list/approve/deny endpoints
- [x] Phase 0 stabilization (tsconfig fix, scripts, test harness, validators, forms module, ingest client)
- [ ] Feature routes (all forms) — see Phases 1–6
  - [x] CAR routes (`/api/v1/car/*`) — submit-time assembly, per-section CAR resolution, editable-parts save (Phases 1–2)
  - [x] Check routes (`/api/v1/check/*`) — F08/F10/F11/F12/F17/F18/F19 (Phase 6)
  - [x] Periodic routes (`/api/v1/periodic/*`) — F09/F20/F21/F26/F27/F28/F02 (Phase 6)
- [ ] Approval workflow on `FormSubmission`/`ApprovalStep` — lifecycle implemented in Phase 0; per-form routing/RBAC to follow
- [ ] Archival pipeline — see Phase 7

### frontend (Next.js 16) — **foundation landed; screens deferred until backend stable**

- [x] App shell, theme, sidebar, login
- [x] File-upload preview (`faculty` page)
- [x] API client layer + role-gated routing + adaptive role dashboards (foundation)
- [ ] OBE form components + wired form screens (see deferred Frontend section)

---

## Out of scope / deferred decisions

- Forms without a defined field structure (referenced-but-not-developed in the manual) — **no code assigned**, confirm scope before designing.
- `F##` manual IDs are provisional — use form **titles / stable snake_case codes** everywhere.
- `python-server` database/auth scaffolding (`app/database`, `app/models`) is unused — pending removal decision.
- **DB blocker (resolved):** Neon (`ep-delicate-water-azqj15d0-pooler...neon.tech`) is reachable; archival migration applied and DB integration tests run in the suite. Monitor for future outages.
- **Archival storage:** object-storage provider for `detailArtifactUrl` TBD (S3/MinIO/local in dev; `ARCHIVE_STORAGE_URL`).

---

## Backlog

### Data Pipeline & Integration

- [ ] **Class record as required input** — class record upload is a hard prerequisite for the downstream pipeline (ingest → ETL → CAR → PLO → CQI); enforce at form level
- [ ] **Input → Output pipeline (class record → CQI)** — end-to-end integration: upload class record → compute CLO attainment → generate CAR → roll up to PLO → feed CQI gap analysis + action plan; verify no manual re-entry
- [ ] **CLO-to-PLO connection** — wire the attainment-side CLO→PLO mapping end-to-end (confirm `curriculum_map` linkage feeds correctly into rollup chain and CQI)

### CLO/PLO Management

- [ ] **Add CLOs and PLOs with connection** — CRUD operations for CLOs and PLOs (add, edit, delete) + ability to link/map them to each other; currently `curriculum_map` shows the matrix but there is no standalone CLO/PLO entity management

### Forms & Workflow

- [ ] **Forms connection, steps, approve/disapprove for users** — wire per-form approval step routing with user-facing approve/return buttons; submission inbox ("My Submissions" + "Pending Approvals"); extend existing Workflow UI stubs

### Bug / Investigation

- [ ] **Phantom GET calls on server** — investigate and fix unidentified/phantom GET requests hitting the backend; root-cause whether these are client-side misfires, stale polling, or external probes
