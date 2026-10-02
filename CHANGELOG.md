# Changelog

Release notes for [Obelisk](https://github.com/Zerodayu/Obelisk), newest first. Format: [`.github/CHANGELOG-FORMAT.md`](.github/CHANGELOG-FORMAT.md).

---

# v0.2.0 — self-hosted stack: Caddy TLS, Dozzle logs, umami analytics & Postgres

> **One public port, no external services**: the stack runs behind a single Caddy edge with automatic HTTPS and ships its own log viewer, analytics and Postgres.

## — Features / What's New

### • Edge stack (Caddy)
- **Caddy is the only public entrypoint** — it terminates TLS and routes `/api/*` to the backend and everything else to the frontend, so only **80 / 443** are open
- **Per-request access logs on every hop** — caddy, the frontend proxy and the backend hooks all log to one place through Dozzle

### • Private ops tooling
- **Dozzle** is a log viewer on its own hostname that answers **403** to anyone outside the `ADMIN_IPS` allow-list
- Log tails stream live (`flush_interval -1`) and `docker.sock` is mounted read-only with actions/shell off

### • Analytics: umami
- **Self-hosted umami** runs on its own hostname with dashboard and stats API behind `ADMIN_IPS`, while `/script.js` and `/api/send` stay public for visitors
- The frontend loads the tracker only when both `NEXT_PUBLIC_UMAMI_DOMAIN` and `NEXT_PUBLIC_UMAMI_WEBSITE_ID` are set (empty = no script)
- One-time setup, the `403` rule and a `pg_dump` backup command are documented in DEPLOYMENT.md

### • Self-hosted database
- A `db` service replaces Neon, so there is no external database account or connection string to manage
- `just db-up` starts it for development on loopback `127.0.0.1:5432`, and its data survives recreates in the `db-data` volume
- The Prisma client now uses **`@prisma/adapter-pg`** over plain TCP, and `@neondatabase/serverless` is gone from the dependency tree
- `OBELISK_DB_PASSWORD` joined `.env.docker`, and compose injects the in-network connection URL the same way it overrides `REDIS_HOST`
- The full test suite (**195 pass / 0 fail across 27 files**) runs against the local container in seconds

### • Machine-local deployment
- `just deploy-local` runs the same nine services with **no public exposure**: `*.localhost` names, Caddy's internal CA, no ACME

### • Prod migration scripts, Action-Taken form & LLM failover
- New **`bun run db:*-prod`** scripts and `just docker-migrate` apply production migrations from your machine or inside the container
- New at-risk **Action-Taken Record** form logs the action taken and clears the student's at-risk flag on final approval
- **`OBELISK_LLM_API_KEYS`** takes a list of keys and fails over on quota errors instead of failing the request
- Regression tests cover the CAR Part 1 merge, the empty Part 2 state and enrollment upserts (integration suite green at 39)

## — Fixes
- **Course Assessment Report** saves correctly now — right HTTP method, merged Part 1 data, idempotent enrollments and a reachable Part 2 empty state
- **PLO roll-up** reads the program's own DB `CloToPloMap` rows again instead of the always-empty ETL snapshot
- **AI generate** posts a `{}` body against the required-object route (no more guaranteed `422`)
- Seeded CLO6/CLO7 are labelled as placeholders instead of real outcomes
- A cached job status is only returned for the section that started the job
- Periodic-test fixtures are cleaned up after the last test, and harness-level tests get a 60 s timeout to stop flaking
- AI usage default restored to its placeholder value
- Broken `LICENSE` / `justfile` links in `.github`

## — Changes
- The compose stack grows from four services to **nine** (caddy, backend, frontend, etl, redis, db, dozzle, umami, umami-db) on separate `edge` / `internal` networks with Docker's default json-file logging
- **Database moved off Neon** to the bundled `db` service, taking the connection URLs, `OBELISK_DB_PASSWORD` and the Prisma driver adapter with it
- Env handling consolidated into the three root env files, with `.env.docker` injected by the dotenvx wrap in `just docker-deploy` (a bare `docker compose up` no longer starts Caddy)
- **`DIRECT_URL`** stays in the Zod-validated env set for the Prisma CLI and now holds the same URL as `DATABASE_URL`
- Workspace versions aligned at **0.2.0** (backend was `1.0.50`, `@obelisk/env` was `0.0.0`) and the OpenAPI document advertises the release version instead of `v0`
- Docs restructured: README is links-only, dev lives in CONTRIBUTING, DEPLOYMENT and FORKING are new, and system docs moved to `system-docs/`
- Encrypted env files rotated
- Live API run results for sections 3, 5, 6 and 9 are recorded in `system-docs/testing_results.md`

## — Getting started

Deploy the whole stack on a server with Docker:

### • Requirements
- Docker Engine with the **compose plugin** and **Buildx** (`docker compose version` must work), plus [`just`](https://just.systems/), [`dotenvx`](https://dotenvx.com/) and [`bun`](https://bun.sh)
- A **domain** whose A record points at the server — ports **80 / 443** must be reachable (Caddy issues the TLS certificate)
- The stack ships its own Postgres (`db` service) — no external database needed

### • One-time setup
```sh
git clone https://github.com/Zerodayu/Obelisk.git
cd Obelisk
# put the .env.keys file (gitignored) in the repo root — for a fork, generate your own (FORKING.md)
just env-decrypt        # decrypt .env.prod + .env.docker for editing
# fill .env.prod (DATABASE_URL, DIRECT_URL, BETTER_AUTH_SECRET, https://<domain> origins) and
# .env.docker (APP_DOMAIN, DOZZLE_DOMAIN, UMAMI_DOMAIN, ADMIN_IPS, OBELISK_DB_PASSWORD, UMAMI_*)
just env-encrypt        # re-encrypt — .env.keys stays gitignored
```

### • First deploy
```sh
just docker-deploy      # build the images + start all nine services
just docker-migrate     # prisma migrate deploy, inside the backend container
```

> ⚠️ Always deploy via `just docker-deploy` (a bare `docker compose up` skips the dotenvx wrap and Caddy refuses to boot) and stop `just dev` first, since dev and Docker share host ports and, on a single host, the same `db` service (`just test` wipes it).

Verify: `https://<APP_DOMAIN>` (frontend), `https://<APP_DOMAIN>/api/v1` (backend), `https://<DOZZLE_DOMAIN>` (log viewer — `403` unless you come from an `ADMIN_IPS` address), `https://<UMAMI_DOMAIN>` (analytics dashboard, same allow-list), `just docker-logs` (follow logs).

### • Day-to-day
```sh
just docker-update      # git pull → rebuild → recreate → prune old images (add `just docker-migrate` if the schema changed)
just docker-logs        # follow logs of all services (Ctrl+C detaches)
just docker-down        # stop the stack
just deploy-local       # machine-local only (*.localhost, internal CA, no public exposure)
```

Full detail — server setup, env keys, rebuild rules, troubleshooting: [DEPLOYMENT.md](https://github.com/Zerodayu/Obelisk/blob/main/.github/DEPLOYMENT.md) · starting your own instance: [FORKING.md](https://github.com/Zerodayu/Obelisk/blob/main/.github/FORKING.md)

---

# v0.1.0-rc.1 — self-hostable stack (first pre-release)

> **First release!** Obelisk can be self-hosted with one command and the repo is a proper monorepo.

- Four services from one command (`docker compose up -d --build`): backend `:8080`, web app `:3000`, ETL `:8000`, Redis — env files encrypted, decrypted inside the container, private key never baked into an image
- Bun workspaces + Turborepo monorepo with shared **`@obelisk/env`** (Zod-validated env in one place) and **`@obelisk/app-info`**
- Centralized role/permission rules shared by frontend and backend (drift-guarded by a test), AI recommendations panel, safer dev-only `/dev/session` login route
- Fixes: class-record upload race, real ETL error messages surfaced, CAR list endpoints cached

Full notes: [v0.1.0-rc.1 release](https://github.com/Zerodayu/Obelisk/releases/tag/v0.1.0-rc.1)
