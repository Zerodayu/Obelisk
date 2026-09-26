<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Obelisk Frontend — Agent Guide

**Product:** Obelisk — the JMCFI outcome-based-education (OBE) assessment system frontend. It renders institutional assessment **forms** (CARs, attainment summaries, CQI plans, institutional reports), uploads class-record spreadsheets, and surfaces computed attainment results as read-only dashboards/badges.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui (`components/ui`) · react-hook-form + Zod · @tanstack/react-table · evilcharts · echarts · base-ui/react · dnd-kit · motion · Jotai (client state, `lib/store/`).

## Conventions

- **App Router** — authenticated routes live under `app/(app)/` (auth gate + shell in `app/(app)/layout.tsx`, adaptive dashboard in `app/(app)/dashboard/`, forms under `app/(app)/forms/`, inboxes at `submissions`/`approvals`); guest routes under `app/(auth)/`, plus `app/onboarding` (role picker for `user`-role accounts — the `(app)` layout redirects them there); shared UI under `components/`. Follow the existing examples for layout and client-component patterns.
- **Routing & auth** — `proxy.ts` handles the coarse unauthenticated redirect only (its matcher covers `/dashboard`, `/forms`, `/archives`). Real session + role gating happen in server layouts/pages via `server/auth.ts` (`requireUser`, `requireGuest`, `requireRole`). **Role access is centralized in `lib/role-access.ts`** — `FEATURE_ACCESS` (feature allow-lists), `FORM_ACCESS` (per-form preparers + chain, mirror of `backend/lib/forms/approval-routes.ts`), and helpers `formRoles(code)` / `featureRoles(feature)` / `canAccess(role, feature)`; gate form pages with `await requireRole(formRoles("<stable_form_code>"))`. It is a pure data module (no imports) kept in sync with the backend by `backend/test/unit/role-access-sync.test.ts` — change both sides in the same commit. `lib/roles.ts` re-exports the vocabulary and adds `hasAccess`, `ROLE_LABELS`, and `scopeForRole`. Nav, sidebar, and route gating derive from the registry in `config/navigation.ts` (form items derive roles from their `code`) — add a route there **and** create its page.
- **API client** — use `lib/api-client.ts` (browser) / `server/api-client.ts` (Server Components). No inline fetch of backend paths in pages.
- **Client state (Jotai)** — shared/DB-backed client state lives in `lib/store/atoms/*` (per domain: `user`, `forms`, `ingest`, `attainments`, `governance`, `plan`, `cqi`, `academic`, `car`). Use `useAtomValue` for reads, `useSetAtom` for writes; prefer write-only action atoms for commands. Datasets backed by a rollup endpoint use `atomWithAsyncData` from `lib/store/async-atom.ts` (auto-fetch, refresh action, sync fallback via `unwrap`); datasets still on sample data use `atomWithMockData` and are swapped when the endpoint lands. Chart components consume atoms and only accept a `data` override prop. Do **not** use the deprecated `loadable` helper.
- **Server Actions** — all `"use server"` functions live in `server/actions/` (one file per domain: `auth`, `car`, `rollup`, `cqi`, `plan`, `check`, `academic`, `forms`, `ai`), and they are the only place the frontend performs authenticated mutations. They call `actionApi` from `server/api-client.ts` (forwards the browser's cookies and relays backend `Set-Cookie` headers to the browser) and return a serializable `ActionResult` (`{ ok: true, data } | { ok: false, error }`) — never leak raw backend responses. Success navigations use `redirect()` from `next/navigation`; guard admin-only actions with `requireRole` before mutating (only `decideRoleRequest` does today). The workflow actions in `forms.ts` (`submitFormAction`/`approveFormAction`/`returnFormAction`/`archiveFormAction`) deliberately do **no** local role check — the backend derives the approval chain from the form's stable code (`backend/lib/forms/approval-routes.ts`) and enforces ownership + role match. Client components import these actions; they do not call `api.post` for mutations.
- **shadcn/ui** primitives live in `components/ui/` — reuse them, don't re-implement.
- **Notifications** — every user-facing notification (success/error/info/warning) renders as a toast via the `toast` store from `@/components/ui/toast` (mounted once in `app/layout.tsx`). Toasts are **stackable by default (no `id`)**: each notification is a discrete event. Pass a stable `id` **on usage** only for notifications that would otherwise duplicate while visible (e.g. a single-shot `searchParams` notice across back-navigation) so the id'd toast replaces the existing one instead of stacking. **Error toasts always go through the `toastError` helper** from `@/components/ui/toast`: `duration: Number.POSITIVE_INFINITY` (persist until dismissed) and `id: \`error:${status}\`` from the HTTP status code (`ApiError.status`) — fall back to `error:<scope>` per flow when no status exists — so the same error re-firing while visible dedupes instead of stacking. Field/form-level errors keep their inline anchor at the error source; the toast fires in addition, never instead.
- **Forms** — auth screens use `react-hook-form` with **Zod** (`components/auth/login-form.tsx`); OBE form screens are controlled components (local state / Jotai draft atoms) that submit through Server Actions. When you add client validation, use Zod schemas mirroring backend `model.ts` so errors match — backend validation stays authoritative.
- **Tables** use `@tanstack/react-table` via the shared grid family in `components/reui/data-grid/*` (virtual scrolling, column visibility/filtering, pagination). There is no `components/data-table.tsx` — don't create one.
- **Charts & graphs** — when creating or using any chart/graph (dashboards, attainment rollups, trend lines, etc.), use **EvilCharts** components (shadcn registry `@evilcharts/*`, installable via `bunx shadcn add @evilcharts/<chart>`) or **Apache ECharts** (`echarts`) directly. Do not introduce another charting library (no raw recharts/other). Since both EvilCharts engines (Recharts/ECharts) exist, prefer the ECharts variants (`ECharts*Chart`) to match the installed `echarts` engine.
- **Commands** use Bun: `bun dev`, `bun run lint` (biome check), `bun run format` (biome format --write).

## Environment & secrets (dotenvx)

- `.env.local` is **encrypted with dotenvx** (public-key encryption, `DOTENV_PUBLIC_KEY_LOCAL` header). The decryption key lives in `.env.keys` (gitignored) — never commit it.
- Run every command through `dotenvx run -f .env.local -- <cmd>` so decrypted vars are injected into the process: `bun dev`, `bun run build`, `bun run start`, etc. Next.js does not decrypt `.env.local` itself.
- To edit secrets: `bun run env:decrypt` → edit → `bun run env:encrypt`.
- Env vars are validated by Zod in `utils/env.ts` (mirrors backend `utils/env.ts`). Prefer `import { env } from "@/utils/env"` over reading `process.env` directly in server code.
- **Edge-runtime exception:** `lib/dev-mode.ts` (imported by `proxy.ts`) must stay edge-safe — it imports the Zod-parsed `env` from `utils/env.ts` and must not pull in dotenvx, `server-only`, or filesystem access.
- `DEVELOPMENT=true` disables auth (frontend-only): `proxy.ts` + server guards (`server/auth.ts`, `server/api-client.ts`) short-circuit to a dev user so every route is viewable without an account. Simulate a role by editing `DEV_ROLE` in `server/api-client.ts` (currently `dean`); route access is enforced like prod only when `DEV_ENFORCE_ROLE_ACCESS` in `lib/dev-mode.ts` is `true` (currently `false` — open navigation while nav/dashboards still reflect the simulated role). The backend still enforces auth.

## Canonical domain rules (consume from backend, do not re-derive)

The backend is the source of truth for all institutional computations. The frontend **renders server-computed values as read-only badges/results**; do not duplicate the rules locally or they will drift.

- **≥70% hard floor** for every attainment target/benchmark → render MET vs NOT MET status from the server value, not by re-checking.
- **Direct ×70% + Indirect ×30%** composite — shown, not computed.
- **At-risk** = any CLO score <70% — server flags it (`AtRiskFlag`); client just displays the watchlist.
- **CLO/PLO status badges** — MET ✓ / NOT MET ✗, or Exceptional / Proficient / Basic / Below Basic — derive from server-attributed values.
- **Loop status** (CTL): CLOSED / OPEN — Re-assess / OPEN — Not Implemented is **computed server-side**; display-only.

## Recurring OBE sub-components (build once, reuse)

These repeat across many forms. Implement as reusable components; wire each to its backend field (see `SYSTEM-DESIGN.md`):

- **CLO/PLO status badge** — MET/NOT MET, or Exceptional/Proficient/Basic/Below Basic.
- **I-P-D stage selector** — checkbox set `I ☐ P ☐ D ☐`.
- **Year-level cohort selector** — `Y1 Y2 Y3 Y4` (multi-select).
- **Root-cause category selector** — fixed 6 options (Curriculum Design / Instruction & Pedagogy / Assessment Design / Student Factors / Resources & Tools / Industry & Field Alignment).
- **Bloom's level selector** — Remember / Understand / Apply / Analyze / Evaluate / Create.
- **4-point rubric scale** — Exceptional (9-10) / Proficient (7-8) / Basic (6) / Below Basic (≤5); used both as input and display badge.
- **5-point Likert scale** — 1 Strongly Disagree … 5 Strongly Agree.
- **Loop status badge** — CLOSED ✓ / OPEN — Re-assess / OPEN — Not Implemented.
- **Reusable tables** — dynamic add/remove rows (courses, PLOs, students), add/remove-column cohort grids, computed-total footer rows.
- **Signature & metadata blocks** — header (org, form title, PDCA phase, evidence type, deadline, retention, responsible party, purpose) and footer (prepared/received signature columns) shared across every form.

## Form identification

Forms are referenced by **title** or by their **stable snake_case code** (e.g. `course_assessment_report`, `clo_raw_data`, `cqi_action_plan`). The manual's `F##` numbers are provisional — do not use them in the UI, routes, or copy. See `../backend/SYSTEM-DESIGN.md` for the authoritative catalog. Forms without a defined field structure (future/placeholder) have **no code** — don't invent one.

## Backend contract

API root is `api/v1`; auth via cookie/session (better-auth). Add an API client layer that calls the backend; don't inline fetch paths. Computed/rollup endpoints return the values described in `../backend/SYSTEM-DESIGN.md` §6 data flow.
