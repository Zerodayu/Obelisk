# Contributing to OBELISK

Development setup and workflow documentation. For a project overview, see the [README](README.md); for live progress, see [`roadmap.md`](../system-docs/roadmap.md).

---

## Prerequisites

- [Bun](https://bun.sh) `>= 1.x` (runtime and package manager for the backend and frontend)
- [uv](https://docs.astral.sh/uv/) — for running `python-server` locally (uv manages the Python interpreter and dependencies)
- [Docker](https://www.docker.com) — optional; runs the whole self-hosted stack (backend, frontend, ETL, Redis) via the root `docker-compose.yml`, and Redis for local ETL development
- [just](https://github.com/casey/just) — optional, to use the root [`justfile`](../justfile) recipes (§4)
- A **PostgreSQL** database. The backend uses the Neon serverless driver over a standard Postgres connection string, so both [Neon](https://neon.tech) and a local Postgres instance work.

---

## 1. Clone the repository

```sh
git clone https://github.com/Zerodayu/Obelisk.git
cd Obelisk
```

---

## 2. Environment setup

The repo is a **Bun-workspaces monorepo**: `apps/backend/` and `apps/frontend/` both read their configuration from a single pair of env files at the repository root:

- **`.env.local`** — development; what every local script loads (`just dev`, and the per-package `dev` / `build` / `test` scripts).
- **`.env.prod`** — production values; decrypted for production builds and runs (`bun run build:prod` / `bun run start:prod` inside each package — the Docker stack and Vercel builds).

Both are **encrypted with [dotenvx](https://dotenvx.com)** (public-key headers `DOTENV_PUBLIC_KEY_LOCAL` / `DOTENV_PUBLIC_KEY_PROD`); the private keys live in the gitignored root **`.env.keys`**, so a fresh clone cannot decrypt them out of the box.

Choose **one** of the two options below.

### Option A — Decrypt the committed root env files (requires keys)

Obtain `.env.keys` from a maintainer and place it at the repo root, then:

```sh
just env-decrypt   # decrypt .env.local + .env.prod for editing
# ... edit ...
just env-encrypt   # re-encrypt; the private keys stay in the gitignored .env.keys
```

### Option B — Create a plaintext `.env.local`

dotenvx reads plaintext (unencrypted) env files fine. Create `.env.local` at the repo root with the variables listed below.

> The old per-service files (`apps/backend/.env.local`, `apps/frontend/.env.local`) are no longer read by any script — the root files are the single source of truth.

### Required variables

One root file covers both packages — server vars are validated by `@obelisk/env/server` (`packages/env/src/server.ts`, re-exported as `env` from `apps/backend/utils/env.ts`), frontend vars by `@obelisk/env/client` (`packages/env/src/client.ts`, re-exported from `apps/frontend/utils/env.ts`):

```env
# backend
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/obelisk?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/obelisk?sslmode=require"
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
# DEVELOPMENT=true             # optional — disables the auth gate for quick local preview
```

`.env.prod` must contain the same keys with production values (Vercel URLs, real secrets). Keep `DEVELOPMENT` / `DEV_SESSION_ENABLED` unset there — `next.config.ts` refuses to build while `DEV_SESSION_ENABLED=true`.

**`apps/python-server/.env`** (optional) — CORS origins for the web app:

```env
OBELISK_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
```

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

**Docker (whole stack — from the repo root):**

```sh
docker compose up -d --build          # all four services (or: just docker-up)
docker compose up -d etl              # this service only (Redis starts as its dependency)
```

The compose file lives at the repo root and also owns Redis; the ETL reads optional `OBELISK_*` overrides from `apps/python-server/.env` (compose `env_file`, gitignored).

Verify: <http://localhost:8000/health>

### 3b. backend — API

```sh
cd apps/backend

# create the root .env.local (see §2), then apply the database schema:
bun run db:generate
bun run db:migrate dev

# or, if migrations already exist and you only need to apply them:
# bun run db:migrate deploy

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

The root [`justfile`](../justfile) wraps the common workflows — install, dev, quality checks, and Vercel deploys — via [just](https://github.com/casey/just). `just install` followed by `just dev` is the fastest path to a running stack (after §2 env setup).

### Setup

| Recipe | What it does |
| :--- | :--- |
| `just install` | Install dependencies for all packages (Bun + uv) |
| `just install-bun` | One root `bun install` for the whole workspace (postinstall writes the runtime-env stub) |
| `just env-decrypt` | Decrypt the root `.env.local` + `.env.prod` for editing |
| `just env-encrypt` | Re-encrypt the root env files (private keys stay in the gitignored `.env.keys`) |
| `just install-etl` | Start Redis (Docker Compose), then `uv sync` python-server deps |
| `just redis` | Start Redis via Docker Compose (needed by the ETL service) |

### Dev

| Recipe | What it does |
| :--- | :--- |
| `just dev` | Run backend + frontend + ETL in parallel with colored log prefixes; auto-opens the browser when the frontend is up; Ctrl+C stops all |
| `just dev-as <role>` | Same as `just dev`, but opens the browser already signed in as a seeded role account (real session + cookie) |
| `just session <role>` | Sign in as a seeded role account and print its session cookie for direct backend calls |
| `just stop` | Kill any leftover dev processes |
| `just dev-backend` | Run only the backend (bun watch, `:8080`) |
| `just dev-frontend` | Run only the frontend (`next dev`, `:3000`) |
| `just dev-etl` | Run only the Python ETL service (uvicorn reload on `:8000`) |

### Build & run (production servers)

| Recipe | What it does |
| :--- | :--- |
| `just start` | Turbo-cached build + serve backend (`:8080`) and frontend (`:3000`) with the root `.env.local`; Ctrl+C stops both |
| `just start-prod` | Same, but built and served with the root `.env.prod` — stop the other stack first (same ports) |

Root equivalents are `bun run start` / `bun run start:prod`. Both go through turbo, which **builds each app first and caches per environment** — local and prod builds get separate cache fingerprints, so switching between the two never reuses the other's output. The per-package `start` / `start:prod` scripts don't build and can be run alone (`just _bun apps/backend start:prod`). `start:prod` exports `.env.prod` before anything else and dotenvx never overrides an existing variable, so **`.env.prod` must contain the complete key set** — any key it lacks silently falls back to its `.env.local` value.

The ETL service is not a turbo workspace; run it separately (`just dev-etl` or Docker, §3a).

### Docker (self-hosted stack)

| Recipe | What it does |
| :--- | :--- |
| `just docker-up` | `docker compose up -d --build` — all four services with the root `.env.prod` (fill it + `just env-encrypt` first; stop `just dev` first — same ports) |
| `just docker-up-prod` | Alias of `just docker-up` — the stack is `.env.prod`-only |
| `just docker-down` | Stop the stack (containers stay around for lazydocker) |
| `just docker-logs` | Tail all service logs (Ctrl+C detaches) |

`just` is optional — the recipes are thin wrappers around plain Compose; deploying without it (from the repo root; needs the committed encrypted `.env.local`/`.env.prod` plus the gitignored `.env.keys` in place — dotenvx decrypts **inside** the containers, nothing to install locally):

```sh
docker compose up -d --build          # all four services (.env.prod-only, what `just docker-up` runs)
docker compose logs -f                # tail all service logs (Ctrl+C detaches)
docker compose down                   # stop the stack (containers stay around for lazydocker)
docker compose up -d etl              # single service + its dependency (redis)
```

The root `Dockerfile` is multi-stage (`--target backend \| frontend \| etl`) and the root `docker-compose.yml` wires the four services together. Design notes: the stack is `.env.prod`-only — the encrypted env files are bind-mounted read-only and decrypted by dotenvx **inside** the containers (the gitignored `.env.keys` is required — builds also receive it as a BuildKit secret, never a layer); in-network addresses are injected as `environment:` entries (`REDIS_HOST=redis`, `PYTHON_SERVER_URL=http://etl:8000`) and a build arg (`API_INTERNAL_URL=http://backend:8080`, used by the auth rewrite and server-side fetches); everything browser-facing (`NEXT_PUBLIC_API_URL`, `BETTER_AUTH_URL`, `FRONTEND_URL`) is baked from `.env.prod` at build time — **rebuild** whenever `NEXT_PUBLIC_API_URL` changes, since it is inlined. The `etl` and `redis` ports bind `127.0.0.1` only (etl has no auth, redis has no password); only backend/frontend face the network.

### Quality

| Recipe | What it does |
| :--- | :--- |
| `just lint` | Lint backend + frontend (biome, via turbo) |
| `just typecheck` | Typecheck via turbo (backend only — frontend has no typecheck script, see §5) |
| `just format` | Format backend + frontend (biome, via turbo) |
| `just test` | Run backend tests (all) |
| `just test-unit` | Run backend unit tests |
| `just test-integration` | Run backend integration tests |
| `just check` | Run all quality checks (lint + typecheck + test) |

### Deploy (Vercel)

| Recipe | What it does |
| :--- | :--- |
| `just vercel-link` | Link `apps/backend/` + `apps/frontend/` to Vercel projects (run once; needs `bunx vercel login`) |
| `just deploy-backend [prod]` | Deploy the backend — preview by default, `prod` for production |
| `just deploy-frontend [prod]` | Deploy the frontend — preview by default, `prod` for production |

See §8 for the one-time Vercel setup.

Run `just --list` to see all recipes.

---

## 5. Quality & verification

Prefer the `just check` recipe (§4) to run all of these at once.

Biome is a **root devDependency** (single install, single version) configured by the **root `biome.json`** — per-app behavior (indentation, rule presets, frontend-only rule exceptions) lives in its `overrides` section; there are no per-package configs anymore. `typescript` is hoisted to the root too.

**Backend** (inside `apps/backend/`):

```sh
bun run typecheck   # bunx tsc --noEmit
bun run lint        # bunx biome check
bun test            # bun:test unit + integration tests
```

**Frontend** (inside `apps/frontend/`):

```sh
bun run lint        # biome check
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

To simulate a role, edit `DEV_ROLE` in `apps/frontend/server/api-client.ts` (default `system_admin`).

### Testing with a real account (per role)

`just db-seed` creates one account per role — `<role>@jmcfi.edu.ph` / `password123`, for `user`, `faculty`, `program_chair`, `dean`, `aqau`, `vpaa`, and `system_admin`. Two ways to use them:

- **Browser** — `just dev-as <role>` starts the full stack and opens `http://localhost:3000/dev/session?role=<role>`, which signs in server-side and relays the real session cookie to the browser. Switch roles any time by opening that URL with a different role — no restart. (`user` accounts land on `/onboarding`.)
- **Terminal** — `just session <role>` signs in and prints a `Cookie:` header (also written to `apps/frontend/.dev-session/<role>.cookie`, gitignored) for `curl`/Bun calls straight against the backend.

Dev mode and real sessions are mutually exclusive: with `DEVELOPMENT=true`, `getMe()` short-circuits to `DEV_USER` and the session cookie is ignored. `just dev-as` therefore exports `DEVELOPMENT=false` for that run only (`.env.local` stays as you left it), and `/dev/session` answers `409` if dev mode is on.

`/dev/session` signs in without a password, so it is gated three ways and answers an empty `404` on any miss: non-production `NODE_ENV`, `DEV_SESSION_ENABLED=true` (exported by `just dev` / `dev-as` / `dev-frontend`, **not** by a hand-run `bun dev`), and a loopback request host. `next.config.ts` refuses `next build`/`next start` while the flag is set, so the route cannot ship; `bun run dev-session <role>` refuses a non-loopback backend too. Refusals and successful sign-ins are logged as `[dev-session] …` in the frontend console.

---

## 7. Troubleshooting

- **`[dotenvx] This is a private key. Please use the public key...`, `[DECRYPTION_FAILED]`, or other decryption errors** — you don't have the root `.env.keys`. Ask a maintainer for it and place it at the repo root, or replace `.env.local` with a plaintext file (Option B in §2). On Vercel this means the project is missing the `DOTENV_PRIVATE_KEY_PROD` env var (§8).
- **Backend fails to start with a missing-var error** — all required env vars are Zod-validated at startup in `packages/env/src/server.ts` (via `apps/backend/utils/env.ts`); fill in the missing ones in the root `.env.local`.
- **Prisma connection errors** — confirm `DATABASE_URL` / `DIRECT_URL` point to a reachable Postgres (Neon or local) and that the schema was applied (`bun run db:migrate dev`).
- **Port already in use** — the services expect `8080`, `3000`, and `8000`. Stop anything occupying those ports.
- **Frontend can't reach the API** — ensure the backend is running and `NEXT_PUBLIC_API_URL` matches its origin (`http://localhost:8080`).
- **python-server uploads fail** — the ETL service has no database and no auth; the backend must be reachable (`PYTHON_SERVER_URL`), and the upload endpoints require the backend to be running too.

---

## 8. Deploying to Vercel

`apps/backend/` and `apps/frontend/` deploy as two separate Vercel projects from this repo; `python-server` stays on your own host (the root `docker-compose.yml` on the docker host — `just docker-up`, or plain `docker compose up -d --build`, runs the whole stack there). Both projects use zero-config framework detection plus a `vercel.json` override — `buildCommand: "bun run build:prod"` (and `bunVersion: "1.x"` for the backend, which deploys as a Bun-runtime Elysia function: `apps/backend/src/index.ts` default-exports the app).

### One-time setup

1. `bunx vercel login`, then `just vercel-link` (links `apps/backend/` + `apps/frontend/` to Vercel projects).
2. In **both** Vercel projects, add the environment variable **`DOTENV_PRIVATE_KEY_PROD`** with the value of the matching line from the root `.env.keys` (e.g. `DOTENV_PRIVATE_KEY_PROD=a08d…`). The gitignored keys file cannot reach Vercel's build container; the env *values* still come from the committed, encrypted `.env.prod` — only the decryption key lives in Vercel. Without it the build fails with `[DECRYPTION_FAILED]` (§7).

### Deploying

```sh
just deploy-backend          # preview deployment
just deploy-frontend
just deploy-backend prod     # production
just deploy-frontend prod
```

### What the build does

- `bun run build:prod` decrypts `../../.env.prod` (root file) and runs the normal build: the frontend builds Next.js with prod values inlined (`NEXT_PUBLIC_API_URL`), the backend runs `prisma generate` **and** `packages/env/scripts/gen-runtime-env.ts`, which bakes the decrypted values into `packages/env/src/generated/runtime-env.ts` (gitignored, generated only at build time) so the serverless function has env vars at runtime. `@obelisk/env/server` reads `process.env.X ?? runtimeEnv.X`, so platform-provided vars still override the baked-in file. The canonical key list is `packages/env/env-keys.ts`.
