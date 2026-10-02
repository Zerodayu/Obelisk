# Changelog sample format

Rules:
- **Title** — concrete, not vague: say what the release delivers (e.g. `self-hosted stack: Caddy TLS, Dozzle logs, umami analytics & Postgres`), not just a theme
- **Bullets** — maximum one sentence each and straightforward; split into several bullets instead of chaining clauses with semicolons

Release Title:

```md
# v0.0.0 — first release: monorepo, auth and role-based dashboards

# v0.1.0-rc.1 — self-hostable stack (first pre-release)

# v0.2.0 — self-hosted stack: Caddy TLS, Dozzle logs, umami analytics & Postgres
```

Release notes:

````md
> **First release!** Obelisk can now be self-hosted with one command, and the repo is a proper monorepo.

## — Features / What's New

### • Self-hosting
- Run the whole system with **one command**: `just docker-deploy` (the dotenvx wrap feeds `.env.docker` to compose)
- Nine services out of the box: **caddy** (the only public port, 80/443), **backend** (`:8080`), **web app** (`:3000`), **ETL** (`:8000`), **Redis**, **db**, **Dozzle**, **umami** + **umami-db**
- Secrets stay safe: env files are encrypted, decrypted inside the container, and the private key never gets baked into a Docker image
- Helper commands: `just docker-logs`, `just docker-down`, `just docker-update` (a bare `docker compose up` skips the dotenvx wrap and Caddy refuses to boot)

### • Monorepo
- Rebuilt as a **Bun workspaces + Turborepo** monorepo: one `bun install`, one lockfile, cached builds
- **`@obelisk/env`** validates all environment variables in one place (Zod) and is shared by frontend and backend
- **`@obelisk/app-info`** holds the app name, version, description and logo in one place

### • Role rules, AI panel & safer dev login
- Role/permission rules are centralized in one place shared by frontend and backend and kept in sync by a test
- AI recommendations panel on the dashboard (for VPAA / system admin)
- Safer dev-only login route (`/dev/session`): local only, off unless explicitly enabled

## — Fixes
- Class-record uploads no longer race when creating the same student twice
- Real error messages from the ETL service now show up instead of a generic failure
- Course Assessment Report list endpoints are now cached

## — Changes
- Env validation moved out of each app into the shared `@obelisk/env` package
- Production env baking (`runtime-env`) moved into `packages/env`, so it is built once for both apps
- `API_INTERNAL_URL` added to the Turborepo cache key (no more stale builds)
- Frontend dev mode is off by default and real logins are enforced
- Docs, README and agent guides refreshed, and encrypted env files rotated

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

> ⚠️ Always deploy via `just docker-deploy` (a bare `docker compose up` skips the dotenvx wrap and Caddy refuses to boot) and stop `just dev` first, since dev and Docker bind the same host ports.

Verify: `https://<APP_DOMAIN>` (frontend), `https://<APP_DOMAIN>/api/v1` (backend), `just docker-logs` (follow logs).

### • Day-to-day
```sh
just docker-update      # git pull → rebuild → recreate → prune old images (add `just docker-migrate` if the schema changed)
just docker-logs        # follow logs of all services (Ctrl+C detaches)
just docker-down        # stop the stack
just deploy-local       # machine-local only (*.localhost, internal CA, no public exposure)
```

Full detail — server setup, env keys, rebuild rules, troubleshooting: [DEPLOYMENT.md](https://github.com/Zerodayu/Obelisk/blob/main/.github/DEPLOYMENT.md) · starting your own instance: [FORKING.md](https://github.com/Zerodayu/Obelisk/blob/main/.github/FORKING.md)
````
