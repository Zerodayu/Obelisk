# Obelisk Frontend — System Design

> **Status:** Early — dashboard shell, login, and a class-record file-upload preview exist; no OBE forms are wired to the backend yet. This records the **current state** and the **target** UI architecture mapped from the JMCFI OBE forms.

**Stack:** Next.js 16 (App Router, server components by default) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · react-hook-form + Zod · @tanstack/react-table · recharts · base-ui/react · dnd-kit · motion. Backend: Elysia at `api/v1` (see `../backend/SYSTEM-DESIGN.md`).

---

## 1. Current State

| Route | File | Purpose |
| --- | --- | --- |
| `/` | `app/page.tsx` | Landing placeholder (create-next-app boilerplate) |
| `/login` | `app/(auth)/login/page.tsx` + `components/login-form.tsx` | Sign-in (better-auth email/password) |
| `/dashboard` | `app/dashboard/page.tsx` | Shell: `AppSidebar` + `SiteHeader` + `SectionCards` + `ChartAreaInteractive` + `DataTable` (uses `app/dashboard/data.json`) |
| `/faculty` | `app/faculty/page.tsx` | Class-record **file upload preview** (`components/motion/file-upload.tsx`) — accepts `.csv/.tsv/.xls/.xlsx` |

Supporting: `app/layout.tsx` (theme provider + fonts), `components/app-sidebar.tsx`, `components/nav-*.tsx`, `components/site-header.tsx`, `components/theme-provider.tsx`, `lib/utils.ts`.

## 2. Target Architecture

### 2.1 Routing (App Router)

- `app/(auth)/login` — sign-in; redirects by role after auth.
- `app/(app)/` — authenticated area behind a layout that checks the session and renders the app shell (sidebar + header).
  - `dashboard` — program/role dashboards (KPI cards, charts).
  - `forms/...` — one route group per form, keyed by **stable form code**:
    - `forms/clo-raw-data` (per-student entry + CSV import)
    - `forms/course-assessment-report` (CAR hub, 7 parts)
    - `forms/attainment/...` (`clo-attainment-summary`, `plo-attainment-summary`, `cohort-tracking`)
    - `forms/cqi/...` (`plo-gap-analysis`, `cqi-action-plan`, `closing-the-loop`)
    - `forms/plan/...`, `forms/do-check/...`, `forms/institutional/...` (remaining catalog)
- `app/faculty` — evolves into the per-student raw-data entry + import screen.

Route naming uses the stable snake_case codes (see `../backend/SYSTEM-DESIGN.md` §5). The manual's `F##` numbers are provisional — do not use them in URLs or UI.

### 2.2 Layout & shell

- **App shell** — `SidebarProvider` + `AppSidebar` (role-aware nav via `nav-main`/`nav-secondary`/`nav-documents`) + `SiteHeader`, as in `app/dashboard/page.tsx`.
- **Role-gating** — nav items and routes filtered by the authenticated user's `role` (faculty, program_chair, dean, aqau, vpaa, system_admin). Backend enforces authority; the client only hides/navigates.
- **Theme** — `next-themes` via `ThemeProvider`; dark mode supported.

### 2.3 API client layer

A single client module (e.g. `lib/api.ts`) wraps the backend at `api/v1` with cookie credentials and typed responses. All data flows through it — no inline fetch in pages. Auth session via better-auth endpoints; `auth/me` powers the nav/user menu.

## 3. Component Architecture

### 3.1 Shared OBE form primitives (`components/obe/` — target)

Build once, reuse across all forms (defined in `frontend/AGENTS.md`):

- `status-badge` — CLO/PLO MET/NOT MET and Exceptional/Proficient/Basic/Below Basic.
- `ipd-selector` — I-P-D stage checkbox set.
- `cohort-selector` — Y1-Y4 checkbox set.
- `root-cause-selector` — fixed 6-category select.
- `blooms-selector` — 6-level select.
- `rubric-scale` — 4-point rubric input + display badge.
- `likert-scale` — 5-point Likert input group.
- `loop-status-badge` — CLOSED/OPEN display.
- `row-editor-table` — dynamic add/remove-row tables (courses, PLOs, students) and add/remove-column grids (per-year cohorts, per-PLO columns).
- `form-header` / `form-footer` — shared metadata + signature blocks for every form.
- `computed-cell` — read-only display of backend-computed values (attainment %, cohort avg, totals) with inline loading/skeleton.

### 3.2 Form-render strategy

- Each form = `react-hook-form` + Zod schema (schema mirrors backend `model.ts`), submitting JSON to the backend.
- **Dynamic structure** (variable PLO/course/cohort counts) rendered from `useFieldArray`/`useWatch` over the row-editor tables.
- **Computed values** (attainment %, status badges, totals, divergence flags, loop status, at-risk) are **returned by the backend**, not recomputed client-side; `computed-cell` renders them as read-only.
- Read-only guidance content (attainment-level descriptor tables, computation guides) renders as static reference blocks.

## 4. Data Flow

### 4.1 Form submission

```
User edits form ──> react-hook-form + Zod (client validation mirrors backend)
   ──> lib/api.ts ──POST api/v1/forms/:code──> backend
   ──< server-validated + computed fields (attainment %, status, approvals) <──
   ──> rendered read-only via computed-cell / badges
```

### 4.2 Class-record import (clo_raw_data)

```
CSV/TSV/XLS/XLSX ──> faculty page upload (FileUpload, validation)
   ──> backend ingest (auth + persistence)
   ──> python-server (pure-compute ETL: Formula 1A direct attainment; see ../python-server/SYSTEM-DESIGN.md)
   ──> StudentScore / AssessmentItem rows ──> per-student raw-data form
```

The frontend calls the **backend only**. The backend forwards the file to the `python-server` ETL service (the pure-compute owner of spreadsheet formulas) and persists the returned attainment. Do not call python-server (`:8000`) directly from the browser. Mimics the existing `app/faculty/page.tsx` upload UX (`components/motion/file-upload.tsx`).

### 4.3 Rollups & dashboards

```
course_assessment_report ──> clo_attainment_summary ──> plo_attainment_summary ──> cohort_tracking
        ──> dashboard KPI cards (SectionCards) + charts (ChartAreaInteractive/DataTable)
```

Chart/table data comes from backend rollup endpoints; `app/dashboard/data.json` is scaffolding and will be replaced.

## 5. Component Inventory (current)

`components/`: `app-sidebar`, `site-header`, `section-cards`, `chart-area-interactive`, `data-table`, `login-form`, `theme-provider`, `motion/file-upload`, `nav-{main,secondary,documents}`, `user-nav` patterns, `logo`, `icons`, plus `ui/*` shadcn primitives. `hooks/use-mobile.ts` for responsive behavior.

## 6. Build Priority (mirrors backend)

1. Auth-gated app shell + API client layer.
2. `forms/clo-raw-data` — per-student entry + CSV import (foundation).
3. `forms/course-assessment-report` — CAR hub UI with computed parts.
4. Rollup screens: `clo-attainment-summary` → `plo-attainment-summary` → `cohort-tracking`.
5. CQI/ACT screens: `plo-gap-analysis` → `cqi-action-plan` → `closing-the-loop`.
6. PLAN-phase setup forms (`curriculum-map`, `assessment-calendar`, `target-setting-matrix`, `assessment-budget`).
7. Remaining DO/CHECK + periodic/institutional forms (see backend catalog; lowest MVP urgency).

## 7. Open Questions

- Shared Zod schemas between frontend/backend (monorepo package) vs. duplicated — currently duplicated and must be kept in sync.
- PDF/export rendering of completed forms (`ReportExport`) — decide client-side print sheet vs. backend-rendered artifact.
- Async upload UX for large class-record files (progress, retry, error states) — extend `motion/file-upload`.
