# Changelog

Release notes for [Obelisk](https://github.com/Zerodayu/Obelisk), newest first.

---

v0.2.0 - One-port self-hosted stack
Runs behind a single Caddy edge with automatic HTTPS and ships its own log viewer, analytics and Postgres.

## features / whats new

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
- `just deploy-local` — machine-local, no public exposure
- Production migration scripts (`db:*-prod`, `docker-migrate`)
- Action-Taken Record form (clears at-risk flags)
- LLM key failover (`OBELISK_LLM_API_KEYS`)

## fixes

- CAR saving works end to end (method, merge, upserts, empty state)
- PLO roll-up reads DB `CloToPloMap` rows again
- AI generate no longer 422s (empty body)
- CLO6/CLO7 labelled as placeholders
- Cached job status scoped to its section
- Test flaking fixed (fixture cleanup, 60 s timeout)
- AI usage default restored
- Broken `LICENSE` / `justfile` links fixed

## changes

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
- Test suite green (195 pass / 0 fail / 27 files)
- Integration regression tests (39 pass)

---
Quick usage:

- `just deploy-local` — machine-local only (*.localhost, internal CA, no public exposure)
- `just docker-deploy` — build images + start all nine services (then `just docker-migrate`)
- `just docker-update` — git pull → rebuild → recreate → prune old images (add `just docker-migrate` if the schema changed)

Docs: [Deployment](DEPLOYMENT.md) · [Contributing](CONTRIBUTING.md) · [Forking](FORKING.md)

### Contributors

<a href="https://github.com/Zerodayu"><img src="https://github.com/Zerodayu.png?size=48" width="48" height="48" alt="@Zerodayu" /></a>
<a href="https://github.com/SerenicuS"><img src="https://github.com/SerenicuS.png?size=48" width="48" height="48" alt="@SerenicuS" /></a>
<a href="https://github.com/Rixyne"><img src="https://github.com/Rixyne.png?size=48" width="48" height="48" alt="@Rixyne" /></a>
