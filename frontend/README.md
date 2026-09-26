# Obelisk — Frontend

Next.js 16 (App Router) client for **Obelisk**, the JMCFI outcome-based-education (OBE) assessment system. It renders the institutional OBE forms, uploads class-record spreadsheets, runs the approval workflow, and surfaces backend-computed attainment results as read-only dashboards/badges.

Part of a monorepo: `backend/` (Elysia + Prisma API at `api/v1`), `python-server/` (FastAPI ETL/analytics), `frontend/` (this app). Progress and roadmap live in `../roadmap.md`.

**Docs:** [`SYSTEM-DESIGN.md`](./SYSTEM-DESIGN.md) (architecture, routes, data flow) · [`AGENTS.md`](./AGENTS.md) (conventions for AI/human contributors).

## Stack

Next.js 16 (App Router, `proxy` instead of middleware) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Jotai (client state) · @tanstack/react-table · EvilCharts/ECharts · react-hook-form + Zod (auth screens) · better-auth sessions.

## Getting started

Runtime and package manager is **Bun** only. Every dev command runs through **dotenvx** so the encrypted `.env.local` is decrypted into the process — plain `next dev` will not load it.

```bash
bun install          # install deps
bun dev              # = bunx dotenvx run -f .env.local -- next dev  → http://localhost:3000
bun run build        # production build (dotenvx-wrapped)
bun run lint         # biome check
bun run format       # biome format --write
```

Secrets: `.env.local` is encrypted with dotenvx (`DOTENV_PUBLIC_KEY_LOCAL`); the key lives in the gitignored `.env.keys`. Edit via `bun run env:decrypt` → edit → `bun run env:encrypt`. Env vars are validated by Zod in `utils/env.ts`.

### Development mode

With `DEVELOPMENT=true` the frontend disables auth: `proxy.ts` and the server guards short-circuit to a dev user so every route is viewable without an account. Simulate a role by editing `DEV_ROLE` in `server/api-client.ts` (currently `dean`). Set `DEV_ENFORCE_ROLE_ACCESS` in `lib/dev-mode.ts` to `true` to enforce route gates like production (default `false` = open navigation). The backend still enforces auth.

## Structure

```
app/
├── (auth)/          # guest-only: login, register (Google-only sign-up)
├── (app)/           # authenticated shell: dashboard, forms/*, submissions,
│                    #   approvals, plo-management, archives
├── onboarding/      # role picker for new accounts (role = user)
└── layout.tsx       # root: theme, Jotai StoreProvider, Toaster
components/
├── layout/          # app-shell, app-sidebar, site-header, nav-*
├── auth/ forms/ inbox/ outcomes/ dashboard/ charts/ evilcharts/ reui/ ui/
config/navigation.ts # single route/role registry (sidebar + gating + titles)
lib/                 # roles.ts, api-client.ts, store/ (Jotai atoms), dev-mode.ts
server/              # auth guards, api-client (cookie forwarding), actions/
proxy.ts             # coarse session-cookie gate (Next 16 proxy)
```

- **Routing & auth:** `proxy.ts` only redirects unauthenticated requests on `/dashboard`, `/forms`, `/archives`. Real session + role checks run in server layouts/pages (`server/auth.ts`, `lib/roles.ts`).
- **Data:** browser reads go through `lib/api-client.ts`; all mutations are Server Actions in `server/actions/` calling `actionApi` (`server/api-client.ts`), which forwards cookies and relays backend `Set-Cookie` headers.
- **Forms:** 20 built OBE form screens under `app/(app)/forms/`, keyed by the stable snake_case form codes (see `../backend/SYSTEM-DESIGN.md` for the catalog).
