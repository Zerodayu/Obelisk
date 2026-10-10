# Contributing to OBELISK

Development setup and workflow documentation. For a project overview, see the [README](README.md); for going live, see [DEPLOYMENT.md](DEPLOYMENT.md); for running your own instance, see [FORKING.md](FORKING.md); for live progress, see [`roadmap.md`](../system-docs/roadmap.md).

---

## Prerequisites

- [Bun](https://bun.sh) `>= 1.x` (runtime and package manager for the backend and frontend)
- [uv](https://docs.astral.sh/uv/) — for running `python-server` locally (uv manages the Python interpreter and dependencies)
- [Docker](https://www.docker.com) — runs Redis (`just redis`) and the app Postgres (`just db-up`) for local development. The full self-hosted stack also runs in Docker — see [DEPLOYMENT.md](DEPLOYMENT.md).
- [just](https://github.com/casey/just) — optional, to use the root [`justfile`](../justfile) recipes (§4)
- A **PostgreSQL** database. The backend connects over a standard Postgres connection string (pg driver adapter); `just db-up` starts the compose `db` service on loopback `:5432`, and a separately managed local Postgres works too as long as `DATABASE_URL` / `DIRECT_URL` point at it.

---

## 1. Clone the repository

```sh
git clone https://github.com/Zerodayu/Obelisk.git
cd Obelisk
```

---

## 2. Environment setup

The repo is a **Bun-workspaces monorepo**: `apps/backend/`, `apps/frontend/` and `apps/python-server/` all read their configuration from a single set of env files at the repository root:

- **`.env.local`** — development; what every local script loads (`just dev`, and the per-package `dev` / `build` / `test` scripts).
- **`.env.prod`** — production values; decrypted for production builds and runs (`bun run build:prod` / `bun run start:prod` inside each package — the Docker stack).
- **`.env.docker`** — deployment-only settings for the Docker stack (`APP_DOMAIN`, `DOZZLE_DOMAIN`, `UMAMI_DOMAIN`, `TS_AUTHKEY`, `UMAMI_DB_PASSWORD`, `UMAMI_APP_SECRET`, `UMAMI_WEBSITE_ID`, plus the `LOCAL_*` set for machine-local mode — see [DEPLOYMENT.md](DEPLOYMENT.md)). Not needed for development.

All three are **encrypted with [dotenvx](https://dotenvx.com)** (public-key headers `DOTENV_PUBLIC_KEY_LOCAL` / `DOTENV_PUBLIC_KEY_PROD` / `DOTENV_PUBLIC_KEY_DOCKER`); the private keys live in the gitignored root **`.env.keys`**, so a fresh clone cannot decrypt them out of the box.

Choose **one** of the two options below.

### Option A — Decrypt the committed root env files (requires keys)

Obtain `.env.keys` from a maintainer and place it at the repo root, then:

```sh
just env-decrypt   # decrypt .env.local + .env.prod + .env.docker for editing
# ... edit ...
just env-encrypt   # re-encrypt; the private keys stay in the gitignored .env.keys
```

### Option B — Create a plaintext `.env.local`

dotenvx reads plaintext (unencrypted) env files fine. Create `.env.local` at the repo root with the variables listed below.

> The old per-service files (`apps/backend/.env.local`, `apps/frontend/.env.local`, `apps/python-server/.env`) are no longer read by any script — the root files are the single source of truth.

### Required variables

One root file covers all three services — server vars are validated by `@obelisk/env/server` (`packages/env/src/server.ts`, re-exported as `env` from `apps/backend/utils/env.ts`), frontend vars by `@obelisk/env/client` (`packages/env/src/client.ts`, re-exported from `apps/frontend/utils/env.ts`):

```env
# backend — dev uses its own database `obelisk_dev` on the Docker db service (just db-up); the deployed stack serves `obelisk`
DATABASE_URL="postgresql://OBELISK_USER:PASSWORD@localhost:5432/obelisk_dev"
DIRECT_URL="postgresql://OBELISK_USER:PASSWORD@localhost:5432/obelisk_dev"
BETTER_AUTH_SECRET="generate-a-long-random-secret"
BETTER_AUTH_URL="http://localhost:3000"
FRONTEND_URL="http://localhost:3000"
PYTHON_SERVER_URL="http://localhost:8000"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
ORG_EMAIL_DOMAIN="jmcfi.edu.ph"
REDIS_HOST="localhost"
REDIS_PORT="6379"
# REDIS_PASSWORD=""            # optional — only when Redis requires auth

# frontend
NEXT_PUBLIC_API_URL="http://localhost:8080"
# NEXT_PUBLIC_UMAMI_DOMAIN="https://stats.mini-mal.localhost"  # optional — tracker origin (e.g. a `just deploy-local` umami); unset = no script
# NEXT_PUBLIC_UMAMI_WEBSITE_ID=""                  # optional — umami website key; unset/empty = no script
# DEVELOPMENT=true             # optional — disables the auth gate for quick local preview

# etl / python-server (OBELISK_ prefix)
OBELISK_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
# OBELISK_LLM_API_KEYS="key1,key2"   # optional — live AI recommendations (comma-separated or JSON list)
# OBELISK_WEBAPP_SHARED_SECRET=""    # optional — X-Webapp-Secret caller check
```

`.env.prod` must contain the same keys with production values (public URLs, real secrets). Keep `DEVELOPMENT` / `DEV_SESSION_ENABLED` unset there — `next.config.ts` refuses to build while `DEV_SESSION_ENABLED=true`.

The ETL decrypts these same root files itself at startup (`apps/python-server/app/core/env.py`): `OBELISK_ENV` picks the file — unset/`local` → `.env.local`, `prod` (set by compose) → `.env.prod`. There is no `apps/python-server/.env` anymore; without the root `.env.keys` it logs a warning in local mode and runs on built-in defaults, and fails fast in prod mode.

---

## 3. Install & run the services

Install once at the repo root — the workspace hoists all Bun packages in a single lockfile (`postinstall` also writes the shared `packages/env/src/generated/runtime-env.ts` stub):

```sh
bun install        # repo root — or: just install-bun / just install
```

Then start services in dependency order. Each runs in its own terminal.

### 3a. python-server — ETL & analytics

**uv (development):**

```sh
cd apps/python-server
uv sync
uv run dev
```

**Docker:** Redis for local ETL development and the app Postgres come from the root compose file — `just redis` and `just db-up` (both also run by `just install`; `just install-etl` runs `uv sync` too). Running the **whole stack** in Docker is a deployment concern: see [DEPLOYMENT.md](DEPLOYMENT.md).

Verify: <http://localhost:8000/health>

### 3b. backend — API

```sh
cd apps/backend

# create the root .env.local (see §2), then apply the database schema:
bun run db:generate
bun run db:migrate        # prisma migrate dev — applies pending migrations (asks before resetting on drift)

# against the production database instead (reads .env.prod):
# bun run db:migrate-prod # prisma migrate deploy

bun run dev
```

The server starts on <http://localhost:8080>. Interactive API docs (OpenAPI/Swagger) are at <http://localhost:8080/openapi>.

### 3c. frontend — web app

```sh
cd apps/frontend

# the root .env.local must exist (see §2)
bun run dev
```

Open <http://localhost:3000>. It proxies `api/v1` requests to the backend at `NEXT_PUBLIC_API_URL` (default `http://localhost:8080`).

---

## 4. Justfile recipes

The root [`justfile`](../justfile) wraps the common workflows — install, dev, database, quality checks — via [just](https://github.com/casey/just). `just install` followed by `just dev` is the fastest path to a running stack (after §2 env setup).

### Setup

| Recipe | What it does |
| :--- | :--- |
| `just install` | Install dependencies for all packages (Bun + uv) |
| `just install-bun` | One root `bun install` for the whole workspace (postinstall writes the runtime-env stub) |
| `just env-decrypt` | Decrypt the root `.env.local` + `.env.prod` + `.env.docker` for editing |
| `just env-encrypt` | Re-encrypt the root env files (private keys stay in the gitignored `.env.keys`) |
| `just install-etl` | Start Redis (Docker Compose), then `uv sync` python-server deps |
| `just redis` | Start Redis via Docker Compose (needed by the ETL service) |
| `just db-up` | Start the app Postgres via Docker Compose (loopback `:5432`) |
| `just db-generate` | Regenerate the Prisma client after a schema change |
| `just db-migrate` | Apply pending Prisma migrations (from the root `.env.local`; needs `just db-up`) |
| `just db-seed` | Seed dev data — one account per role, department, program, term, course, section (wipes previous seed rows; re-run after `just test`) |

### Dev

| Recipe | What it does |
| :--- | :--- |
| `just dev` | Run backend + frontend + ETL in parallel with colored log prefixes; auto-opens the browser when the frontend is up; Ctrl+C stops all |
| `just dev-as <id>` | Same as `just dev`, but opens the browser already signed in as a seeded account (a role such as `dean`, or a role's second account such as `faculty1` — real session + cookie) |
| `just session <id>` | Sign in as a seeded account and print its session cookie for direct backend calls |
| `just stop` | Kill any leftover dev processes |
| `just dev-backend` | Run only the backend (bun watch, `:8080`) |
| `just dev-frontend` | Run only the frontend (`next dev`, `:3000`) |
| `just dev-etl` | Run only the Python ETL service (uvicorn reload on `:8000`) |

### Build & run (local production servers)

There are no `just` recipes for this — use the root scripts:

```sh
bun run start          # turbo-cached build + serve backend (:8080) and frontend (:3000) with .env.local
bun run start:prod     # same, built and served with .env.prod — stop the dev stack first (same ports)
```

Both go through turbo, which **builds each app first and caches per environment** — local and prod builds get separate cache fingerprints, so switching between the two never reuses the other's output. The per-package `start` / `start:prod` scripts don't build and can be run alone (`just _bun apps/backend start:prod`). `start:prod` exports `.env.prod` before anything else and dotenvx never overrides an existing variable, so **`.env.prod` must contain the complete key set** — any key it lacks is never loaded at all (dotenvx only reads the file it is given), so it stays unset instead of falling back to `.env.local`.

The ETL service is not a turbo workspace; run it separately (`just dev-etl`).

### Docker & deploy (self-hosted stack)

The whole stack (Caddy, backend, frontend, ETL, Redis, Postgres, Dozzle, umami + umami-db and the two Tailscale sidecars — eleven services) runs in Docker — that is a deployment concern, fully documented in **[DEPLOYMENT.md](DEPLOYMENT.md)**: one-time server setup, `just docker-deploy`, machine-local mode (`just deploy-local`), tailnet admin access, updates, migrations, and day-2 operations.

### Quality

| Recipe | What it does |
| :--- | :--- |
| `just lint` | Lint backend + frontend (oxlint, via turbo) |
| `just typecheck` | Typecheck via turbo (backend only — frontend has no typecheck script, see §5) |
| `just format` | Format backend + frontend (oxfmt, via turbo) |
| `just test` | Run backend tests (all) |
| `just test-unit` | Run backend unit tests |
| `just test-integration` | Run backend integration tests |
| `just check` | Run all quality checks (lint + typecheck + test) |

Run `just --list` to see all recipes (the `deploy` group — `docker-deploy`, `docker-update`, `docker-migrate`, … — is documented in [DEPLOYMENT.md](DEPLOYMENT.md)).

---

## 5. Quality & verification

Prefer the `just check` recipe (§4) to run all of these at once.

oxc is a **root devDependency** (single install, single version): `oxlint` + `oxfmt`, configured by the root hidden `.oxlintrc.json` / `.oxfmtrc.json` — shared ignore patterns plus per-tool rules (e.g. the `@shadcn/lint` plugin, `shadcn/no-arbitrary-values`), no per-package configs. The repo formats with tabs (`useTabs: true`, width 2). `typescript` is hoisted to the root too.

**Backend** (inside `apps/backend/`):

```sh
bun run typecheck   # bunx tsc --noEmit
bun run lint        # bunx oxlint .
bun test            # bun:test unit + integration tests
```

**Frontend** (inside `apps/frontend/`):

```sh
bun run lint        # bunx oxlint .
bun run build       # production build
bunx tsc --noEmit   # typecheck — manual only: has pre-existing errors, and
                    # `next build` skips them via typescript.ignoreBuildErrors
                    # (see the TODO in next.config.ts)
```

**python-server** (inside `apps/python-server/`): see `apps/python-server/testing_modules/` for standalone and end-to-end test scripts.

---

## 6. Development mode (skip login)

Setting `DEVELOPMENT=true` in the root `.env.local` disables the auth gate so every route is viewable without an account (frontend-only; the backend still enforces auth):

```env
DEVELOPMENT=true
```

To simulate a role, edit `DEV_ROLE` in `apps/frontend/server/api-client.ts` (default `faculty`).

### Testing with a real account (per role)

`just db-seed` creates one account per role — `<id>@jmcfi.edu.ph` / `password123`, for `user`, `faculty`, `program_chair`, `dean`, `aqau`, `vpaa`, and `system_admin` — plus a second `<role>1` account for the data-bearing roles (`faculty1`, `program_chair1`, `dean1`, `aqau1`, `vpaa1`): same role, separate user, so you can sign in twice as one role and see which data is shared between users. Two ways to use them:

- **Browser** — `just dev-as <id>` starts the full stack and opens `http://localhost:3000/dev/session?role=<id>`, which signs in server-side and relays the real session cookie to the browser. Switch accounts any time by opening that URL with a different id (`dean`, `faculty1`, …) — no restart. (`user` accounts land on `/onboarding`.)
- **Terminal** — `just session <id>` signs in and prints a `Cookie:` header (also written to `apps/frontend/.dev-session/<id>.cookie`, gitignored) for `curl`/Bun calls straight against the backend.

Dev mode and real sessions are mutually exclusive: with `DEVELOPMENT=true`, `getMe()` short-circuits to `DEV_USER` and the session cookie is ignored. `just dev-as` therefore exports `DEVELOPMENT=false` for that run only (`.env.local` stays as you left it), and `/dev/session` answers `409` if dev mode is on.

`/dev/session` signs in without a password, so it is gated three ways and answers an empty `404` on any miss: non-production `NODE_ENV`, `DEV_SESSION_ENABLED=true` (exported by `just dev` / `dev-as` / `dev-frontend`, **not** by a hand-run `bun dev`), and a loopback request host. `next.config.ts` refuses `next build`/`next start` while the flag is set, so the route cannot ship; `bun run dev-session <id>` refuses a non-loopback backend too. Refusals and successful sign-ins are logged as `[dev-session] …` in the frontend console.

---

## 7. Troubleshooting

- **`[dotenvx] This is a private key. Please use the public key...`, `[DECRYPTION_FAILED]`, or other decryption errors** — you don't have the root `.env.keys`. Ask a maintainer for it and place it at the repo root, or replace `.env.local` with a plaintext file (Option B in §2).
- **Backend fails to start with a missing-var error** — all required env vars are Zod-validated at startup in `packages/env/src/server.ts` (via `apps/backend/utils/env.ts`); fill in the missing ones in the root `.env.local`.
- **Prisma connection errors** — confirm `DATABASE_URL` / `DIRECT_URL` point at a reachable Postgres (`just db-up`, then `docker compose ps db` — or your own instance) and that the schema was applied (`just db-migrate`).
- **Port already in use** — the services expect `8080`, `3000`, and `8000`. Stop anything occupying those ports.
- **Frontend can't reach the API** — ensure the backend is running and `NEXT_PUBLIC_API_URL` matches its origin (`http://localhost:8080`).
- **python-server uploads fail** — the ETL service has no database and no auth; the backend must be reachable (`PYTHON_SERVER_URL`), and the upload endpoints require the backend to be running too.

---

## 8. Deployment

Production deployment (self-hosted Docker stack on a VPS behind Caddy) is documented in **[DEPLOYMENT.md](DEPLOYMENT.md)** — server prerequisites, env setup, `just docker-deploy`, updates, and database migrations. If you are setting up your own instance instead, see **[FORKING.md](FORKING.md)**.
