<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Obelisk Frontend — Agent Guide

**Product:** Obelisk — the JMCFI outcome-based-education (OBE) assessment system frontend. It renders institutional assessment **forms** (CARs, attainment summaries, CQI plans, institutional reports), uploads class-record spreadsheets, and surfaces computed attainment results as read-only dashboards/badges.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui (`components/ui`) · react-hook-form + Zod · @tanstack/react-table · recharts · base-ui/react · dnd-kit · motion.

## Conventions

- **App Router** — authenticated routes live under `app/(app)/` (auth gate + shell in `app/(app)/layout.tsx`, adaptive dashboard in `app/(app)/dashboard/`, forms under `app/(app)/forms/`); shared UI under `components/`. Follow the existing examples for layout and client-component patterns.
- **Routing & auth** — `proxy.ts` handles the coarse unauthenticated redirect only. Real session + role gating happen in server layouts via `server/auth.ts` (`requireUser`, `requireRole`) and `lib/roles.ts`. Nav, sidebar, and route gating derive from the registry in `lib/navigation.tsx` — add a route there **and** create its page.
- **API client** — use `lib/api-client.ts` (browser) / `server/api-client.ts` (Server Components). No inline fetch of backend paths in pages.
- **shadcn/ui** primitives live in `components/ui/` — reuse them, don't re-implement.
- **Forms** use `react-hook-form` with **Zod** schemas (mirror backend `model.ts` validation). Keep client validation aligned with the backend so errors match.
- **Tables** use `@tanstack/react-table` (`components/data-table.tsx`).
- **Commands** use Bun: `bun dev`, `bun run lint` (biome check), `bun run format` (biome format --write).

## Environment & secrets (dotenvx)

- `.env.local` is **encrypted with dotenvx** (public-key encryption, `DOTENV_PUBLIC_KEY_LOCAL` header). The decryption key lives in `.env.keys` (gitignored) — never commit it.
- Run every command through `dotenvx run -f .env.local -- <cmd>` so decrypted vars are injected into the process: `bun dev`, `bun run build`, `bun run start`, etc. Next.js does not decrypt `.env.local` itself.
- To edit secrets: `bun run env:decrypt` → edit → `bun run env:encrypt`.
- Env vars are validated by Zod in `utils/env.ts` (mirrors backend `@env`). Prefer `import { env } from "@/utils/env"` over reading `process.env` directly in server code.
- **Edge-runtime exception:** `lib/dev-mode.ts` (imported by `proxy.ts`) must stay edge-safe — it reads `process.env.DEVELOPMENT` directly and must not import dotenvx or `server-only` code.
- `DEVELOPMENT=true` disables auth (frontend-only): `proxy.ts` + server guards (`server/auth.ts`, `server/api-client.ts`) short-circuit to a dev `system_admin` user so every route is viewable without an account. The backend still enforces auth.

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
