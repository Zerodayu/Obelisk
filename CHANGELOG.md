# Changelog

Release notes for [Obelisk](https://github.com/Zerodayu/Obelisk), newest first. Format: [`.github/CHANGELOG-FORMAT.md`](.github/CHANGELOG-FORMAT.md).

---

# v0.2.0 — self-hosted stack: Caddy TLS, Dozzle logs, umami analytics & Postgres

> **One public port, no external services**: the stack runs behind a single Caddy edge with automatic HTTPS and ships its own log viewer, analytics and Postgres.

## — Features / What's New
- Caddy proxy endpoint (TLS, only public port 80/443)
- Dozzle log viewer (ADMIN_IPS-gated)
- Access logs on every hop
- umami analytics (self-hosted, ADMIN_IPS-gated)
- Page-view tracker loads only when configured
- One-time setup documented in DEPLOYMENT.md
- Own Postgres — no external database
- `just db-up` for development (data in a volume)
- Separate dev/prod databases (`obelisk_dev` / `obelisk`)
- Prisma driver swapped to `@prisma/adapter-pg`
- Test suite green (195 pass / 0 fail / 27 files)
- `just deploy-local` — machine-local, no public exposure
- Production migration scripts (`db:*-prod`, `docker-migrate`)
- Action-Taken Record form (clears at-risk flags)
- LLM key failover (`OBELISK_LLM_API_KEYS`)
- Integration regression tests (39 pass)

## — Fixes
- CAR saving works end to end (method, merge, upserts, empty state)
- PLO roll-up reads DB `CloToPloMap` rows again
- AI generate no longer 422s (empty body)
- CLO6/CLO7 labelled as placeholders
- Cached job status scoped to its section
- Test flaking fixed (fixture cleanup, 60 s timeout)
- AI usage default restored
- Broken `LICENSE` / `justfile` links fixed

## — Changes
- Compose stack grew from 4 services to 9 (caddy, backend, frontend, etl, redis, db, dozzle, umami, umami-db)
- Database moved from Neon to Docker (`db` service)
- Seed refuses to run in production (audit issue 1.3)
- Env consolidated into the three root env files
- `.env.docker` injected by the `docker-deploy` dotenvx wrap
- `DIRECT_URL` now holds the same URL as `DATABASE_URL`
- Workspace versions aligned at 0.2.0
- OpenAPI advertises the release version instead of `v0`
- Docs restructured (README / CONTRIBUTING / DEPLOYMENT / FORKING / `system-docs/`)
- Encrypted env files rotated
- Live API results recorded in `system-docs/testing_results.md`

## — Getting started

Deploy the whole stack on a server with Docker:

### • Requirements
- Docker (compose + Buildx), [`just`](https://just.systems/), [`dotenvx`](https://dotenvx.com/) and [`bun`](https://bun.sh)
- A domain pointing at the server (ports 80/443)
- Own Postgres included (`db` service) — no external database needed

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

> ⚠️ Always deploy via `just docker-deploy` (a bare `docker compose up` skips the dotenvx wrap and Caddy refuses to boot) and stop `just dev` first so the host ports don't clash (the database itself is split: dev/tests use `obelisk_dev`, the deployed stack serves `obelisk`).

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
