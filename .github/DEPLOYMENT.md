# Deployment

Self-hosted deployment of OBELISK on a VPS behind [Caddy](https://caddyserver.com) (automatic HTTPS). For development setup, see [`CONTRIBUTING.md`](CONTRIBUTING.md); for starting your own instance, see [`FORKING.md`](FORKING.md).

---

## Architecture

The root [`docker-compose.yml`](../docker-compose.yml) runs the whole stack from the repo root — eleven services, one public entrypoint:

| Service | Container | Exposed | Role |
| :--- | :--- | :--- | :--- |
| **caddy** | `caddy:2-alpine` | **80 / 443 (+443/udp)** | The only public entrypoint — terminates TLS (Let's Encrypt, HTTP-01), routes `/api/*` → backend, everything else → frontend (see [`Caddyfile`](../Caddyfile)); second site blocks serve dozzle on `DOZZLE_DOMAIN` and umami on `UMAMI_DOMAIN` |
| **backend** | `obelisk-backend` | — (in-network) | Elysia API on `:8080`, reached by caddy over the `edge` network |
| **frontend** | `obelisk-frontend` | — (in-network) | Next.js on `:3000`, served by caddy over the `edge` network |
| **etl** | `obelisk-etl` | — (in-network) | Python ETL on `:8000`, reached by the backend over the `internal` network (no auth by design) |
| **redis** | `redis:alpine` | `127.0.0.1:6379` | Cache/bull queue — loopback only (no password), so `just dev` on the same host still reaches it |
| **db** | `postgres:15-alpine` | `127.0.0.1:5432` | The app's Postgres (Prisma) — backend reaches it over `db:5432`, the loopback publish lets `just dev` / `just db-migrate` on the same host reach it (dev uses its own `obelisk_dev` database, the app serves `obelisk`); data in the `db-data` volume |
| **dozzle** | `amir20/dozzle:latest` | — (in-network) | Container log viewer — the public `DOZZLE_DOMAIN` site answers **every** request with 403; real access is the tailnet name served by the sidecar below |
| **tailscale-dozzle** | `tailscale/tailscale:latest` | — (shares dozzle's netns) | Tailscale sidecar — registers as `obelisk-logs.<tailnet>.ts.net` and proxies dozzle to tailnet devices only (no published port, no Tailscale install on the host) |
| **umami** | `ghcr.io/umami-software/umami:latest` | — (in-network) | Self-hosted analytics — caddy keeps `/script.js` + `/api/send` reachable for every visitor (the frontend tracker) and answers every other path on `UMAMI_DOMAIN` with 403; the dashboard is served on the tailnet by the sidecar below |
| **tailscale-umami** | `tailscale/tailscale:latest` | — (shares umami's netns) | Tailscale sidecar — registers as `obelisk-stats.<tailnet>.ts.net` and proxies the umami dashboard to tailnet devices only |
| **umami-db** | `postgres:15-alpine` | — (in-network) | Umami's datastore — reached only by `umami` over `umami-db:5432`, data in the `umami-db-data` volume |

Design notes:

- The stack is **`.env.prod`-only**. The encrypted `.env.prod` and the gitignored `.env.keys` are bind-mounted read-only into every app container and decrypted by dotenvx **inside** the container (the build also receives `.env.keys` as a BuildKit secret — never a layer).
- In-network addresses are injected as `environment:` entries (`REDIS_HOST=redis`, `PYTHON_SERVER_URL=http://etl:8000`, `DATABASE_URL`/`DIRECT_URL=…@db:5432` — these two override whatever `.env.prod` holds, dotenvx never overrides a set var); the frontend's server-side fetch/auth rewrite uses the build arg `API_INTERNAL_URL=http://backend:8080`.
- Everything browser-facing (`NEXT_PUBLIC_API_URL`, `BETTER_AUTH_URL`, `FRONTEND_URL`, `NEXT_PUBLIC_UMAMI_*`) is **baked at build time** — see [Rebuild rules](#rebuild-rules).
- Only caddy faces the network. The ETL service has no auth and Redis has no password; they stay in-network / loopback. Dozzle mounts `docker.sock` (root-equivalent) but keeps no published port — on `DOZZLE_DOMAIN` caddy answers **every** request with 403 (fail-closed), and the only working entrypoint is the `tailscale-dozzle` sidecar (`https://obelisk-logs.<tailnet>.ts.net`, gated by tailnet membership + ACL), with container actions/shell disabled. Umami follows the same pattern on `UMAMI_DOMAIN`: only the tracker endpoints (`/script.js`, `/api/send`) are public, the dashboard paths 403 and live on `https://obelisk-stats.<tailnet>.ts.net` via `tailscale-umami`.
- Persisted volumes: `uploads` (ETL file drops), `caddy-data` + `caddy-config` (TLS certs — they must survive recreates or Let's Encrypt rate limits get burned), `dozzle-data` (dozzle settings), `db-data` (app Postgres), `umami-db-data` (analytics events), `ts-dozzle-state` + `ts-umami-state` (the sidecars' tailnet identity — losing them re-registers the nodes).

---

## Requirements

> Copy-paste walkthrough from a bare VPS (packages → `just docker-deploy`): **[`VPS_SETUP.md`](VPS_SETUP.md)**.

On the server:

- A **VPS** (any provider) with Docker — [Docker Engine](https://docs.docker.com/engine/install/) including the **compose plugin** and **Buildx** (`docker compose version` must work)
- [just](https://just.systems/) — recipe runner, **≥ 1.27** required by the justfile's `[group(...)]` attributes (`pacman -S just`; `apt install just` on Ubuntu 24.04 ships 1.21 — see [VPS_SETUP.md §3](VPS_SETUP.md#3-just))
- [dotenvx](https://dotenvx.com/) — used by `just docker-deploy` to inject `.env.docker` into compose
- [Bun](https://bun.sh) — runs the root scripts behind some recipes
- A **domain** (or subdomain) whose **A record points at the server's IP** — Caddy issues the TLS certificate via HTTP-01, so ports **80 and 443** must be reachable (443/udp is optional, HTTP/3 only)
- A **Tailscale account** (a tailnet — free tier is enough) — the log viewer and analytics dashboard are reachable from tailnet devices only; the server itself installs no Tailscale, the sidecar containers join instead (see [Tailscale admin access](#tailscale-admin-access))

On your machine: none of the above is needed to *operate* the stack once it is on the server — everything below runs there.

> The stack ships its own Postgres (`db` service) — no external database is required.

---

## One-time server setup

### 1. Clone

```sh
git clone https://github.com/Zerodayu/Obelisk.git
cd Obelisk
```

### 2. Secrets: `.env.keys`

The committed env files are encrypted; the private keys live in the gitignored **`.env.keys`**. Copy the maintainer's `.env.keys` to the repo root (for a fork, generate your own — see [`FORKING.md`](FORKING.md)).

```sh
just env-decrypt    # decrypt .env.prod + .env.docker for editing (also .env.local)
```

### 3. Fill `.env.prod`

The same key set as `.env.local` ([`CONTRIBUTING.md` §2](CONTRIBUTING.md)) with **production values**:

- `DATABASE_URL` / `DIRECT_URL` — the loopback `db` service URL, e.g. `postgresql://obelisk:OBELISK_DB_PASSWORD@localhost:5432/obelisk` (what `.env.prod` holds, so host-side `bun run db:*-prod` scripts work on the server); the compose file overrides both in-network to `@db:5432`, the same way `PYTHON_SERVER_URL`/`REDIS_HOST` are overridden
- `BETTER_AUTH_SECRET` — a new long random secret (not the dev one)
- `BETTER_AUTH_URL` / `FRONTEND_URL` — `https://<your-domain>` (caddy terminates TLS, so these are the public HTTPS origin)
- `NEXT_PUBLIC_API_URL` — `https://<your-domain>/api/v1` (**baked at build** — see [Rebuild rules](#rebuild-rules))
- `PYTHON_SERVER_URL` — leave as `http://localhost:8000`; the compose file overrides it in-network to `http://etl:8000`
- `REDIS_HOST` / `REDIS_PORT` — leave as `localhost` / `6379`; overridden in-network to `redis`
- `ORG_EMAIL_DOMAIN`, Google OAuth credentials, `OBELISK_*` — production values
- Keep `DEVELOPMENT` and `DEV_SESSION_ENABLED` **unset** — `next.config.ts` refuses to build while `DEV_SESSION_ENABLED=true`

`.env.prod` must contain the **complete key set**: dotenvx only reads the file it is given and never overrides an existing variable, so any key `.env.prod` lacks is simply **unset** in the container — there is no `.env.local` fallback, and a missing value either takes a code default or fails the Zod startup validation.

### 4. Fill `.env.docker`

Eight keys consumed by the compose file (via the dotenvx wrap in `just docker-deploy`) — three for Caddy, one for Tailscale, three for umami, one for the app Postgres:

```env
APP_DOMAIN="obelisk.example.com"      # the public site address — Caddy refuses to boot without it
DOZZLE_DOMAIN="dozzle.example.com"    # second hostname for the log viewer — create the matching DNS record first
UMAMI_DOMAIN="umami.example.com"      # analytics hostname — create its DNS record too (also baked into the frontend tracker origin)
TS_AUTHKEY="tskey-auth-..."           # reusable Tailscale auth key tagged `tag:obelisk` — both sidecars register with it (admin console → Settings → Keys; see Tailscale admin access)
OBELISK_DB_PASSWORD="..."             # postgres password for the db container — URL-safe (letters/digits): compose interpolates it straight into the backend's DATABASE_URL, where `@ / : %` break the connection (openssl rand -hex 12)
UMAMI_DB_PASSWORD="..."               # postgres password for the umami-db container — URL-safe (letters/digits): compose interpolates it straight into umami's DATABASE_URL, where `@ / : %` break the connection
UMAMI_APP_SECRET="..."                # umami's JWT/session signing secret — openssl rand -base64 32
UMAMI_WEBSITE_ID="..."                # website key from the umami dashboard, baked into the frontend build — empty ships no tracker
```

Plus seven `LOCAL_*` keys consumed only by [`docker-compose.local.yml`](../docker-compose.local.yml) (see [Local deployment](#local-deployment)):

```env
LOCAL_APP_DOMAIN="obelisk.mini-mal.localhost"  # any *.localhost depth resolves to loopback (RFC 6761); Caddy signs it with its internal CA (no ACME)
LOCAL_DOZZLE_DOMAIN="logs.mini-mal.localhost"
LOCAL_UMAMI_DOMAIN="stats.mini-mal.localhost"
LOCAL_ADMIN_IPS="127.0.0.1 ::1 192.168.1.14 172.16.0.0/12"
LOCAL_FRONTEND_URL="https://obelisk.mini-mal.localhost"
LOCAL_API_URL="https://obelisk.mini-mal.localhost/api/v1"
LOCAL_UMAMI_WEBSITE_ID=""                     # website key of the LOCAL umami instance — empty = no tracker in local builds
```

> ⚠️ `TS_AUTHKEY` must be **reusable** (both sidecars register with it) and tagged `tag:obelisk` (create the tag first under Settings → ACL tags). An empty, single-use or expired key leaves `tailscale-dozzle` / `tailscale-umami` in a registration loop — the stack still runs, the tailnet names just don't resolve. Details: [Tailscale admin access](#tailscale-admin-access).

### 5. Re-encrypt

```sh
just env-encrypt    # re-encrypt all three env files; .env.keys stays gitignored
```

### 6. Apply the database schema

```sh
just docker-deploy                        # first build + start (see below), then:
just db-status                            # read-only: report pending migrations
just docker-migrate                       # prisma migrate deploy, inside the backend container
just db-check                             # verify the app tables exist (no rows = blank DB, never migrated)
```

Or apply migrations from your machine against the prod database with `cd apps/backend && bun run db:migrate-prod`.

> ⚠️ **Do not run `db:seed` against production.** The seed wipes and recreates accounts/reference data and now refuses on production by itself (`NODE_ENV=production` or the in-network `db` host — added 2026-10-02, see [`system-docs/testing_results.md`](../system-docs/testing_results.md) 1.3); never set its `OBELISK_SEED_ALLOW_PROD=1` override against a live instance.

---

## Deploying

From the repo root **on the server**:

```sh
just docker-deploy
```

That runs `bunx dotenvx run -f .env.docker -- docker compose up -d --build` — it builds the three images (root multi-stage [`Dockerfile`](../Dockerfile), targets `backend` / `frontend` / `etl`) and starts all eleven services with `.env.prod` values. `APP_DOMAIN` / `DOZZLE_DOMAIN` / `UMAMI_DOMAIN` / `TS_AUTHKEY` / `OBELISK_DB_PASSWORD` / `UMAMI_DB_PASSWORD` / `UMAMI_APP_SECRET` are injected for compose interpolation; **a bare `docker compose up` skips the wrap** and Caddy's guard exits with `APP_DOMAIN not set - deploy via just docker-deploy`.

Verify: `https://<APP_DOMAIN>` (frontend), `https://<APP_DOMAIN>/api/v1` (backend), `https://<DOZZLE_DOMAIN>` (log viewer — **403 by design**, the public hostname is fail-closed), `https://<UMAMI_DOMAIN>` (dashboard paths — 403 by design; `curl -I https://<UMAMI_DOMAIN>/script.js` answers 200 from anywhere), plus both tailnet names from a tailnet device (see [Tailscale admin access](#tailscale-admin-access)). Logs: `just docker-logs`.

> Stop `just dev` first — the dev stack and the Docker stack bind the same host ports (Redis aside, which is shared via loopback).

### Tailscale admin access

The two admin surfaces are **not reachable from the public internet**: caddy answers both public hostnames with `403`, and the real entrypoints are MagicDNS names served by the sidecars:

| Surface | Tailnet URL | Sidecar |
| :--- | :--- | :--- |
| Dozzle log viewer | `https://obelisk-logs.<tailnet>.ts.net` | `tailscale-dozzle` |
| umami dashboard | `https://obelisk-stats.<tailnet>.ts.net` | `tailscale-umami` |

One-time, **before the first deploy**: create an auth key in the [Tailscale admin console](https://admin.tailscale.com/admin/settings/keys) — **reusable** (both sidecars register with it) and tagged `tag:obelisk` (create the tag first under Settings → ACL tags) — and put it in `.env.docker` as `TS_AUTHKEY` ([§4](#4-fill-envdocker)). Each sidecar joins the tailnet itself (userspace mode — no Tailscale install, no extra capabilities on the host), shares its target's network namespace, and terminates TLS with a certificate issued by your tailnet's CA.

Verify after the first deploy, from a device in your tailnet:

- `https://obelisk-logs.<tailnet>.ts.net` and `https://obelisk-stats.<tailnet>.ts.net` load (the first visit can take ~10s while the sidecars request their certificates); the exact names come from `docker compose exec tailscale-dozzle tailscale status`)
- from any device **outside** the tailnet, `https://<DOZZLE_DOMAIN>` and `https://<UMAMI_DOMAIN>` still answer `403`

### Granting a teammate access

Access = tailnet membership (network path) + a umami login (app gate for the dashboard):

1. **Invite them to the tailnet** — Admin console → Users → Invite user; they sign in with the Tailscale client on their own machine. The server needs nothing new: the sidecars are already registered.
2. **ACL** — the default tailnet ACL lets every member reach every device, so nothing else is required. If you've tightened the ACL, allow your users to the sidecars' tag on 443:

   ```json
   {
     "action": "accept",
     "src": ["user:teammate@example.com"],
     "dst": ["tag:obelisk:443"]
   }
   ```

   To separate log access from analytics, register each sidecar under its own tag (a second, differently-tagged `TS_AUTHKEY` per service) and allow each tag individually.
3. **umami login** — the tailnet only carries the traffic; the dashboard still needs an account. Create a second user in the umami dashboard (Settings → Users) instead of sharing `admin`. The log viewer needs no app login: tailnet membership is the gate (dozzle runs with container actions/shell disabled).

Rotating `TS_AUTHKEY`: generate a new reusable tagged key, update `.env.docker`, `just env-encrypt`, `just docker-deploy`. Auth keys expire (≤ 90 days) but only matter for **new** registrations — the sidecars keep their identity in the `ts-*-state` volumes, so a lapsed key breaks only a fresh sidecar, not the running ones.

### Umami analytics setup

One-time, after the first deploy:

1. Open `https://obelisk-stats.<tailnet>.ts.net` from a tailnet device and sign in with umami's default credentials (`admin` / `umami`) — **change the password immediately**.
2. Add a **Website** (any name, domain = your `APP_DOMAIN`) and copy its **website ID**.
3. Put the ID in `.env.docker` as `UMAMI_WEBSITE_ID`, then `just env-encrypt` and `just docker-deploy` — the key is baked into the bundle at build.
4. Pageviews show up after the frontend loads (`data-website-id` in the page source confirms the script is active).

The public `UMAMI_DOMAIN` dashboard paths answer `403` to everyone — the dashboard lives on the tailnet instead; only `/script.js` and `/api/send` are public so visitors' browsers can report. Umami's data lives in the `umami-db-data` volume — back it up with `docker compose exec umami-db pg_dump -U umami umami`.

### Rebuild rules

Browser-facing values are **inlined into the JS bundle at build time**, so the image must be rebuilt (not just restarted) whenever they change:

- `NEXT_PUBLIC_API_URL` — inlined into client bundles
- `NEXT_PUBLIC_UMAMI_DOMAIN` / `NEXT_PUBLIC_UMAMI_WEBSITE_ID` — inlined into the tracker `<Script>` (both come from the compose build args, sourced in `.env.docker`)
- `BETTER_AUTH_URL` / `FRONTEND_URL` — baked into the backend runtime-env snapshot (the frontend routes-manifest rewrite follows `API_INTERNAL_URL` / `NEXT_PUBLIC_API_URL`, not these)
- any other `.env.prod` change consumed at build (`packages/env/src/generated/runtime-env.ts` is written by `build:prod`)

`just docker-deploy` always runs `--build`, so it picks up env changes and source changes alike. Canonical key lists: backend server keys `packages/env/env-keys.ts`, client keys `packages/env/src/client.ts`, ETL keys `OBELISK_*` in `apps/python-server/app/core/config.py`, deploy keys [§4](#4-fill-envdocker) above.

### What the build does

- **backend** — `bun run build:prod`: `prisma generate` **plus** `packages/env/scripts/gen-runtime-env.ts`, which bakes the decrypted `.env.prod` values into `packages/env/src/generated/runtime-env.ts` (gitignored) so the process has env vars at runtime. `@obelisk/env/server` reads `process.env.X ?? runtimeEnv.X`, so compose-injected vars (`REDIS_HOST`, `PYTHON_SERVER_URL`) still override the baked file.
- **frontend** — `next build` with prod values inlined; `API_INTERNAL_URL=http://backend:8080` is fixed as a build arg/ENV so server-side fetches and the auth rewrite reach the backend over the compose network.
- **etl** — no build-time env; it decrypts the bind-mounted `.env.prod` itself at startup (`OBELISK_ENV=prod`, `apps/python-server/app/core/env.py`) and fails fast if `.env.keys` is missing.

### Local deployment

`just deploy-local` runs the same eleven services for **machine-local access only** — no public exposure, no router/ufw/CGNAT involvement:

```sh
just deploy-local    # bunx dotenvx run -f .env.docker -- docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

The second `-f` layers [`docker-compose.local.yml`](../docker-compose.local.yml) over the base file (later file wins per key): Caddy's site addresses swap to the `LOCAL_*` values, the frontend build receives the local origins as `ARG`s (public mode passes none, so `just docker-deploy` is unaffected), and backend/etl get them injected at runtime. `*.localhost` is ineligible for public certificates, so Caddy issues from its internal CA automatically — the ACME retry loop never starts. Origins are baked at build, so switching modes rebuilds (same rule as [Rebuild rules](#rebuild-rules)).

Trust the local CA once per machine:

```sh
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-local-root.crt
# import into the OS/browser trust store (Arch: sudo trust anchor --store caddy-local-root.crt; Firefox has its own store — Settings → Certificates), then delete the file
```

Until the root is imported the browser shows a certificate interstitial.

Verify: `https://<LOCAL_APP_DOMAIN>` (frontend), `https://<LOCAL_DOZZLE_DOMAIN>` (log viewer — `403` unless the peer Caddy sees is in `LOCAL_ADMIN_IPS`; the peer appears in `just docker-logs`), `https://<LOCAL_UMAMI_DOMAIN>` (analytics dashboard — same `403` rule; the tracker records locally only when `LOCAL_UMAMI_WEBSITE_ID` is set). Google sign-in needs the local redirect URI registered in the Google console.

Notes:

- `just docker-deploy` (and `just docker-update`, which runs it) switches back to public mode — re-run `just deploy-local` to return.

---

## Day-2 operations

| Task | Command |
| :--- | :--- |
| Update to latest code (pull + rebuild + prune old images) | `just docker-update` |
| Check for pending DB migrations (read-only) | `just db-status` |
| Apply pending DB migrations after an update | `just docker-migrate` |
| List app DB tables (no rows = blank DB, never migrated) | `just db-check` |
| Interactive psql shell on the app Postgres | `just docker-db-shell` |
| Tail all service logs | `just docker-logs` |
| Check a sidecar's tailnet registration | `docker compose exec tailscale-dozzle tailscale status` |
| Restart containers in place (no rebuild) | `just docker-restart` |
| Reload Caddy after editing the `Caddyfile` (no downtime) | `just docker-caddy-reload` |
| Stop the stack (containers/images stay) | `just docker-down` |
| Deploy for machine-local access only (`*.localhost`, no public exposure) | `just deploy-local` |

### Update workflow

```sh
just docker-update       # git pull --ff-only → just docker-deploy → docker image prune -f
just db-status           # read-only: does the release include new Prisma migrations?
just docker-migrate      # apply them (skip when db-status reports none pending)
```

Plain Compose equivalents work too (`docker compose up -d --build`, `docker compose logs -f`, `docker compose down`) — but without the dotenvx wrap Caddy will not start, so prefer the recipes. Managing containers via [lazydocker](https://github.com/jesseduffield/lazydocker) is fine for inspection.

---

## Troubleshooting

- **`APP_DOMAIN not set - deploy via just docker-deploy`** (caddy restart loop) — you started compose without the dotenvx wrap, or `.env.docker` lacks `APP_DOMAIN` (same message for `DOZZLE_DOMAIN` / `UMAMI_DOMAIN`). Run `just docker-deploy`; check `just docker-logs`.
- **`403` on `https://<DOZZLE_DOMAIN>` from your own machine** — expected: the public log-viewer hostname is fail-closed and answers `403` to everyone. Open `https://obelisk-logs.<tailnet>.ts.net` from a device in your tailnet instead.
- **`403` on `https://<UMAMI_DOMAIN>`** — expected for the dashboard paths (only the tracker is public). `curl -I https://<UMAMI_DOMAIN>/script.js` should still answer `200` — if it doesn't, the tracker paths lost their `handle` in the `UMAMI_DOMAIN` block. The dashboard itself is at `https://obelisk-stats.<tailnet>.ts.net`.
- **Tailnet name doesn't resolve / times out** — a sidecar isn't registered or the viewing device isn't in the tailnet. Check `docker compose logs tailscale-dozzle tailscale-umami` (an empty or invalid `TS_AUTHKEY` loops on registration — see [Tailscale admin access](#tailscale-admin-access)), inspect with `docker compose exec tailscale-dozzle tailscale status`, and confirm the viewing device shows up in your tailnet's admin console.
- **No pageviews in umami** — the frontend bundle has no tracker: `UMAMI_WEBSITE_ID` empty in `.env.docker` (or changed without a rebuild — run `just docker-deploy`), or the page source lacks `data-website-id`. The umami dashboard also needs the website's domain to match the origin being visited.
- **No certificate for `https://<DOZZLE_DOMAIN>`** — the DNS record for that name doesn't point at the server yet (each hostname needs its own A record, `umami` included). Cert progress is in `just docker-logs` (caddy).
- **Log viewer loads but streams don't appear** — dozzle streams over SSE; the `flush_interval -1` in the `DOZZLE_DOMAIN` block must stay, otherwise caddy buffers the events.
- **No request lines in the log viewer** — per-request access logs come from caddy (JSON access log from the `log` blocks: `APP_DOMAIN`, plus the `DOZZLE_DOMAIN` / `UMAMI_DOMAIN` sites with tracker paths skipped), `obelisk-frontend` (`[frontend] METHOD path decision` from `proxy.ts` — `next start` itself logs nothing per request in production), and `obelisk-backend` (`[backend] METHOD path status ms` from the Elysia `onRequest`/`onAfterResponse` hooks). Missing caddy lines after a Caddyfile edit = `just docker-caddy-reload` (or redeploy); missing frontend/backend lines = the images predate this change, run `just docker-deploy`.
- **`[DECRYPTION_FAILED]` / dotenvx private-key errors** — the gitignored `.env.keys` is missing from the repo root or does not match the committed `.env.prod` / `.env.docker` public keys. Restore the correct file and redeploy.
- **No TLS certificate / `404` from Caddy** — the domain's A record does not point at this server, or port 80 is blocked (HTTP-01 needs it). Check DNS and the firewall; cert progress is in `just docker-logs` (caddy).
- **Backend restarts with a missing-var error** — all required vars are Zod-validated at startup (`packages/env/src/server.ts`); fill the missing key in `.env.prod` (it must be a complete key set) and redeploy.
- **Queries fail with `P2021` / `The table ... does not exist`** — the schema was never applied: a fresh `db-data` volume, or a release shipped new migrations and `just docker-migrate` wasn't run. The stack still boots, so the error only surfaces on the first request. Confirm with `just db-check` (no rows = blank DB) + `just db-status`, then apply with `just docker-migrate`.
- **Frontend talks to the wrong API origin** — `NEXT_PUBLIC_API_URL` changed without a rebuild; run `just docker-deploy`.
- **Stale container after a config-only change** — `docker compose restart` does not re-read `environment:`; use `just docker-deploy` (recreates) or `just docker-restart` where only the process needs a kick.
- **Disk filling up** — container logs run on Docker's default json-file driver with **no rotation** (the compose file sets no `logging:` limits), so `/var/lib/docker/containers` grows until you prune: `just docker-update` removes old images, and `docker container prune` / `docker system df` show the rest.
