# Obelisk Frontend — System Design

> **Status:** Foundation plus **20 built OBE form screens** (13 Phase 0–5 + 7 CHECK), all wired to backend plugin routes through Server Actions. The role-scoped routed architecture is in place: a single adaptive `/dashboard`, a registry-driven role-gated app shell, an API client layer, the shared approval workflow (a dedicated `/submissions/[id]` screen), two submission inboxes, and dean-only PLO management. Remaining gaps: the 7 Periodic/ACT screens, PDF/export, archives content, and dashboard atom wiring (see §7).

**Stack:** Next.js 16 (App Router, server components by default — proxy renamed from middleware) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · react-hook-form + Zod (auth screens only) · @tanstack/react-table · evilcharts · echarts · base-ui/react · dnd-kit · motion · Jotai (client state). Backend: Elysia at `api/v1` (see `../backend/SYSTEM-DESIGN.md`).

---

## 1. Current State

| Route                                                                                                                                                    | File                                                                 | Purpose                                                                                                                                                        | Guard                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/`                                                                                                                                                      | `app/page.tsx`                                                       | Redirects to `/dashboard`                                                                                                                                      | —                                                                                                      |
| `/login`                                                                                                                                                 | `app/(auth)/login/page.tsx` + `components/auth/login-form.tsx`       | Sign-in (better-auth email/password + Google)                                                                                                                  | `requireGuest`                                                                                         |
| `/register`                                                                                                                                              | `app/(auth)/register/page.tsx` + `components/auth/register-form.tsx` | Google-only account creation (org-restricted provider; email/password sign-up disabled)                                                                        | `requireGuest`                                                                                         |
| `/onboarding`                                                                                                                                            | `app/onboarding/page.tsx`                                            | Role picker / role-request status for `user`-role accounts                                                                                                     | `requireUser` (outside `(app)`)                                                                        |
| `/dashboard`                                                                                                                                             | `app/(app)/dashboard/page.tsx`                                       | **Single adaptive home** → `dashboard/role-dashboard.tsx` renders the role's scoped dashboard                                                                  | `(app)` shell                                                                                          |
| `/forms`                                                                                                                                                 | `app/(app)/forms/page.tsx`                                           | Form index, filtered by role (catalog from `config/navigation.ts`)                                                                                             | `(app)` shell                                                                                          |
| `/forms/clo-raw-data`                                                                                                                                    | `app/(app)/forms/clo-raw-data/`                                      | Class-record upload panel + per-student entry (absorbed old `/faculty`)                                                                                        | `layout.tsx` + `page.tsx` → `requireRole(CLASS_RECORD_SCREEN_ROLES)` (**faculty + system_admin only**) |
| `/forms/course-assessment-report`                                                                                                                        | `app/(app)/forms/course-assessment-report/`                          | 7-part tabbed CAR                                                                                                                                              | `(app)` shell (nav-filtered)                                                                           |
| `/forms/attainment/{clo-attainment-summary,plo-attainment-summary,cohort-tracking}`                                                                      | `app/(app)/forms/attainment/…`                                       | Roll-up chain generate + display                                                                                                                               | `(app)` shell                                                                                          |
| `/forms/cqi/{plo-gap-analysis,cqi-action-plan,closing-the-loop,annual-program-report}`                                                                   | `app/(app)/forms/cqi/…`                                              | CQI / ACT loop                                                                                                                                                 | `(app)` shell                                                                                          |
| `/forms/plan/{curriculum-map,assessment-calendar,target-setting-matrix,assessment-budget}`                                                               | `app/(app)/forms/plan/…`                                             | PLAN-phase setup forms                                                                                                                                         | `(app)` shell                                                                                          |
| `/forms/check/{mid-cycle-attainment,peer-observation,exhibition-feedback,clo-perception-survey,student-exit-survey,portfolio-assessment,capstone-panel}` | `app/(app)/forms/check/…`                                            | 7 CHECK-stage supporting instruments                                                                                                                           | `(app)` shell                                                                                          |
| `/submissions`                                                                                                                                           | `app/(app)/submissions/page.tsx`                                     | "My Submissions" inbox (`GET /forms?scope=mine`, filtered client-side to approval-bound forms — Setup/Record-tagged codes are dropped, see `lib/form-tags.ts`) | `requireRole(MY_SUBMISSIONS_ROLES)` in page (every role but `vpaa`, which never prepares submissions)  |
| `/submissions/[id]`                                                                                                                                      | `app/(app)/submissions/[id]/page.tsx`                                | **Dedicated approval screen** for any submission: identity header, `FormWorkflow` (`layout="page"`), evidence panel                                            | `requireUser` in page + backend visibility gate (`404` unknown / `403` invisible)                      |
| `/all-submissions`                                                                                                                                       | `app/(app)/all-submissions/page.tsx`                                 | "Submissions" — institution-wide inbox (`GET /forms?scope=all`), status filter defaulting to **approved** + inline Archive action (the VPAA's archive queue)   | `requireRole(ARCHIVE_ROLES)` in page                                                                   |
| `/approvals`                                                                                                                                             | `app/(app)/approvals/page.tsx`                                       | "Pending Approvals" inbox (`GET /forms?scope=pending`)                                                                                                         | `requireRole(APPROVER_ROLES)` in page                                                                  |
| `/plo-management`                                                                                                                                        | `app/(app)/plo-management/`                                          | PLO entity CRUD (auto-sequenced codes)                                                                                                                         | `layout.tsx` → `requireRole(PLO_MANAGEMENT_ROLES)` (dean)                                              |
| `/plo-management/connections`                                                                                                                            | `app/(app)/plo-management/connections/`                              | CLO × PLO connection matrix (weight, I-P-D stage, coverage gaps)                                                                                               | inherits `plo-management` layout (dean)                                                                |
| `/archives`                                                                                                                                              | `app/(app)/archives/page.tsx`                                        | Cluster list (read-only, placeholder content)                                                                                                                  | `layout.tsx` → `requireRole(ARCHIVE_ROLES)`                                                            |
| `/archives/[clusterId]`                                                                                                                                  | `app/(app)/archives/[clusterId]/page.tsx`                            | Read-only per-student snapshot (placeholder content)                                                                                                           | inherits archives layout                                                                               |
| `/audit-logs`                                                                                                                                            | `app/(app)/audit-logs/page.tsx`                                      | Role-hierarchy audit waterfall (`GET /audit/logs`; self-scoped rows below vpaa/system_admin)                                                                   | `requireUser` in page + backend scoping                                                                |
| `/faculty`                                                                                                                                               | `app/faculty/page.tsx`                                               | **Legacy redirect** → `/forms/clo-raw-data`                                                                                                                    | —                                                                                                      |

Supporting: `proxy.ts` (coarse auth gate), `app/(app)/layout.tsx` + `components/layout/app-shell.tsx` (auth gate + shell), `components/layout/app-sidebar.tsx` (registry-driven), `lib/role-access.ts`, `lib/roles.ts`, `config/navigation.ts`, `lib/api-client.ts`, `server/api-client.ts`, `server/auth.ts`, `server/actions/`, `utils/env.ts` (shim → `@obelisk/env/client`), `utils/app-info.ts` (shim → `@obelisk/app-info`).

The 7 Periodic/ACT screens (`resource_monitoring`, `alumni_tracer`, `employer_satisfaction_survey`, `systemic_gap_report`, `capa_plan`, `institutional_review`, `portfolio_roadmap`) have **no routes yet** — the backend `/api/v1/periodic` plugin is live, the frontend screens are not.

## 2. Architecture

### 2.1 Routing (App Router)

- `app/(auth)/login`, `app/(auth)/register` — guest-only auth screens (`requireGuest`).
- `app/onboarding` — post-login role picker for accounts still at role `user`.
- `app/(app)/` — authenticated area behind a layout that checks the session and renders the app shell (sidebar + header). Accounts with `role === "user"` are **redirected to `/onboarding`** — they never see the shell.
  - `dashboard` — **single adaptive route** rendering the authenticated role's dashboard via a registry (`app/(app)/dashboard/role-dashboard.tsx`).
  - `forms/...` — one route group per form, keyed by **stable form code** (see below); grouped by PDCA phase (Data Capture / Attainment / CQI / PLAN / CHECK).
  - `submissions`, `approvals` — the two inboxes; `submissions/[id]` is the shared approval screen (workflow + evidence) every inbox row and form screen links to.
  - `plo-management` — dean-only PLO CRUD; `plo-management/connections` — the CLO × PLO matrix view.
  - `archives` — read-only **graduation-cluster archives**, gated to `aqau`/`vpaa`/`dean`/`system_admin`.

Form routes key off the stable snake_case codes (see `../backend/SYSTEM-DESIGN.md` §5). The manual's `F##` numbers are provisional — do not use them in URLs or UI.

### 2.2 Role-gating & authorization (proxy + server layouts)

The frontend uses **both** layers, each doing what it does best — the backend remains the source of truth for enforcement (the client only hides/navigates):

- **`proxy.ts`** (Next 16 `proxy`, formerly middleware) — the **coarse** gate. It only covers `/dashboard`, `/forms`, `/archives` (`PROTECTED_PREFIXES` + `matcher`): it checks for the better-auth session cookie prefix (`obelisk-app.session`) and redirects unauthenticated requests to `/login?next=…`. It never authorizes — reading a cookie is all it does. The newer routes (`/submissions`, `/all-submissions`, `/approvals`, `/plo-management`, `/onboarding`, `/audit-logs`) are **not** in the proxy matcher; they rely entirely on `requireUser`/`requireRole` below.
- **`app/(app)/layout.tsx`** (Server Component) — real session validation via `server/auth.requireUser()` → `GET /auth/me`; redirects to `/login` when invalid, and to `/onboarding` for role-less `user` accounts.
- **Role-restricted routes** call `requireRole([...])` — either in a nested `layout.tsx` (`forms/clo-raw-data`, `archives`, `plo-management`) or directly in the **page** (`approvals`). Unauthorized roles are redirected to `/dashboard`.
- **`lib/role-access.ts`** — **central role → feature/form access map**: `USER_ROLES`, `FEATURE_ACCESS` (allow-lists: `captureClassRecords`, `archive`, `viewArchives`, `approveForms`, `managePlos`, `manageRoleRequests`, `confirmClusterCompile`, `generateAiInsights`, `viewAllAuditLogs`), `FORM_ACCESS` (per-form preparers + chain), helpers `formRoles(code)` (route gate: preparers ∪ chain ∪ admin) / `screenRoles(code)` (same gate, with the per-screen override for screens gated **narrower** than their form — `clo_raw_data`) / `preparerRoles(code)` (nav visibility: preparers only) / `featureRoles` / `canAccess`, plus the **frontend-only rendering gate `CLASS_RECORD_SCREEN_ROLES`** (`faculty` + `system_admin`) for the class-record upload screen. Pure data (no imports); `FEATURE_ACCESS`/`FORM_ACCESS` mirror `apps/backend/lib/role-access.ts` + `apps/backend/lib/forms/approval-routes.ts`, drift-guarded by `apps/backend/test/unit/role-access-sync.test.ts` — `CLASS_RECORD_SCREEN_ROLES` sits deliberately outside both, because the backend keeps the broader `captureClassRecords` list for its `/ingest/*` reads.
- **`lib/form-tags.ts`** — the **manual's tag legend** (`FORM_TAGS`: every stable code → `setup`/`record`/`submit`/`live`; `formNeedsApproval(code)`), mirroring `apps/backend/lib/forms/form-tags.ts` and drift-guarded by `apps/backend/test/unit/form-tags-sync.test.ts` (same pattern as `role-access`). It drives the "My Submissions" inbox filter (only forms that descend an approval chain are listed) and `FormWorkflow`'s approval-free rendering — no route preview, "File form" / "Form filed" copy.
- **`lib/roles.ts`** — re-exports the `lib/role-access.ts` vocabulary (role groups `ACADEMIC_ROLES`, `ARCHIVE_ROLES`, `APPROVER_ROLES`, `PLO_MANAGEMENT_ROLES`, `CLASS_RECORD_ROLES`, `CLASS_RECORD_SCREEN_ROLES`, `ADMIN_ROLES`, `QA_ROLES`) plus `hasAccess`, `ROLE_LABELS`, and scope resolvers (`scopeForRole`). Nav and route gates are filtered through it.

### 2.3 Layout & shell

- **`app/(app)/layout.tsx`** — resolves the session and renders `components/layout/app-shell.tsx` (`SidebarProvider` + `AppSidebar` + `SiteHeader` + children).
- **`components/layout/app-sidebar.tsx`** — role-aware sidebar built from `config/navigation.ts`; footer `NavUser` shows the real user + role.
- **`components/layout/site-header.tsx`** — derives its title from `titleForPathname(pathname)`.

### 2.4 Navigation & route registry (`config/navigation.ts`)

Single source of truth (a plain `.ts` module — icons are referenced as components) for what is in the sidebar and which roles may reach each route. Adding a route = add an entry here **and** create its page. Exports:

- `FORM_SECTIONS` (internal) — the forms catalog grouped by PDCA phase; each item carries `url`, `roles?` (allow-list, empty = any authenticated role) and the stable `code` used by the inboxes. An explicit `roles` **wins over** a `code`'s derived preparers — that is how `clo_raw_data` follows `screenRoles("clo_raw_data")` (= `CLASS_RECORD_SCREEN_ROLES`, faculty + system_admin) while its `FORM_ACCESS` preparers stay `faculty`/`program_chair`.
- `navSectionsFor(role)` — role-filtered forms catalog for the sidebar/forms index: an item shows only when the role passes `rolesFor(item)` — an explicit `roles` if present, otherwise `preparerRoles(code)` (`FORM_ACCESS[code].preparers` — no approval-chain rungs, no admin override). Groups that end up empty are dropped, so `vpaa`/`aqau` (which prepare no form with a screen) get no forms catalog. Route gates stay broader (`formRoles(code)` = preparers ∪ chain ∪ admin), so approvers still open review-only screens from the inbox.
- `sidebarNavFor(role) → { duties, catalog }` — what the **sidebar** renders: `duties` first (the role's ordered responsibility steps from `config/role-duties.ts`, group labels numbered `1 · …`, `4 · …`; `prepare` steps take their visibility from `preparerRoles(code)`, `approve`/`link` steps from `APPROVER_ROLES`/the step's feature list — approval steps point at `/approvals`, never at a form screen), then `catalog` = `navSectionsFor(role)` with every URL a duty already links to removed (no duplicates). `/forms` keeps calling `navSectionsFor` directly, so the full preparer catalog stays reachable.
- `workspaceNav(role)` — top-level workspace links: Dashboard, **PLO Management** (dean), **My Submissions** (all but `vpaa`), **Submissions** (`ARCHIVE_ROLES` → `/all-submissions`), **Pending Approvals** (`APPROVER_ROLES`), **Archives** (`ARCHIVE_ROLES` = `vpaa`/`system_admin`).
- `INSTITUTION_NAV` — secondary group (currently only the Faculty Directory entry).
- `formPathByCode` — stable code → screen path (raw map).
- `formPathForCode(code, role)` — that lookup filtered by `screenRoles(code)` (the screen's route gate): the approval/evidence panels' "Open form screen" link (inbox rows link to `/submissions/[id]` instead). Approvers keep their link to every screen the gate lets them open, while `clo_raw_data` (gated to `CLASS_RECORD_SCREEN_ROLES`) never dead-ends a reviewer on a redirect to `/dashboard`.
- `itemVisible(item, role)`, `titleForPathname(pathname)`.

**`config/role-duties.ts`** (sibling registry) — `ROLE_DUTIES`, the per-role ordered duty sections ("what this role actually does": faculty uploads class records → enters indirect survey scores → generates the CAR → files Action-Taken; chair, dean, aqau, vpaa get their review, rollup, archival, and AI steps). Each `DutyStep` carries `title`, `detail`, `url`, `icon`, and a `DutyStatus` — `prepare`/`code` (resolved from `GET /forms?scope=mine`), `approve`/`codes?` (from `scope=pending`), or `link`. Consumed by `sidebarNavFor` **and** the dashboard checklist. Roles with no entry (`system_admin`, `user`) keep the plain catalog and get no checklist. Manual `F##` numbers are deliberately absent (provisional — see `AGENTS.md`).

### 2.5 API client layer

- **`lib/api-client.ts`** — browser client: typed `api.get/post/put/patch/delete`, cookie credentials, `NEXT_PUBLIC_API_URL`, error handling (`ApiError`), and the `MeResponse`/`ApiUser` types. All data flows through it — no inline fetch in pages. Use for reads/actions that don't need server-side auth forwarding.
- **`server/api-client.ts`** — `server-only` variant that forwards request cookies to the backend for Server Component data fetching (`getMe`, `serverApi`). **`actionApi`** is the Server Action variant: it forwards the browser's cookies **and** relays the backend's `Set-Cookie` headers onto the outgoing response so better-auth session cookies land on the frontend origin (matching the `proxy.ts` cookie check); failures throw `ApiError`. Path convention: every helper takes **API-relative paths** (`/forms/:id`) — the fetch helpers prepend `API_ROOT` themselves, so `.get` must build its query string with `withQuery(path, query)` instead of round-tripping `new URL(API_ROOT + path).pathname` (that round-trip sent every server-side GET to `/api/v1/api/v1/…` → 404).
- **`server/auth.ts`** — server guards (`currentUser`, `requireUser`, `requireGuest`, `requireRole`, `requireRoleOrNotFound`).
- **`server/actions/`** — all `"use server"` Server Actions, one file per domain: `auth.ts`, `car.ts`, `rollup.ts`, `cqi.ts`, `plan.ts`, `check.ts`, `academic.ts`, `forms.ts`, `ai.ts` (AI CQI recommendation: `getLatestAiRecommendationAction` / `generateAiRecommendationAction` → `/ai/recommendation/*`; generation posts an explicit `{}` body because the route's `t.Object` body is required — posting nothing is a 422 — and is role-gated to `generateAiInsights`). They are the frontend's mutation/read layer: each action authenticates/authorizes, calls `actionApi`, and returns a serializable `ActionResult` (`{ ok: true, data } | { ok: false, error }`); success navigations use `redirect()`. Client components import these actions — mutations never call `api.post` directly.

**Dev-mode role simulation:** when `DEVELOPMENT=true` the guards short-circuit to the dev user in `server/api-client.ts`. **The app currently ships with `DEVELOPMENT=false`**, so login, session and role gates are real (seeded accounts — `bun run db:seed` in `../backend`). With the flag on, `DEV_ROLE` there simulates **`dean`** (nav, dashboards, and — when `DEV_ENFORCE_ROLE_ACCESS` in `lib/dev-mode.ts` is `true`, currently `false` — route gates) without an account. The backend always enforces auth.

## 3. Role & Scope Matrix

Backend status quo from `../backend/SYSTEM-DESIGN.md` §3; the frontend maps each role to a scoped dashboard and an allowed route set. "Scope" indicates what the dashboard filters to — data is still enforced server-side.

| Role            | `/dashboard` renders                                                                          | Route scope                                                                               |
| --------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `faculty`       | own `ClassSection`/courses: load, upload, at-risk watchlist, CAR drafts                       | forms: academic; `/forms/clo-raw-data`, `/forms/course-assessment-report`; `/submissions` |
| `program_chair` | own `Program`: attainment, targets, approvals, gap/CQI                                        | academic forms + roll-ups (broader); `/submissions`, `/approvals`                         |
| `dean`          | own `Department`: endorsements, budgets, sign-offs                                            | academic + archives + **`/plo-management`** + `/approvals` + `/submissions`               |
| `aqau`          | institution-wide QA: filings, cohort tracking, cluster confirm                                | archives + everything + `/approvals` + `/submissions`                                     |
| `vpaa`          | institution-wide: CAPA/budget, institutional decisions                                        | archives + everything + `/approvals` + `/all-submissions`                                 |
| `system_admin`  | everything + admin                                                                            | everything + archives + `/approvals` + `/submissions` + `/all-submissions`                |
| `user`          | never rendered — the `(app)` layout redirects to `/onboarding` (role picker / request status) | none                                                                                      |

`/submissions` is open to every authenticated role **except `vpaa`** (it never prepares submissions — the VPAA reads the institution-wide `/all-submissions` instead); `/all-submissions` is limited to `ARCHIVE_ROLES` (vpaa, system_admin) and the backend enforces the same set on `?scope=all`; `/approvals` is limited to `APPROVER_ROLES` (program_chair, dean, aqau, vpaa, system_admin) and the backend re-checks the per-step role match on every decision.

## 4. Component Architecture

### Shared OBE form primitives

The intended `components/obe/` package was never built; the shared primitives that exist today are:

- **`components/reui/frame.tsx` / `reui/badge.tsx` / `reui/filters.tsx`** — form frames, status badges, filter chrome.
- **`components/reui/data-grid/*`** — the TanStack Table-based grid family (virtual scrolling, column visibility/filtering, pagination, dnd rows). This is the table primitive for all forms (there is no `components/data-table.tsx`).
- **`components/ui/status.tsx`** — `Status` / `statusVariants` badge display.
- **`components/ui/form-select.tsx`**, **`ui/program-select.tsx`**, **`ui/term-select.tsx`**, **`ui/class-section-select.tsx`** — shared selects; the academic ones are populated by `server/actions/academic.ts` (`/academic/programs|terms|class-sections`).
- **`components/ui/field.tsx`**, **`ui/attachment.tsx`**, **`ui/toast.tsx`**, **`ui/drawer.tsx`**, **`ui/spinner.tsx`** — field wrappers, upload display, notifications, drawers, loading.
- **`lib/constants/obe.ts`** — the shared `ROOT_CAUSES` (6-category) constant, `BLOOMS_LEVELS` (6 canonical levels) and `IPD_STAGES` (I/P/D → Introduction / Proficiency / Demonstration, mirroring the backend's `IPD_STAGE_LABELS`); add new cross-form OBE constants here.
- **`components/forms/form-workflow.tsx`** — the approval workflow itself (status badge, PDCA stage, "Step n of m" progress, the **standard-header metadata block** — retention / deadline / responsible party from `GET /forms/:id`'s `formMeta`, with the deadline row omitted when the manual states none — and the approval list, Submit / Approve / Return-with-comment / Archive). It renders in two layouts: `layout="page"` on **`/submissions/[id]`** (full-size card + vertical timeline — the only layout that shows the manual's signature block: a "Prepared by … — date" row first, then each step as "Approved by _Printed Name_ · role" / "Awaiting role", plus a **route preview** that derives the full chain from `FORM_ACCESS` while a draft/returned submission has no materialized `ApprovalStep` rows yet — suppressed for approval-free (Setup/Record-tagged) codes, whose drafts instead read "No approval required — submitting files this form as a record" and whose submit button says **"File form"** / toasts **"Form filed"**), and the compact strip is no longer embedded on form screens — those carry **`components/forms/submission-status-card.tsx`** instead (status badge + waiting-on role + "Open approval screen" link, fed by `payload.id`/`submissionId`, `null` rendering the "no submission record yet" placeholder).
- **`components/forms/form-placeholder.tsx`** — titled scaffold wrapper (title + stable code + PDCA stage) that renders `children`, falling back to a "pending" panel when a screen has no content yet.

Still missing (tracked in `../../system-docs/roadmap.md`): dedicated `status-badge`/`ipd-selector`/`cohort-selector`/`root-cause-selector`/`blooms-selector`/`rubric-scale`/`likert-scale`/`loop-status-badge`/`row-editor-table`/`form-header`/`computed-cell` primitives — screens currently inline these.

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
  `refreshAtom`) and `atomWithMockData(seed)` for a dataset whose endpoint does
  not exist yet. Every such atom today is seeded with `[]`, so its chart
  renders an empty state — swapping to real data is a one-line change.
- **Chart payload types** live in `components/charts/obe-sample-data.ts`: the
  `*Datum` interfaces that mirror `apps/backend/src/v1/*/model.ts`, plus the inbox's
  dev-preview rows (`SAMPLE_*`, rendered only when `DEVELOPMENT=true`). The
  `MOCK_*` datasets were removed — no chart renders fabricated numbers.
- **Submission-scoped chart data:** `GET /rollup/*`, `GET /cqi/*` and
  `GET /plan/assessment-budget|target-setting-matrix` return a submission list,
  so a chart atom resolves the newest submission with `fetchLatestPayload`
  (`lib/store/latest-payload.ts`) and maps that payload into the datum rows
  beside the atom. Empty list → `[]` → empty chart state.
- **DB-backed:** `formSubmissionsDataAtom` fetches `GET /forms?scope=visible`
  (cookie auth, browser-only — never during SSR) — the backend's
  **chain-entitled** scope: the session user's own submissions plus every form
  whose approval chain contains their role. So faculty sees only its own rows,
  a chair/dean/aqau also sees what the roles at or below theirs prepared (only
  the forms that reach their step), and vpaa/system_admin see everything —
  two accounts of the same role share exactly what that role may act on, and
  nothing another user did that never passes through them.
  `formStatusCountsAtom`, `approvalFlowDataAtom` and `uploadStatusesDataAtom`
  derive their distributions from the `GET /forms` / `GET /ingest/history`
  fetches and hold `[]` while loading or when the role-gated route 403s;
  `mySubmissionsDataAtom` / `pendingApprovalsDataAtom` /
  `allSubmissionsDataAtom` fetch `GET /forms?scope=mine|pending|all` for the
  inboxes (institution-wide stays `scope=all`, archive roles only); the
  `mine` inbox then filters out approval-free (Setup/Record-tagged) rows
  client-side via `formNeedsApproval` — `/approvals` and `/all-submissions`
  stay unfiltered.
  `userAtom` is seeded from the server-resolved session via
  `SessionInitializer` in `app/(app)/layout.tsx`.
- **Ingest state** (`atoms/ingest.ts`) holds upload/polling/result state as
  atoms + action atoms; `ClassRecordUpload` polls and writes results into them
  so any consumer can react to a completed import. The lifecycle is
  `uploading → processing → review (preview held, nothing saved) → saving →
  completed | failed`, with `resetIngestAtom` clearing the pre-save states.
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
`/forms/:id/archive`, fired from the approval screen (`/submissions/[id]`) —
the surface for submit/approve/return — plus the inline Archive action on the
`/all-submissions` inbox rows (approved forms, `ARCHIVE_ROLES` only). The
backend derives the approval chain
from the form's stable code (`apps/backend/lib/forms/approval-routes.ts`) and
enforces ownership + role match; the client never sends steps or RBAC
decisions.

### 5.2 Class-record import (clo_raw_data)

```
CSV/TSV/XLS/XLSX ──> /forms/clo-raw-data (ClassRecordUpload, client validation)
   ──> backend ingest POST /upload (UploadRecord "queued") ──> python-server
        (pure-compute ETL: AUN-OBE v2 template extraction)
   ──> GET /upload/:jobId/status ──> "ready" + preview (nothing persisted yet)
   ──> review panel ──> Save (POST /upload/:jobId/save → persistence)
                    └─> Re-upload (POST /upload/:jobId/discard → "discarded")
```

The frontend calls the **backend only**; the backend forwards to the python-server ETL. Do not call python-server from the browser. The ETL result is held for review (`ingestPreviewAtom`, status `review`/`saving`) — only **Save** writes `Student`/`CloAttainment`/`AtRiskFlag` rows; **Re-upload** (or resetting the file / changing section mid-review) discards the job best-effort so the history row never stays `queued`.

### 5.3 Rollups & dashboards

```
course_assessment_report ──> clo_attainment_summary ──> plo_attainment_summary ──> cohort_tracking
        ──> role scoped dashboards (KPI cards / charts)
```

Chart/table data comes from backend rollup endpoints (`server/actions/rollup.ts`); dashboards still render sample charts for the atoms that aren't wired yet (see §7).

## 6. Component Inventory (current)

- `components/layout/` — `app-shell`, `app-sidebar`, `site-header`, `nav-workspace` (registry-driven SidebarNav), `nav-secondary`, `nav-user`.
- `components/auth/` — `login-form`, `register-form`, `google-sign-in-button`, `sign-out-button`, `select-role`, `onboarding-form`, `role-requests-panel`, `page-notice`.
- `components/dashboard/` — `role-dashboard-shell` (`DashboardShell`, `StatCard`, `PendingSection`), `role-checklist` (the **"What you need to do"** card rendered at the top of every duty-bearing dashboard: the role's `ROLE_DUTIES` steps with live states resolved by `lib/duty-status.ts` from `mySubmissionsStateAtom` / `pendingApprovalsStateAtom` — `Done` / `Draft · n` / `In progress · n` / `Waiting on you · n` / `All clear` / `Not started`, `…` while loading, `—` on error, and `Open` for destination steps; subscribes to only the dataset the role's steps need via a `skipState` atom, and renders nothing for roles without duties), `ai-suggestions-drawer` (fetches the latest persisted AI recommendation via `server/actions/ai.ts` on first open; role-gated generate/regenerate, Markdown rendered with the `typeset` classes — no markdown library; the **"Key gaps"** and **"Pedagogical context"** tables are computed data rendered from `worstPerformingClos` / `alignmentContext`, the latter capped at 50 visible rows with an explicit "showing N of M" note), plus the per-role dashboards under `app/(app)/dashboard/`.
- `components/forms/` — `form-workflow`, `submission-status-card`, `form-placeholder`, `class-record-upload` (the `/forms/clo-raw-data` screen), `upload-history-table`, `clo-plo-map-panel`, `curriculum-coverage-grid`, `cohort-tracking-grid`, plus the 19 form-screen components (`car-form`, `clo-summary-form`, `plo-summary-form`, `cohort-tracking-form`, `plo-gap-analysis-form`, `cqi-action-plan-form`, `ctl-form`, `apar-form`, `curriculum-map-form`, `assessment-calendar-form`, `target-setting-matrix-form`, `assessment-budget-form`, and the 7 CHECK forms) covering the 20 screens in §1. `car-form`'s P1 CLO table edits exactly three columns — **Bloom's**, **weight** and **Assessment types** (a chip-toggle set over `ASSESSMENT_TYPES` in `lib/constants/obe.ts`, mirroring the backend's `ASSESSMENT_GROUP_LABELS`) — everything else there is read-only and comes from `CloToPloMap`/`ploForClo`.
- `components/inbox/` — `submission-inbox` (shared by `/submissions`, `/approvals` and `/all-submissions` — the last with a status filter defaulting to **approved** and a per-row Archive action behind a permanence confirm dialog; dev-preview sample rows; each row's "Open" goes to `/submissions/[id]`).
- `components/audit/` — `audit-waterfall` (role-hierarchy cascade: VPAA → system_admin → AQAU → Dean → Program Chair → Faculty, tier visibility from the server's `viewer.scope`), `audit-log-grid` (per-tier cohort-tracking-style DataGrid: grouped Filters, sort, pageSize-10 pagination, raw-`details` dialog, `forms` record ids deep-link to `/submissions/[id]`).
- `components/submissions/` — `submission-approval-screen` (identity header + `FormWorkflow layout="page"` + **`SubmissionJustification`** + evidence), `submission-evidence` (reads `GET /forms/:id/evidence`: bound section, capture counts, stored `formData` — the JSON payload demoted behind a "Stored payload" toggle since the justification card above carries what an approver reads), `submission-justification` (same endpoint's `justification` block — registered for `course_assessment_report`, `clo_raw_data` and `curriculum_map`; anything else renders the empty state: CAR/raw-data → per-CLO alignment table (CLO/PLO/Bloom's/I-P-D/assessment types/weight) + Part 2 assessment-evidence table led by the `Composite (70/30)` rows (the four instrument groups are null on the v2 class-record template, so composite is what actually carries the ≥70% comparison); prose notes name _where_ each null field is recorded ("set it in CAR Part 1" / "set it on a CLO-PLO connection") instead of just saying "not recorded"; curriculum map → I-P-D coverage tiles + uncovered-PLO note; prose notes above both, explicit empty state, **display only — never gates Approve**).
- `components/outcomes/` — `plo-management-panel` (dean-only PLO CRUD), `clo-plo-matrix-panel` (CLO × PLO connection matrix with inline create/edit/delete), `plo-management-nav` (segmented sub-nav between the two `/plo-management` views).
- `components/charts/` — `attainment-charts`, `cqi-charts`, `governance-charts`, `ingest-charts`, `plan-charts`, `chart-card`, `pie-donut-layout`, `obe-sample-data`.
- `components/evilcharts/` — ECharts wrappers (`ECharts*Chart`), the preferred chart engine.
- `components/reui/` — `frame`, `badge`, `filters`, `data-grid/*` (TanStack Table grids).
- `components/branding/` — `obelisk-logo`, `icons`; `components/upload/file-upload`; `components/theme.tsx` (`Theme` provider, mounted in `app/layout.tsx`); `components/examples/` (scratch/template screens).
- `components/ui/` — shadcn primitives plus `status`, `toast`, `drawer`, `field`, `form-select`, `program-select`, `term-select`, `class-section-select`, `attachment`, `spinner`, `button-group`, `input-group`, `kbd`, …
- `hooks/use-mobile.ts` for responsive behavior.

Removed: old demo `nav-main`, `nav-documents`, `section-cards`, `chart-area-interactive`, `data-table`, top-level `login-form`/`app-shell`/`app-sidebar` (all moved or replaced).

## 7. Current State & Next Work

Done: auth-gated app shell, API client layer, role-scoped routing, adaptive dashboards, 20 wired form screens (13 Phase 0–5 + 7 CHECK), status card on every form screen + a shared `/submissions/[id]` approval screen reached from the inboxes and the form screens, dean-only PLO management, CLO↔PLO connection panel, class-record upload with ETL polling, dashboard chart atoms wired to the endpoints that exist (`/rollup/*`, `/cqi/*`, `/plan/*`, `/forms`, `/ingest/history`, `/audit/logs`) with empty states where nothing is submitted.

Remaining, in rough priority:

1. The 7 Periodic/ACT screens (`/forms/periodic/*`) against the live backend plugin.
2. Populate stat cards on the 6 role dashboards (they still read no data source).
3. Chart datasets blocked on missing backend routes — each atom carries a `TODO(...)` naming it: per-CLO direct/indirect averages and score bands (rollup), `AtRiskFlag.reason`, `AiRecommendation` list, graduation clusters (`/archives` content), `ReportExport`, `FormType` catalog, platform user/role counts, `ComputationRun` per term, `PloToPeoMap`, `AssessmentItem.type`, `Student.yearLevel`, assessment-calendar month load, and actual spend / current attainment on the budget & target charts.
4. Archives content — pages exist but render placeholder data until the backend `archival-service` compiles clusters (after PEO attainment capture).
5. Export / print (PDF / Excel / Word) on form screens.
6. Adopt shared client-side Zod schemas (or a monorepo package) so client validation mirrors `apps/backend/*/model.ts`.
7. Async upload UX for large class-record files (progress, retry, error states); archive detail-artifact streaming.

## 8. Open Questions

- Shared Zod schemas between frontend/backend (monorepo package) vs. duplicated — currently no client schemas at all for OBE forms; decide before adding client-side validation.
- PDF/export rendering of completed forms (`ReportExport`) — decide client-side print sheet vs. backend-rendered artifact.
- Archive detail-artifact streaming (object-storage URL) vs. backend-proxied download for the `archives/[clusterId]` viewer.
- Backend is the session source of truth; when `/auth/me` handles token-silent refresh, mirror that in `lib/api-client.ts`.
- `INSTITUTION_NAV` links to `/people` (Faculty Directory) but no such route exists yet — build or remove.
