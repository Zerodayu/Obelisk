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

---

## 7. Troubleshooting

- **`[dotenvx] This is a private key. Please use the public key...` or decryption errors** — you don't have `backend/.env.keys` / `frontend/.env.keys`. Ask a maintainer for them, or replace `.env.local` with a plaintext file (Option B in §2).
- **Backend fails to start with a missing-var error** — all required env vars are Zod-validated at startup in `backend/utils/env.ts`; fill in the missing ones.
- **Prisma connection errors** — confirm `DATABASE_URL` / `DIRECT_URL` point to a reachable Postgres (Neon or local) and that the schema was applied (`bun run db:migrate dev`).
- **Port already in use** — the services expect `8080`, `3000`, and `8000`. Stop anything occupying those ports.
- **Frontend can't reach the API** — ensure the backend is running and `NEXT_PUBLIC_API_URL` matches its origin (`http://localhost:8080`).
- **python-server uploads fail** — the ETL service has no database and no auth; the backend must be reachable (`PYTHON_SERVER_URL`), and the upload endpoints require the backend to be running too.
