# Obelisk Frontend — System Design

> **Status:** Foundation plus **20 built OBE form screens** (13 Phase 0–5 + 7 CHECK), all wired to backend plugin routes through Server Actions. The role-scoped routed architecture is in place: a single adaptive `/dashboard`, a registry-driven role-gated app shell, an API client layer, the shared approval-workflow bar, two submission inboxes, and dean-only PLO management. Remaining gaps: the 7 Periodic/ACT screens, PDF/export, archives content, and dashboard atom wiring (see §7).

**Stack:** Next.js 16 (App Router, server components by default — proxy renamed from middleware) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · react-hook-form + Zod (auth screens only) · @tanstack/react-table · evilcharts · echarts · base-ui/react · dnd-kit · motion · Jotai (client state). Backend: Elysia at `api/v1` (see `../backend/SYSTEM-DESIGN.md`).

---

## 1. Current State

| Route | File | Purpose | Guard |
| --- | --- | --- | --- |
| `/` | `app/page.tsx` | Redirects to `/dashboard` | — |
| `/login` | `app/(auth)/login/page.tsx` + `components/auth/login-form.tsx` | Sign-in (better-auth email/password + Google) | `requireGuest` |
| `/register` | `app/(auth)/register/page.tsx` + `components/auth/register-form.tsx` | Google-only account creation (org-restricted provider; email/password sign-up disabled) | `requireGuest` |
| `/onboarding` | `app/onboarding/page.tsx` | Role picker / role-request status for `user`-role accounts | `requireUser` (outside `(app)`) |
| `/dashboard` | `app/(app)/dashboard/page.tsx` | **Single adaptive home** → `dashboard/role-dashboard.tsx` renders the role's scoped dashboard | `(app)` shell |
| `/forms` | `app/(app)/forms/page.tsx` | Form index, filtered by role (catalog from `config/navigation.ts`) | `(app)` shell |
| `/forms/clo-raw-data` | `app/(app)/forms/clo-raw-data/` | Class-record upload panel + per-student entry (absorbed old `/faculty`) | `layout.tsx` + `page.tsx` → `requireRole(formRoles("clo_raw_data"))` |
| `/forms/course-assessment-report` | `app/(app)/forms/course-assessment-report/` | 7-part tabbed CAR | `(app)` shell (nav-filtered) |
| `/forms/attainment/{clo-attainment-summary,plo-attainment-summary,cohort-tracking}` | `app/(app)/forms/attainment/…` | Roll-up chain generate + display | `(app)` shell |
| `/forms/cqi/{plo-gap-analysis,cqi-action-plan,closing-the-loop,annual-program-report}` | `app/(app)/forms/cqi/…` | CQI / ACT loop | `(app)` shell |
| `/forms/plan/{curriculum-map,assessment-calendar,target-setting-matrix,assessment-budget}` | `app/(app)/forms/plan/…` | PLAN-phase setup forms | `(app)` shell |
| `/forms/check/{mid-cycle-attainment,peer-observation,exhibition-feedback,clo-perception-survey,student-exit-survey,portfolio-assessment,capstone-panel}` | `app/(app)/forms/check/…` | 7 CHECK-stage supporting instruments | `(app)` shell |
| `/submissions` | `app/(app)/submissions/page.tsx` | "My Submissions" inbox (`GET /forms?scope=mine`) | `requireUser` in page |
| `/approvals` | `app/(app)/approvals/page.tsx` | "Pending Approvals" inbox (`GET /forms?scope=pending`) | `requireRole(APPROVER_ROLES)` in page |
| `/plo-management` | `app/(app)/plo-management/` | PLO entity CRUD (auto-sequenced codes) | `layout.tsx` → `requireRole(PLO_MANAGEMENT_ROLES)` (dean) |
| `/archives` | `app/(app)/archives/page.tsx` | Cluster list (read-only, placeholder content) | `layout.tsx` → `requireRole(ARCHIVE_ROLES)` |
| `/archives/[clusterId]` | `app/(app)/archives/[clusterId]/page.tsx` | Read-only per-student snapshot (placeholder content) | inherits archives layout |
| `/faculty` | `app/faculty/page.tsx` | **Legacy redirect** → `/forms/clo-raw-data` | — |

Supporting: `proxy.ts` (coarse auth gate), `app/(app)/layout.tsx` + `components/layout/app-shell.tsx` (auth gate + shell), `components/layout/app-sidebar.tsx` (registry-driven), `lib/role-access.ts`, `lib/roles.ts`, `config/navigation.ts`, `lib/api-client.ts`, `server/api-client.ts`, `server/auth.ts`, `server/actions/`, `utils/env.ts`.

The 7 Periodic/ACT screens (`resource_monitoring`, `alumni_tracer`, `employer_satisfaction_survey`, `systemic_gap_report`, `capa_plan`, `institutional_review`, `portfolio_roadmap`) have **no routes yet** — the backend `/api/v1/periodic` plugin is live, the frontend screens are not.

## 2. Architecture

### 2.1 Routing (App Router)

- `app/(auth)/login`, `app/(auth)/register` — guest-only auth screens (`requireGuest`).
- `app/onboarding` — post-login role picker for accounts still at role `user`.
- `app/(app)/` — authenticated area behind a layout that checks the session and renders the app shell (sidebar + header). Accounts with `role === "user"` are **redirected to `/onboarding`** — they never see the shell.
  - `dashboard` — **single adaptive route** rendering the authenticated role's dashboard via a registry (`app/(app)/dashboard/role-dashboard.tsx`).
  - `forms/...` — one route group per form, keyed by **stable form code** (see below); grouped by PDCA phase (Data Capture / Attainment / CQI / PLAN / CHECK).
  - `submissions`, `approvals` — the two inboxes.
  - `plo-management` — dean-only PLO CRUD.
  - `archives` — read-only **graduation-cluster archives**, gated to `aqau`/`vpaa`/`dean`/`system_admin`.

Form routes key off the stable snake_case codes (see `../backend/SYSTEM-DESIGN.md` §5). The manual's `F##` numbers are provisional — do not use them in URLs or UI.

### 2.2 Role-gating & authorization (proxy + server layouts)

The frontend uses **both** layers, each doing what it does best — the backend remains the source of truth for enforcement (the client only hides/navigates):

- **`proxy.ts`** (Next 16 `proxy`, formerly middleware) — the **coarse** gate. It only covers `/dashboard`, `/forms`, `/archives` (`PROTECTED_PREFIXES` + `matcher`): it checks for the better-auth session cookie prefix (`obelisk-app.session`) and redirects unauthenticated requests to `/login?next=…`. It never authorizes — reading a cookie is all it does. The newer routes (`/submissions`, `/approvals`, `/plo-management`, `/onboarding`) are **not** in the proxy matcher; they rely entirely on `requireUser`/`requireRole` below.
- **`app/(app)/layout.tsx`** (Server Component) — real session validation via `server/auth.requireUser()` → `GET /auth/me`; redirects to `/login` when invalid, and to `/onboarding` for role-less `user` accounts.
- **Role-restricted routes** call `requireRole([...])` — either in a nested `layout.tsx` (`forms/clo-raw-data`, `archives`, `plo-management`) or directly in the **page** (`approvals`). Unauthorized roles are redirected to `/dashboard`.
- **`lib/role-access.ts`** — **central role → feature/form access map**: `USER_ROLES`, `FEATURE_ACCESS` (allow-lists: `captureClassRecords`, `archive`, `viewArchives`, `approveForms`, `managePlos`, `manageRoleRequests`, `confirmClusterCompile`, `generateAiInsights`), `FORM_ACCESS` (per-form preparers + chain), helpers `formRoles`/`featureRoles`/`canAccess`. Pure data (no imports); mirrors `backend/lib/role-access.ts` + `backend/lib/forms/approval-routes.ts`, drift-guarded by `backend/test/unit/role-access-sync.test.ts`.
- **`lib/roles.ts`** — re-exports the `lib/role-access.ts` vocabulary (role groups `ACADEMIC_ROLES`, `ARCHIVE_ROLES`, `APPROVER_ROLES`, `PLO_MANAGEMENT_ROLES`, `CLASS_RECORD_ROLES`, `ADMIN_ROLES`, `QA_ROLES`) plus `hasAccess`, `ROLE_LABELS`, and scope resolvers (`scopeForRole`). Nav and route gates are filtered through it.

### 2.3 Layout & shell

- **`app/(app)/layout.tsx`** — resolves the session and renders `components/layout/app-shell.tsx` (`SidebarProvider` + `AppSidebar` + `SiteHeader` + children).
- **`components/layout/app-sidebar.tsx`** — role-aware sidebar built from `config/navigation.ts`; footer `NavUser` shows the real user + role.
- **`components/layout/site-header.tsx`** — derives its title from `titleForPathname(pathname)`.

### 2.4 Navigation & route registry (`config/navigation.ts`)

Single source of truth (a plain `.ts` module — icons are referenced as components) for what is in the sidebar and which roles may reach each route. Adding a route = add an entry here **and** create its page. Exports:

- `FORM_SECTIONS` (internal) — the forms catalog grouped by PDCA phase; each item carries `url`, `roles?` (allow-list, empty = any authenticated role) and the stable `code` used by the inboxes.
- `navSectionsFor(role)` — role-filtered forms catalog for the sidebar/forms index.
- `workspaceNav(role)` — top-level workspace links: Dashboard, **PLO Management** (dean), **My Submissions** (all), **Pending Approvals** (`APPROVER_ROLES`), Archives (`aqau`/`vpaa`/`dean`/`system_admin`).
- `INSTITUTION_NAV` — secondary group (currently only the Faculty Directory entry).
- `formPathByCode` — stable code → screen path, used by the inboxes to deep-link a record back to its form screen.
- `itemVisible(item, role)`, `titleForPathname(pathname)`.

### 2.5 API client layer

- **`lib/api-client.ts`** — browser client: typed `api.get/post/put/patch/delete`, cookie credentials, `NEXT_PUBLIC_API_URL`, error handling (`ApiError`), and the `MeResponse`/`ApiUser` types. All data flows through it — no inline fetch in pages. Use for reads/actions that don't need server-side auth forwarding.
- **`server/api-client.ts`** — `server-only` variant that forwards request cookies to the backend for Server Component data fetching (`getMe`, `serverApi`). **`actionApi`** is the Server Action variant: it forwards the browser's cookies **and** relays the backend's `Set-Cookie` headers onto the outgoing response so better-auth session cookies land on the frontend origin (matching the `proxy.ts` cookie check); failures throw `ApiError`.
- **`server/auth.ts`** — server guards (`currentUser`, `requireUser`, `requireGuest`, `requireRole`, `requireRoleOrNotFound`).
- **`server/actions/`** — all `"use server"` Server Actions, one file per domain: `auth.ts`, `car.ts`, `rollup.ts`, `cqi.ts`, `plan.ts`, `check.ts`, `academic.ts`, `forms.ts`, `ai.ts` (AI CQI recommendation: `getLatestAiRecommendationAction` / `generateAiRecommendationAction` → `/ai/recommendation/*`, generation role-gated to `generateAiInsights`). They are the frontend's mutation/read layer: each action authenticates/authorizes, calls `actionApi`, and returns a serializable `ActionResult` (`{ ok: true, data } | { ok: false, error }`); success navigations use `redirect()`. Client components import these actions — mutations never call `api.post` directly.

**Dev-mode role simulation:** when `DEVELOPMENT=true` the guards short-circuit to the dev user in `server/api-client.ts`. `DEV_ROLE` there currently simulates **`dean`** (nav, dashboards, and — when `DEV_ENFORCE_ROLE_ACCESS` in `lib/dev-mode.ts` is `true`, currently **`false`** — route gates) without an account. The backend still enforces auth.

## 3. Role & Scope Matrix

Backend status quo from `../backend/SYSTEM-DESIGN.md` §3; the frontend maps each role to a scoped dashboard and an allowed route set. "Scope" indicates what the dashboard filters to — data is still enforced server-side.

| Role | `/dashboard` renders | Route scope |
| --- | --- | --- |
| `faculty` | own `ClassSection`/courses: load, upload, at-risk watchlist, CAR drafts | forms: academic; `/forms/clo-raw-data`, `/forms/course-assessment-report`; `/submissions` |
| `program_chair` | own `Program`: attainment, targets, approvals, gap/CQI | academic forms + roll-ups (broader); `/submissions`, `/approvals` |
| `dean` | own `Department`: endorsements, budgets, sign-offs | academic + archives + **`/plo-management`** + `/approvals` + `/submissions` |
| `aqau` | institution-wide QA: filings, cohort tracking, cluster confirm | archives + everything + `/approvals` + `/submissions` |
| `vpaa` | institution-wide: CAPA/budget, institutional decisions | archives + everything + `/approvals` + `/submissions` |
| `system_admin` | everything + admin | everything + archives + `/approvals` + `/submissions` |
| `user` | never rendered — the `(app)` layout redirects to `/onboarding` (role picker / request status) | none |

`/submissions` is open to **every** authenticated role; `/approvals` is limited to `APPROVER_ROLES` (program_chair, dean, aqau, vpaa, system_admin) and the backend re-checks the per-step role match on every decision.

## 4. Component Architecture

### Shared OBE form primitives

The intended `components/obe/` package was never built; the shared primitives that exist today are:

- **`components/reui/frame.tsx` / `reui/badge.tsx` / `reui/filters.tsx`** — form frames, status badges, filter chrome.
- **`components/reui/data-grid/*`** — the TanStack Table-based grid family (virtual scrolling, column visibility/filtering, pagination, dnd rows). This is the table primitive for all forms (there is no `components/data-table.tsx`).
- **`components/ui/status.tsx`** — `Status` / `statusVariants` badge display.
- **`components/ui/form-select.tsx`**, **`ui/program-select.tsx`**, **`ui/term-select.tsx`**, **`ui/class-section-select.tsx`** — shared selects; the academic ones are populated by `server/actions/academic.ts` (`/academic/programs|terms|class-sections`).
- **`components/ui/field.tsx`**, **`ui/attachment.tsx`**, **`ui/toast.tsx`**, **`ui/drawer.tsx`**, **`ui/spinner.tsx`** — field wrappers, upload display, notifications, drawers, loading.
- **`lib/constants/obe.ts`** — the shared `ROOT_CAUSES` (6-category) constant; add new cross-form OBE constants here.
- **`components/forms/form-workflow.tsx`** — the shared approval bar (status badge, approval stepper with comments, Submit / Approve / Return-with-comment / Archive), embedded on all 13 Phase 0–5 screens (including `/forms/clo-raw-data`). Not yet on the 7 CHECK screens (their payloads use `payload.id`, not `payload.formSubmissionId` — see `../roadmap.md`).
- **`components/forms/form-placeholder.tsx`** — titled scaffold wrapper (title + stable code + PDCA stage) that renders `children`, falling back to a "pending" panel when a screen has no content yet.

Still missing (tracked in `../roadmap.md`): dedicated `status-badge`/`ipd-selector`/`cohort-selector`/`root-cause-selector`/`blooms-selector`/`rubric-scale`/`likert-scale`/`loop-status-badge`/`row-editor-table`/`form-header`/`computed-cell` primitives — screens currently inline these.

### Form-render strategy

- **Auth screens** use `react-hook-form` + Zod (`components/auth/login-form.tsx`) — the only RHF consumer today.
- **OBE form screens** are controlled components: local `useState`/Jotai atoms hold the draft, and mutations go through Server Actions. Client-side Zod schemas mirroring backend `model.ts` were planned but not yet adopted — backend validation is authoritative.
- **Computed values** (attainment %, status badges, totals, divergence flags, loop status, at-risk) are **returned by the backend**, never recomputed client-side; the screens render them read-only.

## 5. Data Flow

### 5.0 Client state (Jotai store)

Frontend client state is managed with **Jotai** (`lib/store/`). The graph is
mounted by `StoreProvider` in the root layout; atoms live in
`lib/store/atoms/` grouped by domain (`user`, `forms`, `ingest`,
`attainments`, `governance`, `plan`, `cqi`, plus `academic` and `car`).

- **Reads** use `useAtomValue(atom)`; **writes** use `useSetAtom(actionAtom)`;
  `useAtom` is only used when a component genuinely needs both.
- **`lib/store/async-atom.ts`** provides `atomWithAsyncData(initial, fetcher)`
  (auto-fetch on first subscription, `unwrap`-based sync fallback, write-only
  `refreshAtom`) and `atomWithMockData(seed)` for datasets whose rollup
  endpoint does not exist yet — swapping to real data is a one-line change.
- **Mock data** lives in `components/charts/obe-sample-data.ts`. It is read by
  atoms *and* directly by some consumers (chart components, the inbox's
  dev-preview rows, `curriculum-coverage-grid`) — treat it as the single
  sample-data module, not a per-component fixture.
- **DB-backed now:** `formSubmissionsDataAtom` fetches `GET /forms`
  (cookie auth, browser-only — never during SSR) and `formStatusCountsAtom`
  derives the status donut from it (mock fallback only while loading/error);
  `mySubmissionsDataAtom` / `pendingApprovalsDataAtom` fetch
  `GET /forms?scope=mine|pending` for the inboxes. `userAtom` is seeded from
  the server-resolved session via `SessionInitializer` in `app/(app)/layout.tsx`.
- **Ingest state** (`atoms/ingest.ts`) holds upload/polling/result state as
  atoms + action atoms; `ClassRecordUpload` polls and writes results into them
  so any consumer can react to a completed import.
- **Form drafts** (`atoms/car.ts`) hold the in-progress CAR payload
  (`carPayloadAtom` + dirty/reset atoms); other forms keep drafts locally.
- **Mutations stay server-side**: Server Actions (`server/actions/`) remain the
  only path for authenticated writes; Jotai mirrors the resulting state on the
  next navigation (e.g. `userAtom` re-seeded after a role change).

### 5.1 Form submission

```
User edits form ──> controlled component state / Jotai draft atom
   ──> server/actions/<domain>.ts (Server Action, "use server")
        ── actionApi (server/api-client.ts) ──POST api/v1/<plugin>/*──> backend
           (e.g. /car/generate, /rollup/*/generate, /cqi/*/generate,
            /plan/*/init + /plan/:id, /check/:slug/init + PUT /check/:slug/:id)
        ──< server-validated + computed fields (attainment %, status) <──
        ──> returns ActionResult ({ ok, data } | { ok, error })
   ──> rendered read-only via badges / grid cells
```

Workflow state changes are a separate path — `server/actions/forms.ts` posts to
`/forms/:id/submit`, `/forms/:id/approve/:role`, `/forms/:id/return`,
`/forms/:id/archive`. The backend derives the approval chain from the form's
stable code (`backend/lib/forms/approval-routes.ts`) and enforces ownership +
role match; the client never sends steps or RBAC decisions.

### 5.2 Class-record import (clo_raw_data)

```
CSV/TSV/XLS/XLSX ──> /forms/clo-raw-data (ClassRecordUpload, client validation)
   ──> backend ingest (auth + persistence) ──> python-server (pure-compute ETL:
        AUN-OBE v2 template extraction) ──> StudentScore / AssessmentItem rows ──> per-student form
```

The frontend calls the **backend only**; the backend forwards to the python-server ETL. Do not call python-server from the browser.

### 5.3 Rollups & dashboards

```
course_assessment_report ──> clo_attainment_summary ──> plo_attainment_summary ──> cohort_tracking
        ──> role scoped dashboards (KPI cards / charts)
```

Chart/table data comes from backend rollup endpoints (`server/actions/rollup.ts`); dashboards still render sample charts for the atoms that aren't wired yet (see §7).

## 6. Component Inventory (current)

- `components/layout/` — `app-shell`, `app-sidebar`, `site-header`, `nav-workspace` (registry-driven SidebarNav), `nav-secondary`, `nav-user`.
- `components/auth/` — `login-form`, `register-form`, `google-sign-in-button`, `sign-out-button`, `select-role`, `onboarding-form`, `role-requests-panel`, `page-notice`.
- `components/dashboard/` — `role-dashboard-shell` (`DashboardShell`, `StatCard`, `PendingSection`), `ai-suggestions-drawer` (fetches the latest persisted AI recommendation via `server/actions/ai.ts` on first open; role-gated generate/regenerate, Markdown rendered with the `typeset` classes — no markdown library), plus the per-role dashboards under `app/(app)/dashboard/`.
- `components/forms/` — `form-workflow`, `form-placeholder`, `class-record-upload` (the `/forms/clo-raw-data` screen), `upload-history-table`, `clo-plo-map-panel`, `curriculum-coverage-grid`, `cohort-tracking-grid`, plus the 19 form-screen components (`car-form`, `clo-summary-form`, `plo-summary-form`, `cohort-tracking-form`, `plo-gap-analysis-form`, `cqi-action-plan-form`, `ctl-form`, `apar-form`, `curriculum-map-form`, `assessment-calendar-form`, `target-setting-matrix-form`, `assessment-budget-form`, and the 7 CHECK forms) covering the 20 screens in §1.
- `components/inbox/` — `submission-inbox` (shared by `/submissions` and `/approvals`, dev-preview sample rows).
- `components/outcomes/` — `plo-management-panel` (dean-only PLO CRUD).
- `components/charts/` — `attainment-charts`, `cqi-charts`, `governance-charts`, `ingest-charts`, `plan-charts`, `chart-card`, `pie-donut-layout`, `obe-sample-data`.
- `components/evilcharts/` — ECharts wrappers (`ECharts*Chart`), the preferred chart engine.
- `components/reui/` — `frame`, `badge`, `filters`, `data-grid/*` (TanStack Table grids).
- `components/branding/` — `obelisk-logo`, `icons`; `components/upload/file-upload`; `components/theme.tsx` (`Theme` provider, mounted in `app/layout.tsx`); `components/examples/` (scratch/template screens).
- `components/ui/` — shadcn primitives plus `status`, `toast`, `drawer`, `field`, `form-select`, `program-select`, `term-select`, `class-section-select`, `attachment`, `spinner`, `button-group`, `input-group`, `kbd`, …
- `hooks/use-mobile.ts` for responsive behavior.

Removed: old demo `nav-main`, `nav-documents`, `section-cards`, `chart-area-interactive`, `data-table`, top-level `login-form`/`app-shell`/`app-sidebar` (all moved or replaced).

## 7. Current State & Next Work

Done: auth-gated app shell, API client layer, role-scoped routing, adaptive dashboards, 20 wired form screens (13 Phase 0–5 + 7 CHECK), approval workflow bar + inboxes, dean-only PLO management, CLO↔PLO connection panel, class-record upload with ETL polling.

Remaining, in rough priority:

1. Embed `FormWorkflow` on the 7 CHECK screens (payloads use `payload.id` rather than `payload.formSubmissionId`).
2. The 7 Periodic/ACT screens (`/forms/periodic/*`) against the live backend plugin.
3. Wire the remaining dashboard atoms to real endpoints; populate stat cards on the 6 role dashboards.
4. Archives content — pages exist but render placeholder data until the backend `archival-service` compiles clusters (after PEO attainment capture).
5. Export / print (PDF / Excel / Word) on form screens.
6. Adopt shared client-side Zod schemas (or a monorepo package) so client validation mirrors `backend/*/model.ts`.
7. Async upload UX for large class-record files (progress, retry, error states); archive detail-artifact streaming.

## 8. Open Questions

- Shared Zod schemas between frontend/backend (monorepo package) vs. duplicated — currently no client schemas at all for OBE forms; decide before adding client-side validation.
- PDF/export rendering of completed forms (`ReportExport`) — decide client-side print sheet vs. backend-rendered artifact.
- Archive detail-artifact streaming (object-storage URL) vs. backend-proxied download for the `archives/[clusterId]` viewer.
- Backend is the session source of truth; when `/auth/me` handles token-silent refresh, mirror that in `lib/api-client.ts`.
- `INSTITUTION_NAV` links to `/people` (Faculty Directory) but no such route exists yet — build or remove.
