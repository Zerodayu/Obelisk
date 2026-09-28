# Contributing to OBELISK

Development setup and workflow documentation. For a project overview, see the [README](README.md); for live progress, see [`roadmap.md`](roadmap.md).

---

## Prerequisites

- [Bun](https://bun.sh) `>= 1.x` (runtime and package manager for the backend and frontend)
- [uv](https://docs.astral.sh/uv/) — for running `python-server` locally (uv manages the Python interpreter and dependencies)
- [Docker](https://www.docker.com) — optional, alternative way to run `python-server` via Docker Compose
- [just](https://github.com/casey/just) — optional, to use the root [`justfile`](justfile) recipes (§4)
- A **PostgreSQL** database. The backend uses the Neon serverless driver over a standard Postgres connection string, so both [Neon](https://neon.tech) and a local Postgres instance work.

---

## 1. Clone the repository

```sh
git clone https://github.com/Zerodayu/Obelisk.git
cd Obelisk
```

---

## 2. Environment setup

The backend and frontend load their configuration from a `.env.local` file located in each service directory. These files are **encrypted with [dotenvx](https://dotenvx.com)**; the decryption keys (`.env.keys`) are gitignored, so a fresh clone cannot decrypt the committed `.env.local` out of the box.

Choose **one** of the two options below per service.

### Option A — Decrypt the committed `.env.local` (requires keys)

The decryption keys live in `backend/.env.keys` and `frontend/.env.keys` (never committed). Obtain them from a maintainer, place them in the right directory, then run every command through `dotenvx`.

### Option B — Create a plaintext `.env.local`

dotenvx reads plaintext (unencrypted) `.env.local` files fine. Create the file with the required variables listed below.

> To edit secrets in an encrypted file: `bun run env:decrypt` → edit → `bun run env:encrypt` (run inside `backend/` or `frontend/`).

### Required variables

**`backend/.env.local`** — validated by `backend/utils/env.ts`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/obelisk?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/obelisk?sslmode=require"
BETTER_AUTH_SECRET="generate-a-long-random-secret"
BETTER_AUTH_URL="http://localhost:3000"
FRONTEND_URL="http://localhost:3000"
PYTHON_SERVER_URL="http://localhost:8000"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
ORG_EMAIL_DOMAIN="jmcfi.edu.ph"
```

**`frontend/.env.local`** — validated by `frontend/utils/env.ts`:

```env
NEXT_PUBLIC_API_URL="http://localhost:8080"
# Optional — disables the auth gate for quick local preview:
# DEVELOPMENT=true
```

**`python-server/.env`** (optional) — CORS origins for the web app:

```env
OBELISK_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
```

---

## 3. Install & run the services

Start services in dependency order. Each runs in its own terminal.

### 3a. python-server — ETL & analytics

**uv (development):**

```sh
cd python-server
uv sync
uv run dev
```

**Docker Compose (production / easy setup):**

```sh
cd python-server
docker compose up --build -d
```

Verify: <http://localhost:8000/health>

### 3b. backend — API

```sh
cd backend
bun install

# create backend/.env.local (see §2), then apply the database schema:
bun run db:generate
bun run db:migrate dev

# or, if migrations already exist and you only need to apply them:
# bunx dotenvx run -f .env.local -- bunx prisma migrate deploy

bun run dev
```

The server starts on <http://localhost:8080>. Interactive API docs (OpenAPI/Swagger) are at <http://localhost:8080/openapi>.

### 3c. frontend — web app

```sh
cd frontend
bun install

# create frontend/.env.local (see §2)
bun run dev
```

Open <http://localhost:3000>. It proxies `api/v1` requests to the backend at `NEXT_PUBLIC_API_URL` (default `http://localhost:8080`).

---

## 4. Justfile recipes

The root [`justfile`](justfile) wraps the common workflows — install, dev, and quality checks — via [just](https://github.com/casey/just). `just install` followed by `just dev` is the fastest path to a running stack (after §2 env setup).

### Setup

| Recipe | What it does |
| :--- | :--- |
| `just install` | Install dependencies for all packages (Bun + uv) |
| `just install-bun` | Install Bun packages for backend + frontend |
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

### Quality

| Recipe | What it does |
| :--- | :--- |
| `just lint` | Lint backend + frontend (biome) |
| `just typecheck` | Typecheck the backend |
| `just format` | Format backend + frontend (biome) |
| `just test` | Run backend tests (all) |
| `just test-unit` | Run backend unit tests |
| `just test-integration` | Run backend integration tests |
| `just check` | Run all quality checks (lint + typecheck + test) |

Run `just --list` to see all recipes.

---

## 5. Quality & verification

Prefer the `just check` recipe (§4) to run all of these at once.

**Backend** (inside `backend/`):

```sh
bun run typecheck   # bunx tsc --noEmit
bun run lint        # bunx biome check
bun test            # bun:test unit + integration tests
```

**Frontend** (inside `frontend/`):

```sh
bun run lint        # biome check
bun run build       # production build
```

**python-server** (inside `python-server/`): see `python-server/testing_modules/` for standalone and end-to-end test scripts.

---

## 6. Development mode (skip login)

Setting `DEVELOPMENT=true` in `frontend/.env.local` disables the auth gate so every route is viewable without an account (frontend-only; the backend still enforces auth):

```env
DEVELOPMENT=true
```

To simulate a role, edit `DEV_ROLE` in `frontend/server/api-client.ts` (default `system_admin`).

### Testing with a real account (per role)

`just db-seed` creates one account per role — `<role>@jmcfi.edu.ph` / `password123`, for `user`, `faculty`, `program_chair`, `dean`, `aqau`, `vpaa`, and `system_admin`. Two ways to use them:

- **Browser** — `just dev-as <role>` starts the full stack and opens `http://localhost:3000/dev/session?role=<role>`, which signs in server-side and relays the real session cookie to the browser. Switch roles any time by opening that URL with a different role — no restart. (`user` accounts land on `/onboarding`.)
- **Terminal** — `just session <role>` signs in and prints a `Cookie:` header (also written to `frontend/.dev-session/<role>.cookie`, gitignored) for `curl`/Bun calls straight against the backend.

Dev mode and real sessions are mutually exclusive: with `DEVELOPMENT=true`, `getMe()` short-circuits to `DEV_USER` and the session cookie is ignored. `just dev-as` therefore exports `DEVELOPMENT=false` for that run only (`.env.local` stays as you left it), and `/dev/session` answers `409` if dev mode is on.

`/dev/session` signs in without a password, so it is gated three ways and answers an empty `404` on any miss: non-production `NODE_ENV`, `DEV_SESSION_ENABLED=true` (exported by `just dev` / `dev-as` / `dev-frontend`, **not** by a hand-run `bun dev`), and a loopback request host. `next.config.ts` refuses `next build`/`next start` while the flag is set, so the route cannot ship; `bun run dev-session <role>` refuses a non-loopback backend too. Refusals and successful sign-ins are logged as `[dev-session] …` in the frontend console.

---

## 7. Troubleshooting

- **`[dotenvx] This is a private key. Please use the public key...` or decryption errors** — you don't have `backend/.env.keys` / `frontend/.env.keys`. Ask a maintainer for them, or replace `.env.local` with a plaintext file (Option B in §2).
- **Backend fails to start with a missing-var error** — all required env vars are Zod-validated at startup in `backend/utils/env.ts`; fill in the missing ones.
- **Prisma connection errors** — confirm `DATABASE_URL` / `DIRECT_URL` point to a reachable Postgres (Neon or local) and that the schema was applied (`bun run db:migrate dev`).
- **Port already in use** — the services expect `8080`, `3000`, and `8000`. Stop anything occupying those ports.
- **Frontend can't reach the API** — ensure the backend is running and `NEXT_PUBLIC_API_URL` matches its origin (`http://localhost:8080`).
- **python-server uploads fail** — the ETL service has no database and no auth; the backend must be reachable (`PYTHON_SERVER_URL`), and the upload endpoints require the backend to be running too.
