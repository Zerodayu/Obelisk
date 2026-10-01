# Changelog

Release notes for [Obelisk](https://github.com/Zerodayu/Obelisk), newest first. Format: [`.github/CHANGELOG-FORMAT.md`](.github/CHANGELOG-FORMAT.md).

---

# v0.2.0 — edge stack: Caddy, Dozzle & umami

> **One public port.** The self-hosted stack now runs behind a single Caddy edge with automatic HTTPS and ships a private log viewer plus self-hosted analytics.

## — Features / What's New

### • Edge stack (Caddy)
- **Caddy is the only public entrypoint** — one container terminates TLS (Let's Encrypt, HTTP-01, HTTP/3) and routes `/api/*` → backend, everything else → frontend; backend, frontend, ETL, Redis, Dozzle and umami publish no ports at all, so only **80 / 443** are open
- **Per-request access logs on every hop** — caddy (JSON, static assets skipped via `log_skip`), the frontend proxy (`[frontend] METHOD path decision`) and the backend hooks (`[backend] METHOD path status ms`), all readable in one place through Dozzle

### • Private ops tooling
- **Dozzle** container log viewer on its own hostname (`DOZZLE_DOMAIN`), behind an `ADMIN_IPS` allow-list — anyone outside it gets `403` before the request is proxied, and that rejected peer's address lands in the caddy access log so the allow-list is debuggable
- SSE streaming configured (`flush_interval -1`) so log tails arrive live; `docker.sock` is mounted read-only with actions/shell off

### • Analytics: umami
- **Self-hosted umami** (`umami` + `umami-db` Postgres) on its own hostname — dashboard, login and stats API answer `ADMIN_IPS` only, while `/script.js` and `/api/send` stay public so visitors' browsers can report
- The frontend injects the tracker only when `NEXT_PUBLIC_UMAMI_DOMAIN` **and** `NEXT_PUBLIC_UMAMI_WEBSITE_ID` are both set (empty = no script, no requests)
- One-time setup, the `403`-by-design rule and a `pg_dump` backup command documented in DEPLOYMENT.md

### • Machine-local deployment
- `just deploy-local` runs the same eight services with **no public exposure**: `*.localhost` names, Caddy's internal CA (trust it once per machine), no ACME — useful for testing the full stack before it touches a VPS

### • Also new
- Prod DB recipes: `just db-migrate` / `db-generate` against `.env.prod`, plus `bun run db:migrate-prod` and friends from your machine; `just docker-migrate` applies Prisma inside the running container
- New at-risk **Action-Taken Record** form — records the action taken for at-risk students and clears their at-risk flag when the submission is finally approved
- LLM recommendations survive quota exhaustion: `OBELISK_LLM_API_KEYS` takes several keys (JSON list or comma-separated) and fails over on `429`/transient provider errors, returning a structured, key-masked error when they are all used up
- Regression tests covering the CAR Part 1 merge, the empty Part 2 state and enrollment upserts (integration suite green at 39)

## — Fixes
- **Course Assessment Report**: saving PUTs the way the API expects; Part 1 merges `formData` → DB `CloToPloMap` → snapshot fallbacks (and gained editable Bloom's + weight inputs); enrollments upsert per student×section instead of duplicating; Part 2 drops null-percentage rows so the empty state is reachable
- **PLO roll-up** reads the program's DB `CloToPloMap` rows instead of the ETL snapshot copy (which is always `[]`) — PLO attainment rows are written again
- **AI generate** posts a `{}` body against the required-object route (no more guaranteed `422`)
- Seeded CLO6/CLO7 are labelled as placeholders instead of real outcomes
- A cached job status is only returned for the section that started the job
- Periodic-test fixtures are cleaned up after the last test, and harness-level tests get a 60 s timeout so slow Neon runs stop flaking
- AI usage default restored to its placeholder value
- Broken `LICENSE` / `justfile` links in `.github`

## — Changes
- Compose stack grows from four services to **eight** (caddy, backend, frontend, etl, redis, dozzle, umami, umami-db) on separate `edge` / `internal` networks, on Docker's default json-file logging (no `logging:` overrides)
- Env handling consolidated: Python, backend and frontend all load the three root files; `.env.docker` joined the encrypt/decrypt chain and is injected by the dotenvx wrap in `just docker-deploy` instead of a compose `env_file` — a bare `docker compose up` no longer starts Caddy (its guard refuses)
- **`DIRECT_URL` restored**: Prisma CLI (migrate/introspect) runs on the unpooled direct URL while the client keeps the pooled `DATABASE_URL`, and the key is part of the Zod-validated server env set
- Workspace versions aligned at **0.2.0** (backend was `1.0.50`, `@obelisk/env` was `0.0.0`), and the OpenAPI document advertises the release version instead of `v0`
- Docs restructured: README is links-only, dev lives in CONTRIBUTING, DEPLOYMENT and FORKING are new, system docs moved to `system-docs/`; encrypted env files rotated
- Live API run results for sections 3, 5, 6 and 9 recorded in `system-docs/testing_results.md`

## — Getting started

Deploy the whole stack on a server with Docker:

### • Requirements
- Docker Engine with the **compose plugin** and **Buildx** (`docker compose version` must work), plus [`just`](https://just.systems/), [`dotenvx`](https://dotenvx.com/) and [`bun`](https://bun.sh)
- A **domain** whose A record points at the server — ports **80 / 443** must be reachable (Caddy issues the TLS certificate)
- A **PostgreSQL database** reachable from the server ([Neon](https://neon.tech) or a local Postgres)

### • One-time setup
```sh
git clone https://github.com/Zerodayu/Obelisk.git
cd Obelisk
# put the .env.keys file (gitignored) in the repo root — for a fork, generate your own (FORKING.md)
just env-decrypt        # decrypt .env.prod + .env.docker for editing
# fill .env.prod (DATABASE_URL, DIRECT_URL, BETTER_AUTH_SECRET, https://<domain> origins) and
# .env.docker (APP_DOMAIN, DOZZLE_DOMAIN, UMAMI_DOMAIN, ADMIN_IPS, UMAMI_*)
just env-encrypt        # re-encrypt — .env.keys stays gitignored
```

### • First deploy
```sh
just docker-deploy      # build the images + start all eight services
just docker-migrate     # prisma migrate deploy, inside the backend container
```

> ⚠️ A bare `docker compose up` skips the dotenvx wrap, so Caddy exits with `APP_DOMAIN not set - deploy via just docker-deploy`. Stop `just dev` first — dev and Docker bind the same host ports.

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
