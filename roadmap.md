# OBELISK — Development Roadmap

> Live progress tracker for the OBELISK platform (JMCFI OBE system).
> Services: `backend` (Elysia/Prisma), `frontend` (Next.js 16), `python-server` (FastAPI ETL/analytics).
> Domain reference: `JMCFI-WIN-OBE-Forms-Digitization-Reference.md`.
> Architecture & ownership: `backend/SYSTEM-DESIGN.md`, `frontend/SYSTEM-DESIGN.md`, `python-server/SYSTEM-DESIGN.md`.

Legend: `[ ]` pending · `[~]` in progress · `[x]` done. Update the box when a task is truly done (including verification).

**Build strategy: backend-first.** The entire backend (all form phases, incl. tests/lint/typecheck green) is stabilized before **any** frontend form screens are built. Frontend work is consolidated in a single deferred section at the bottom and does not start until the backend is stable. **Phase 0 is complete** (tsconfig, scripts, test harness, validators, forms module, ingest client, archival migration applied); Phases 1–7 proceed backend-only. A routing/scope **foundation** (shell, role-gated routes, adaptive per-role dashboards, API client) was landed early to lock the frontend architecture — see the deferred section.

---

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

- [ ] **Backend: ingest endpoint** — accept uploaded class record, forward to python-server, persist result
- [ ] **Backend: persist ETL output** — `AssessmentItem` / `StudentScore` / `CloAttainment` + `ComputationRun` (formula version/weights recorded)
- [ ] **Backend: at-risk auto-flag** — any CLO <70% → `AtRiskFlag` (computed, no manual entry)
- [ ] **Backend: manual edit + CSV re-import** for per-student scores
- [ ] **Tests:** unit (validators, at-risk computation) + integration (upload → persist → rollup) when DB reachable
- [ ] **Exit check:** an uploaded class record produces correct per-student attainment via the API

---

## Phase 2 — Course Assessment Report (`course_assessment_report`, CAR)

The term-level hub that consolidates a term's data.

- [ ] **Backend: CAR service** — parts 1–7, auto-populate Part 3 from stored attainment (no re-entry)
- [ ] **Backend: assessment-type breakdown** (2.1–2.4) + weighted CLO avg
- [ ] **Backend: at-risk watchlist** (Part 4) + **CQI entries** (Part 5) → feeds gap analysis/CQI
- [ ] **Tests:** CAR generation from Phase 1 data (no manual re-entry); watchlist/CQI wiring
- [ ] **Exit check:** CAR generates from Phase 1 data without manual re-entry

---

## Phase 3 — Roll-up Chain

`clo_attainment_summary` → `plo_attainment_summary` → `cohort_tracking`

- [ ] **Backend: `clo_attainment_summary`** — full-term CLO attainment by cohort (reusable year block ×4)
- [ ] **Backend: `plo_attainment_summary`** — aggregate CARs via python-server `/analytics/summary`, persist into `PloAttainment`
- [ ] **Backend: `cohort_tracking`** — longitudinal tracking (permanent retention, strict audit trail), trend + CQI-triggered flags
- [ ] **Tests:** rollup correctness (CLO → PLO → cohort), audit-trail writes
- [ ] **Exit check:** program-level PLO attainment visible end-to-end from uploaded records

---

## Phase 4 — CQI / ACT Loop

`plo_gap_analysis` → `cqi_action_plan` → `closing_the_loop`

- [ ] **Backend: `plo_gap_analysis`** — gap row per NOT-MET PLO-cohort combo, 6-category root cause
- [ ] **Backend: `cqi_action_plan`** — stateful two-phase lifecycle (planned → tracked-to-completion)
- [ ] **Backend: `closing_the_loop`** — CTL report with **hard-computed loop status** (CLOSED only if 5 conditions met)
- [ ] **Backend: `annual_program_report` validation gate** — blocked if `cohort_tracking` absent
- [ ] **Tests:** 5-condition CLOSED computation; APAR gate; gap → plan → loop trace
- [ ] **Exit check:** a gap traced from analysis → CQI plan → loop closure with computed status

---

## Phase 5 — PLAN-Phase Setup Forms

- [ ] **`curriculum_map`** — dynamic CLO-PLO matrix + computed Coverage Check (D-stage)
- [ ] **`assessment_calendar`** — pre-seeded editable calendar (non-deletable template rows)
- [ ] **`target_setting_matrix`** — per-year targets, ≥70% hard floor + rationale
- [ ] **`assessment_budget`** — 12 fixed line items by PDCA phase, computed totals
- [ ] **Tests:** ≥70% floor validation, coverage check, calendar row protection

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

- [ ] `alumni_tracer` + `employer_satisfaction_survey` — biennial surveys → **PEO attainment evidence** + feed composite (Direct×70% + Indirect×30%)
- [ ] `annual_program_report` (APAR) — dashboard KPIs, mandatory attachments, cohort_tracking gate
- [ ] `systemic_gap_report` — trigger: 3 consecutive NOT-MET, due trigger + 30 days
- [ ] `capa_plan` — actions/milestones, AQAU progress monitoring
- [ ] `institutional_review` — program APAR review, institutional CQI completion rate
- [ ] `portfolio_roadmap` — 4-year roadmap + rubric standards (portfolio programs)

- [ ] **Tests:** divergence flags, PEO evidence capture into `PeoAttainment`, systemic-gap trigger

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

### Shared infrastructure

- [ ] `components/obe/` primitives — status badge, I-P-D selector, cohort selector, root-cause selector, Bloom's selector, rubric scale, Likert scale, loop-status badge, header/footer blocks, row-editor table

### Form screens (mirror backend phases)

- [ ] `clo_raw_data` entry screen (`/forms/clo-raw-data`) — upload panel scaffolded; wire to `POST /ingest/upload` + job polling.
- [ ] CAR screen (`/forms/course-assessment-report`) — 7 parts, computed cells read-only.
- [ ] Roll-up screens (`/forms/attainment/...`) + dashboard KPI cards/charts.
- [ ] CQI screens (`/forms/cqi/...`).
- [ ] PLAN setup screens (`curriculum_map`, `assessment_calendar`, `target_setting_matrix`, `assessment_budget`).
- [ ] Supporting/periodic/institutional screens (Phase 6 forms).
- [ ] `archives/` cluster list (role-gated aqau/vpaa/dean/system_admin).
- [ ] `archives/[clusterId]` read-only per-student snapshot + artifact drill-down.

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

### backend (Elysia + Prisma) — **active focus**

- [x] Prisma schema (auth, academic, outcomes, assessment, forms, attainment, monitoring, reports, archive)
- [x] better-auth (email/password, sessions), `/auth/me`, OpenAPI
- [x] Role request workflow — `requestedRole`/`roleRequestStatus` on `user`; system_admin-only list/approve/deny endpoints
- [x] Phase 0 stabilization (tsconfig fix, scripts, test harness, validators, forms module, ingest client)
- [ ] Feature routes (all forms) — see Phases 1–6
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
