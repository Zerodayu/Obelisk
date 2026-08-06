# Obelisk Frontend — System Design

> **Status:** Early — shell, login, and a **role-scoped routed architecture** exist: a single adaptive `/dashboard`, a registry-driven role-gated app shell, an API client layer, and form route groups. No OBE form is wired to the backend yet (backend is mid-build); screens render placeholders until the contract lands.

**Stack:** Next.js 16 (App Router, server components by default — proxy renamed from middleware) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · react-hook-form + Zod · @tanstack/react-table · recharts · base-ui/react · dnd-kit · motion. Backend: Elysia at `api/v1` (see `../backend/SYSTEM-DESIGN.md`).

---

## 1. Current State

| Route | File | Purpose | Guard |
| --- | --- | --- | --- |
| `/` | `app/page.tsx` | Redirects to `/dashboard` | — |
| `/login` | `app/(auth)/login/page.tsx` + `components/login-form.tsx` | Sign-in (better-auth email/password) | public |
| `/dashboard` | `app/(app)/dashboard/page.tsx` | **Single adaptive home** → `role-dashboard.tsx` renders the role's scoped dashboard | `(app)` shell |
| `/forms` | `app/(app)/forms/page.tsx` | Form index, filtered by role (list from `lib/navigation.tsx`) | `(app)` shell |
| `/forms/clo-raw-data` | `app/(app)/forms/clo-raw-data/` | Class-record upload panel + per-student entry (absorbed old `/faculty`) | academic roles |
| `/forms/course-assessment-report` | `app/(app)/forms/course-assessment-report/` | CAR hub placeholder | academic roles |
| `/forms/attainment/{clo-attainment-summary,plo-attainment-summary,cohort-tracking}` | `app/(app)/forms/attainment/…` | Roll-up placeholders | `(app)` shell |
| `/forms/cqi/{plo-gap-analysis,cqi-action-plan,closing-the-loop}` | `app/(app)/forms/cqi/…` | CQI placeholders | `(app)` shell |
| `/forms/plan/{curriculum-map,assessment-calendar,target-setting-matrix,assessment-budget}` | `app/(app)/forms/plan/…` | PLAN-phase placeholders | `(app)` shell |
| `/archives` | `app/(app)/archives/page.tsx` | Cluster list placeholder (read-only) | aqau/vpaa/dean/system_admin |
| `/archives/[clusterId]` | `app/(app)/archives/[clusterId]/page.tsx` | Read-only per-student snapshot placeholder | aqau/vpaa/dean/system_admin |
| `/faculty` | `app/faculty/page.tsx` | **Legacy redirect** → `/forms/clo-raw-data` | — |

Supporting: `proxy.ts` (coarse auth gate), `app/(app)/layout.tsx` + `components/app-shell.tsx` (auth gate + shell), `components/app-sidebar.tsx` (registry-driven), `lib/roles.ts`, `lib/api-client.ts`, `server/api-client.ts`, `server/auth.ts`, `lib/navigation.tsx`.

## 2. Target Architecture

### 2.1 Routing (App Router)

- `app/(auth)/login` — sign-in; redirects by role after auth.
- `app/(app)/` — authenticated area behind a layout that checks the session and renders the app shell (sidebar + header).
  - `dashboard` — **single adaptive route** rendering the authenticated role's dashboard via a registry (`app/(app)/dashboard/role-dashboard.tsx`).
  - `forms/...` — one route group per form, keyed by **stable form code** (see below).
  - `archives` — read-only **graduation-cluster archives**, gated to `aqau`/`vpaa`/`dean`/`system_admin`.

Form routes key off the stable snake_case codes (see `../backend/SYSTEM-DESIGN.md` §5). The manual's `F##` numbers are provisional — do not use them in URLs or UI.

### 2.2 Role-gating & authorization (proxy + server layouts)

The frontend uses **both** layers, each doing what it does best — the backend remains the source of truth for enforcement (the client only hides/navigates):

- **`proxy.ts`** (Next 16 `proxy`, formerly middleware) — the **coarse** gate. On `/dashboard`, `/forms`, `/archives` (and `/login` is excluded), it checks for the better-auth session cookie prefix (`obelisk-app.session`) and redirects unauthenticated requests to `/login?next=…`. It never authorizes — reading a cookie is all it does.
- **`app/(app)/layout.tsx`** (Server Component) — real session validation via `server/auth.requireUser()` → `GET /auth/me`; redirects to `/login` when invalid.
- **Role-restricted route groups** get their own nested `layout.tsx` calling `requireRole([...])` (e.g. `forms/clo-raw-data`, `archives`). Unauthorized roles are redirected to `/dashboard`.
- **`lib/roles.ts`** — central allow/deny logic (`hasAccess`, role groups, scope resolvers). Nav/routes/forms are filtered through it.

### 2.3 Layout & shell

- **`app/(app)/layout.tsx`** — resolves the session and renders `components/app-shell.tsx` (`SidebarProvider` + `AppSidebar` + `SiteHeader` + children).
- **`components/app-sidebar.tsx`** — role-aware sidebar built from `lib/navigation.tsx`; footer `NavUser` shows the real user + role.
- **`components/site-header.tsx`** — derives its title from `titleForPathname(pathname)`.

### 2.4 Navigation & route registry (`lib/navigation.tsx`)

Single source of truth for what is in the sidebar and which routes each role may reach. Adding a role or a route = add/edit an entry here (plus the corresponding page under `app/`). `navSectionsFor(role)` filters the forms catalog by role; `workspaceNav(role)` / `INSTITUTION_NAV` cover top-level links. All navigation derives from it — no scattered menu definitions.

### 2.5 API client layer

- **`lib/api-client.ts`** — browser client: typed `api.get/post/put/patch/delete`, cookie credentials, `NEXT_PUBLIC_API_URL`, error handling (`ApiError`), and the `MeResponse`/`ApiUser` types. All data flows through it — no inline fetch in pages.
- **`server/api-client.ts`** — `server-only` variant that forwards request cookies to the backend for Server Component data fetching (`getMe`, `serverApi`).
- **`server/auth.ts`** — server guards (`currentUser`, `requireUser`, `requireRole`, `requireRoleOrNotFound`).

**Dev-mode role simulation:** when `DEVELOPMENT=true` the guards short-circuit to the dev user in `server/api-client.ts`. Edit `DEV_ROLE` there to simulate a role (nav, dashboards, and — when `DEV_ENFORCE_ROLE_ACCESS` in `lib/dev-mode.ts` is `true`, the default — route gates) without an account. The backend still enforces auth.

## 3. Role & Scope Matrix

Backend status quo from `../backend/SYSTEM-DESIGN.md` §3; the frontend maps each role to a scoped dashboard and an allowed route set. "Scope" indicates what the dashboard filters to — data is still enforced server-side.

| Role | `/dashboard` renders | Route scope |
| --- | --- | --- |
| `faculty` | own `ClassSection`/courses: load, upload, at-risk watchlist, CAR drafts | forms: academic; `/forms/clo-raw-data`, `/forms/course-assessment-report` |
| `program_chair` | own `Program`: attainment, targets, approvals, gap/CQI | academic forms + roll-ups (broader) |
| `dean` | own `Department`: endorsements, budgets, sign-offs | academic + archives |
| `aqau` | institution-wide QA: filings, cohort tracking, cluster confirm | archives + everything |
| `vpaa` | institution-wide: CAPA/budget, institutional decisions | archives + everything |
| `system_admin` | everything + admin | everything + archives |
| `user` | "Getting started" (no scope) | dashboard only |

## 4. Component Architecture

### Shared OBE form primitives (`components/obe/` — target)

Build once, reuse across all forms (defined in `frontend/AGENTS.md`):

- `status-badge` — CLO/PLO MET/NOT MET and Exceptional/Proficient/Basic/Below Basic.
- `ipd-selector` — I-P-D stage checkbox set.
- `cohort-selector` — Y1-Y4 checkbox set.
- `root-cause-selector` — fixed 6-category select.
- `blooms-selector` — 6-level select.
- `rubric-scale` — 4-point rubric input + display badge.
- `likert-scale` — 5-point Likert input group.
- `loop-status-badge` — CLOSED/OPEN display.
- `row-editor-table` — dynamic add/remove-row tables and add/remove-column grids.
- `form-header` / `form-footer` — shared metadata + signature blocks.
- `computed-cell` — read-only display of backend-computed values.

**Current scaffolding:** `components/dashboard/role-dashboard-shell.tsx` (`DashboardShell`, `StatCard`, `PendingSection`) and `components/forms/form-placeholder.tsx` hold routes open with a scoped placeholder until each form is wired.

### Form-render strategy

- Each form = `react-hook-form` + Zod schema (mirrors backend `model.ts`), submitting JSON to the backend.
- **Dynamic structure** rendered from `useFieldArray`/`useWatch` over the row-editor tables.
- **Computed values** (attainment %, status badges, totals, divergence flags, loop status, at-risk) are **returned by the backend**, not recomputed client-side; `computed-cell` renders them read-only.

## 5. Data Flow

### 5.1 Form submission

```
User edits form ──> react-hook-form + Zod (client validation mirrors backend)
   ──> lib/api-client.ts ──POST api/v1/forms/:code──> backend
   ──< server-validated + computed fields (attainment %, status, approvals) <──
   ──> rendered read-only via computed-cell / badges
```

### 5.2 Class-record import (clo_raw_data)

```
CSV/TSV/XLS/XLSX ──> /forms/clo-raw-data (ClassRecordUpload, client validation)
   ──> backend ingest (auth + persistence) ──> python-server (pure-compute ETL:
        Formula 1A direct attainment) ──> StudentScore / AssessmentItem rows ──> per-student form
```

The frontend calls the **backend only**; the backend forwards to the python-server ETL. Do not call python-server from the browser.

### 5.3 Rollups & dashboards

```
course_assessment_report ──> clo_attainment_summary ──> plo_attainment_summary ──> cohort_tracking
        ──> role scoped dashboards (KPI cards / charts)
```

Chart/table data comes from backend rollup endpoints; dashboards currently render placeholder cards until those land.

## 6. Component Inventory (current)

`components/`: `app-shell`, `app-sidebar`, `site-header`, `nav-workspace` (registry-driven SidebarNav), `nav-secondary`, `nav-user`, `login-form`, `theme-provider`, `motion/file-upload`, `dashboard/role-dashboard-shell`, `forms/form-placeholder`, `logo`, `icons`, plus `ui/*` shadcn primitives. Removed: old demo `nav-main`, `nav-documents`, `section-cards`, `chart-area-interactive`, `data-table` (replaced by role-scoped shells). `hooks/use-mobile.ts` for responsive behavior.

## 7. Build Priority (mirrors backend)

1. ✅ Auth-gated app shell + API client layer + role-scoped routing (this pass).
2. `forms/clo-raw-data` — per-student entry + CSV import (wire the upload to `POST /ingest/upload`).
3. `forms/course-assessment-report` — CAR hub UI with computed parts.
4. Rollup screens: `clo-attainment-summary` → `plo-attainment-summary` → `cohort-tracking`.
5. CQI/ACT screens: `plo-gap-analysis` → `cqi-action-plan` → `closing-the-loop`.
6. PLAN-phase setup forms (`curriculum-map`, `assessment-calendar`, `target-setting-matrix`, `assessment-budget`).
7. Remaining DO/CHECK + periodic/institutional forms (see backend catalog; lowest MVP urgency).
8. **Archives** (`archives/` viewer) — implemented alongside the backend `archival-service`, **after PEO attainment is captured**.

## 8. Open Questions

- Shared Zod schemas between frontend/backend (monorepo package) vs. duplicated — currently duplicated and must be kept in sync.
- PDF/export rendering of completed forms (`ReportExport`) — decide client-side print sheet vs. backend-rendered artifact.
- Async upload UX for large class-record files — extend `ClassRecordUpload` (progress, retry, error states).
- Archive detail-artifact streaming (object-storage URL) vs. backend-proxied download for the `archives/[clusterId]` viewer.
- Backend is the session source of truth; when `/auth/me` handles token-silent refresh, mirror that in `lib/api-client.ts`.
