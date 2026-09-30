# Obelisk — Frontend

Next.js 16 (App Router) client for **Obelisk**, the JMCFI outcome-based-education (OBE) assessment system. It renders the institutional OBE forms, uploads class-record spreadsheets, runs the approval workflow, and surfaces backend-computed attainment results as read-only dashboards/badges.

Part of a monorepo: `apps/backend/` (Elysia + Prisma API at `api/v1`), `apps/python-server/` (FastAPI ETL/analytics), `apps/frontend/` (this app). Progress and roadmap live in `../../system-docs/roadmap.md`.

**Docs:** [`SYSTEM-DESIGN.md`](./SYSTEM-DESIGN.md) (architecture, routes, data flow) · [`AGENTS.md`](./AGENTS.md) (conventions for AI/human contributors).

## Stack

Next.js 16 (App Router, `proxy` instead of middleware) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Jotai (client state) · @tanstack/react-table · EvilCharts/ECharts · react-hook-form + Zod (auth screens) · better-auth sessions.

## Getting started

Runtime and package manager is **Bun** only — and this is a workspace, so run `bun install` once at the **repo root**. Every dev command runs through **dotenvx** so the encrypted root `.env.local` is decrypted into the process — plain `next dev` will not load it.

```bash
bun install          # repo root (once) — one lockfile for backend + frontend
cd apps/frontend
bun dev              # = bunx dotenvx run -f ../../.env.local -- next dev  → http://localhost:3000
bun run build        # production build (dotenvx over the root .env.local)
bun run build:prod # prod build — what Vercel runs (dotenvx over the root .env.prod)
bun run lint         # biome check
bun run format       # biome format --write
```

Secrets: the encrypted env files live at the **repo root** (`.env.local` for dev, `.env.prod` for production, header `DOTENV_PUBLIC_KEY_LOCAL`); the private keys live in the gitignored root `.env.keys`. Edit via `just env-decrypt` → edit → `just env-encrypt` (repo root). Env vars are validated by Zod in `@obelisk/env/client` (re-exported by `utils/env.ts`).

Deploy from the repo root with `just deploy-frontend [prod]` (one-time `just vercel-link`; see `../../.github/CONTRIBUTING.md` §8). Note: `next build` skips type errors (`typescript.ignoreBuildErrors` in `next.config.ts`) until the pre-existing `components/ui` type errors are fixed — check manually with `bunx tsc --noEmit`.

### Development mode

With `DEVELOPMENT=true` the frontend disables auth: `proxy.ts` and the server guards short-circuit to a dev user so every route is viewable without an account. Simulate a role by editing `DEV_ROLE` in `server/api-client.ts` (currently `dean`). Set `DEV_ENFORCE_ROLE_ACCESS` in `lib/dev-mode.ts` to `true` to enforce route gates like production (default `false` = open navigation). The backend still enforces auth.

### Testing as a role (seeded accounts)

`just db-seed` creates `<role>@jmcfi.edu.ph` / `password123` for every role (`user`, `faculty`, `program_chair`, `dean`, `aqau`, `vpaa`, `system_admin`) — see `lib/dev-accounts.ts` and `apps/backend/prisma/seed.ts`, which must stay in sync.

```bash
just dev-as dean     # full stack, browser opens already signed in as dean (real session + cookie)
just session dean    # sign in and print a Cookie: header for direct backend calls
bun run dev-session dean   # the same, from inside apps/frontend/
```

`/dev/session?role=<role>` is a dev-only route (`app/dev/session/route.ts`) that signs in server-side, relays the backend's `Set-Cookie`, and redirects — switch roles by opening it with another value, no restart.

Because it signs in without a password, it sits behind three hard gates that **all** answer an empty `404` (indistinguishable from a route that does not exist):

1. `NODE_ENV` must not be `production`.
2. `DEV_SESSION_ENABLED=true` must be in the environment — `just dev`, `just dev-as` and `just dev-frontend` export it; a hand-run `bun dev` leaves it off, so the route does not exist there.
3. The request must reach the server from loopback: `localhost`, `127.0.0.0/8` or `::1`, and a loopback `x-forwarded-for` when a proxy supplies one (an SSH tunnel forwards to localhost too, so the forwarded client is checked as well).

`next.config.ts` additionally throws on `next build` / `next start` while the flag is set, so a bundle with the route enabled cannot be produced. Refusals log `[dev-session] refused: <reason>` and successful sign-ins log `[dev-session] signed in as <email>` in the frontend console. `bun run dev-session <role>` refuses a non-loopback `API_ROOT`, so the CLI only ever mints a session against a local backend.

After the hard gates: dev mode on → `409`, unknown role → `400`.

Dev mode and real sessions are mutually exclusive (`getMe()` returns `DEV_USER` whenever `DEVELOPMENT=true`), so `just dev-as` exports `DEVELOPMENT=false` for that run only — `.env.local` is left as-is, and a plain `just dev` keeps your dev-mode setting. Hitting `/dev/session` while dev mode is on returns a `409` explaining that.

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
