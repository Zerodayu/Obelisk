# Deployment

Self-hosted deployment of OBELISK on a VPS behind [Caddy](https://caddyserver.com) (automatic HTTPS). For development setup, see [`CONTRIBUTING.md`](CONTRIBUTING.md); for starting your own instance, see [`FORKING.md`](FORKING.md).

---

## Architecture

The root [`docker-compose.yml`](../docker-compose.yml) runs the whole stack from the repo root — nine services, one public entrypoint:

| Service | Container | Exposed | Role |
| :--- | :--- | :--- | :--- |
| **caddy** | `caddy:2-alpine` | **80 / 443 (+443/udp)** | The only public entrypoint — terminates TLS (Let's Encrypt, HTTP-01), routes `/api/*` → backend, everything else → frontend (see [`Caddyfile`](../Caddyfile)); second site blocks serve dozzle on `DOZZLE_DOMAIN` and umami on `UMAMI_DOMAIN` |
| **backend** | `obelisk-backend` | — (in-network) | Elysia API on `:8080`, reached by caddy over the `edge` network |
| **frontend** | `obelisk-frontend` | — (in-network) | Next.js on `:3000`, served by caddy over the `edge` network |
| **etl** | `obelisk-etl` | — (in-network) | Python ETL on `:8000`, reached by the backend over the `internal` network (no auth by design) |
| **redis** | `redis:alpine` | `127.0.0.1:6379` | Cache/bull queue — loopback only (no password), so `just dev` on the same host still reaches it |
| **duckdns** | `lscr.io/linuxserver/duckdns` | — (in-network) | Dynamic-DNS updater — refreshes the A records for `APP_DOMAIN` / `DOZZLE_DOMAIN` / `UMAMI_DOMAIN` to this server's public IP every ~5 min (names + token from `.env.docker`) |
| **dozzle** | `amir20/dozzle:latest` | — (in-network) | Container log viewer at `https://<DOZZLE_DOMAIN>` — caddy answers non-`ADMIN_IPS` clients with 403 before proxying |
| **umami** | `ghcr.io/umami-software/umami:latest` | — (in-network) | Self-hosted analytics at `https://<UMAMI_DOMAIN>` — caddy keeps `/script.js` + `/api/send` reachable for every visitor (the frontend tracker) and answers every other path with 403 unless the client is in `ADMIN_IPS` |
| **umami-db** | `postgres:15-alpine` | — (in-network) | Umami's datastore — reached only by `umami` over `umami-db:5432`, data in the `umami-db-data` volume |

Design notes:

- The stack is **`.env.prod`-only**. The encrypted `.env.prod` and the gitignored `.env.keys` are bind-mounted read-only into every app container and decrypted by dotenvx **inside** the container (the build also receives `.env.keys` as a BuildKit secret — never a layer).
- In-network addresses are injected as `environment:` entries (`REDIS_HOST=redis`, `PYTHON_SERVER_URL=http://etl:8000`); the frontend's server-side fetch/auth rewrite uses the build arg `API_INTERNAL_URL=http://backend:8080`.
- Everything browser-facing (`NEXT_PUBLIC_API_URL`, `BETTER_AUTH_URL`, `FRONTEND_URL`, `NEXT_PUBLIC_UMAMI_*`) is **baked at build time** — see [Rebuild rules](#rebuild-rules).
- Only caddy faces the network. The ETL service has no auth and Redis has no password; they stay in-network / loopback. Dozzle mounts `docker.sock` (root-equivalent) but keeps no published port — it is reachable only through caddy on `DOZZLE_DOMAIN`, gated by the `ADMIN_IPS` allow-list, with container actions/shell disabled. Umami follows the same pattern on `UMAMI_DOMAIN`: dashboard/login/stats API gated by `ADMIN_IPS`, only the tracker endpoints (`/script.js`, `/api/send`) public.
- Persisted volumes: `uploads` (ETL file drops), `caddy-data` + `caddy-config` (TLS certs — they must survive recreates or Let's Encrypt rate limits get burned), `dozzle-data` (dozzle settings), `umami-db-data` (analytics events).

---

## Requirements

On the server:

- A **VPS** (any provider) with Docker — [Docker Engine](https://docs.docker.com/engine/install/) including the **compose plugin** and **Buildx** (`docker compose version` must work)
- [just](https://just.systems/) — recipe runner (`pacman -S just`, `apt install just`, …)
- [dotenvx](https://dotenvx.com/) — used by `just docker-deploy` to inject `.env.docker` into compose
- [Bun](https://bun.sh) — runs the root scripts behind some recipes
- A **domain** (or subdomain) whose **A record points at the server's IP** — Caddy issues the TLS certificate via HTTP-01, so ports **80 and 443** must be reachable (443/udp is optional, HTTP/3 only)
- A **PostgreSQL database** reachable from the server ([Neon](https://neon.tech) or a local Postgres)

On your machine: none of the above is needed to *operate* the stack once it is on the server — everything below runs there.

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

- `DATABASE_URL` / `DIRECT_URL` — the production Postgres connection string
- `BETTER_AUTH_SECRET` — a new long random secret (not the dev one)
- `BETTER_AUTH_URL` / `FRONTEND_URL` — `https://<your-domain>` (caddy terminates TLS, so these are the public HTTPS origin)
- `NEXT_PUBLIC_API_URL` — `https://<your-domain>/api/v1` (**baked at build** — see [Rebuild rules](#rebuild-rules))
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID` — the website key from the umami dashboard (see §4); **leave empty to ship no tracker** — the frontend renders the script only when this and the tracker domain are both set
- `PYTHON_SERVER_URL` — leave as `http://localhost:8000`; the compose file overrides it in-network to `http://etl:8000`
- `REDIS_HOST` / `REDIS_PORT` — leave as `localhost` / `6379`; overridden in-network to `redis`
- `ORG_EMAIL_DOMAIN`, Google OAuth credentials, `OBELISK_*` — production values
- Keep `DEVELOPMENT` and `DEV_SESSION_ENABLED` **unset** — `next.config.ts` refuses to build while `DEV_SESSION_ENABLED=true`

`.env.prod` must contain the **complete key set**: dotenvx never overrides an existing variable, so any key it lacks silently falls back to its `.env.local` value (which does not exist in a container).

### 4. Fill `.env.docker`

Eight keys consumed by the compose file (via the dotenvx wrap in `just docker-deploy`) — four for Caddy, two for the DuckDNS updater, two for umami:

```env
APP_DOMAIN="obelisk.example.com"      # the public site address — Caddy refuses to boot without it
DOZZLE_DOMAIN="dozzle.example.com"    # second hostname for the log viewer — create the matching DNS record first
UMAMI_DOMAIN="umami.example.com"      # analytics hostname — create its DNS record too (also baked into the frontend tracker origin)
ADMIN_IPS="203.0.113.10"              # space-separated IPs for the admin allow-list (guards DOZZLE_DOMAIN + the umami dashboard)
DUCKDNS_SUBDOMAINS="obelisk,dozzle,umami"  # bare names, comma-separated — the updater keeps their A records on this server's IP
DUCKDNS_TOKEN="..."                   # token from the duckdns.org dashboard (subdomains are created there, not here)
UMAMI_DB_PASSWORD="..."               # postgres password for the umami-db container
UMAMI_APP_SECRET="..."                # umami's JWT/session signing secret — openssl rand -base64 32
```

Plus seven `LOCAL_*` keys consumed only by [`docker-compose.local.yml`](../docker-compose.local.yml) (see [Local deployment](#local-deployment)):

```env
LOCAL_APP_DOMAIN="obelisk-jmc.localhost"       # *.localhost resolves to loopback; Caddy signs it with its internal CA (no ACME)
LOCAL_DOZZLE_DOMAIN="dozzle-jmc.localhost"
LOCAL_UMAMI_DOMAIN="umami-jmc.localhost"
LOCAL_ADMIN_IPS="127.0.0.1 ::1 192.168.1.14 172.16.0.0/12"
LOCAL_FRONTEND_URL="https://obelisk-jmc.localhost"
LOCAL_API_URL="https://obelisk-jmc.localhost/api/v1"
LOCAL_UMAMI_WEBSITE_ID=""                     # website key of the LOCAL umami instance — empty = no tracker in local builds
```

> ⚠️ `ADMIN_IPS` must be the address **Caddy sees on the connection** — your public egress IP (`curl ifconfig.me`), not a LAN IP. Caddy matches the TCP peer, so a private `192.168.x.x` entry only works if you reach the server from that LAN/VPN. Wrong value = `403` on the log viewer.

### 5. Re-encrypt

```sh
just env-encrypt    # re-encrypt all three env files; .env.keys stays gitignored
```

### 6. Apply the database schema

```sh
just docker-deploy                        # first build + start (see below), then:
just docker-migrate                       # prisma migrate deploy, inside the backend container
```

Or apply migrations from your machine against the prod database with `cd apps/backend && bun run db:migrate-prod`.

> ⚠️ **Do not run `db:seed` against production.** The seed wipes and recreates accounts/reference data and has no production guard yet (tracked in [`system-docs/testing_results.md`](../system-docs/testing_results.md) §1.3).

---

## Deploying

From the repo root **on the server**:

```sh
just docker-deploy
```

That runs `bunx dotenvx run -f .env.docker -- docker compose up -d --build` — it builds the three images (root multi-stage [`Dockerfile`](../Dockerfile), targets `backend` / `frontend` / `etl`) and starts all nine services with `.env.prod` values. `APP_DOMAIN` / `DOZZLE_DOMAIN` / `UMAMI_DOMAIN` / `ADMIN_IPS` / `DUCKDNS_SUBDOMAINS` / `DUCKDNS_TOKEN` / `UMAMI_DB_PASSWORD` / `UMAMI_APP_SECRET` are injected for compose interpolation; **a bare `docker compose up` skips the wrap** and Caddy's guard exits with `APP_DOMAIN not set - deploy via just docker-deploy`.

Verify: `https://<APP_DOMAIN>` (frontend), `https://<APP_DOMAIN>/api/v1` (backend), `https://<DOZZLE_DOMAIN>` (log viewer — 403 unless the request comes from an `ADMIN_IPS` address), `https://<UMAMI_DOMAIN>` (dashboard — 403 unless admin; `curl -I https://<UMAMI_DOMAIN>/script.js` answers 200 from anywhere). Logs: `just docker-logs`.

> Stop `just dev` first — the dev stack and the Docker stack bind the same host ports (Redis aside, which is shared via loopback).

### Umami analytics setup

One-time, after the first deploy:

1. Open `https://<UMAMI_DOMAIN>` from an `ADMIN_IPS` address and sign in with umami's default credentials (`admin` / `umami`) — **change the password immediately**.
2. Add a **Website** (any name, domain = your `APP_DOMAIN`) and copy its **website ID**.
3. Put the ID in `.env.prod` as `NEXT_PUBLIC_UMAMI_WEBSITE_ID`, then `just env-encrypt` and `just docker-deploy` — the key is baked into the client bundle at build.
4. Pageviews show up after the frontend loads (`data-website-id` in the page source confirms the script is active).

The dashboard answers `403` to everyone outside `ADMIN_IPS`; only `/script.js` and `/api/send` are public so visitors' browsers can report. Umami's data lives in the `umami-db-data` volume — back it up with `docker compose exec umami-db pg_dump -U umami umami`.

### Rebuild rules

Browser-facing values are **inlined into the JS bundle at build time**, so the image must be rebuilt (not just restarted) whenever they change:

- `NEXT_PUBLIC_API_URL` — inlined into client bundles
- `NEXT_PUBLIC_UMAMI_DOMAIN` / `NEXT_PUBLIC_UMAMI_WEBSITE_ID` — inlined into the tracker `<Script>` (domain comes from the compose build arg, the key from `.env.prod`)
- `BETTER_AUTH_URL` / `FRONTEND_URL` — baked into the runtime-env snapshot and routes manifest
- any other `.env.prod` change consumed at build (`packages/env/src/generated/runtime-env.ts` is written by `build:prod`)

`just docker-deploy` always runs `--build`, so it picks up env changes and source changes alike. The canonical env key list is `packages/env/env-keys.ts`.

### What the build does

- **backend** — `bun run build:prod`: `prisma generate` **plus** `packages/env/scripts/gen-runtime-env.ts`, which bakes the decrypted `.env.prod` values into `packages/env/src/generated/runtime-env.ts` (gitignored) so the process has env vars at runtime. `@obelisk/env/server` reads `process.env.X ?? runtimeEnv.X`, so compose-injected vars (`REDIS_HOST`, `PYTHON_SERVER_URL`) still override the baked file.
- **frontend** — `next build` with prod values inlined; `API_INTERNAL_URL=http://backend:8080` is fixed as a build arg/ENV so server-side fetches and the auth rewrite reach the backend over the compose network.
- **etl** — no build-time env; it decrypts the bind-mounted `.env.prod` itself at startup (`OBELISK_ENV=prod`, `apps/python-server/app/core/env.py`) and fails fast if `.env.keys` is missing.

### Local deployment

`just deploy-local` runs the same nine services for **machine-local access only** — no public exposure, no router/ufw/CGNAT involvement:

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
- The `duckdns` updater keeps running and keeps the **public** records on the real IP — unrelated to the local names, and ready for when the network is reachable.

---

## Day-2 operations

| Task | Command |
| :--- | :--- |
| Update to latest code (pull + rebuild + prune old images) | `just docker-update` |
| Apply pending DB migrations after an update | `just docker-migrate` |
| Tail all service logs | `just docker-logs` |
| Restart containers in place (no rebuild) | `just docker-restart` |
| Reload Caddy after editing the `Caddyfile` (no downtime) | `just docker-caddy-reload` |
| Stop the stack (containers/images stay) | `just docker-down` |
| Deploy for machine-local access only (`*.localhost`, no public exposure) | `just deploy-local` |

### Update workflow

```sh
just docker-update       # git pull --ff-only → just docker-deploy → docker image prune -f
just docker-migrate      # only when the release includes new Prisma migrations
```

Plain Compose equivalents work too (`docker compose up -d --build`, `docker compose logs -f`, `docker compose down`) — but without the dotenvx wrap Caddy will not start, so prefer the recipes. Managing containers via [lazydocker](https://github.com/jesseduffield/lazydocker) is fine for inspection.

---

## Troubleshooting

- **`APP_DOMAIN not set - deploy via just docker-deploy`** (caddy restart loop) — you started compose without the dotenvx wrap, or `.env.docker` lacks `APP_DOMAIN` (same message for `DOZZLE_DOMAIN` / `UMAMI_DOMAIN` / `ADMIN_IPS`). Run `just docker-deploy`; check `just docker-logs`.
- **`403` on `https://<DOZZLE_DOMAIN>` from your own machine** — the request's source IP is not in `ADMIN_IPS`. Caddy matches the TCP peer (public egress IP), so compare `curl ifconfig.me` with the value in `.env.docker`, update it, re-encrypt and redeploy.
- **`403` on `https://<UMAMI_DOMAIN>`** — same allow-list as dozzle: your IP is not in `ADMIN_IPS` (this is intended for non-admins). `curl -I https://<UMAMI_DOMAIN>/script.js` should still answer `200` — if it doesn't, the tracker paths lost their `handle` in the `UMAMI_DOMAIN` block.
- **No pageviews in umami** — the frontend bundle has no tracker: `NEXT_PUBLIC_UMAMI_WEBSITE_ID` empty in `.env.prod` (or changed without a rebuild — run `just docker-deploy`), or the page source lacks `data-website-id`. The umami dashboard also needs the website's domain to match the origin being visited.
- **No certificate for `https://<DOZZLE_DOMAIN>`** — the DNS record for that name doesn't point at the server yet (DuckDNS has no wildcards: each name needs its own entry, including `umami`). Cert progress is in `just docker-logs` (caddy).
- **`KO` from `obelisk-duckdns` in `just docker-logs`** — DuckDNS rejected the update: wrong `DUCKDNS_TOKEN`, a name in `DUCKDNS_SUBDOMAINS` that was never created on the duckdns.org dashboard (bare names, no `.duckdns.org` suffix), or empty keys (a bare `docker compose up` skips the dotenvx wrap — no guard on purpose, the stack runs but the records stop following your IP). Fix `.env.docker`, `just env-encrypt`, redeploy.
- **Log viewer loads but streams don't appear** — dozzle streams over SSE; the `flush_interval -1` in the `DOZZLE_DOMAIN` block must stay, otherwise caddy buffers the events.
- **`[DECRYPTION_FAILED]` / dotenvx private-key errors** — the gitignored `.env.keys` is missing from the repo root or does not match the committed `.env.prod` / `.env.docker` public keys. Restore the correct file and redeploy.
- **No TLS certificate / `404` from Caddy** — the domain's A record does not point at this server, or port 80 is blocked (HTTP-01 needs it). Check DNS and the firewall; cert progress is in `just docker-logs` (caddy).
- **Backend restarts with a missing-var error** — all required vars are Zod-validated at startup (`packages/env/src/server.ts`); fill the missing key in `.env.prod` (it must be a complete key set) and redeploy.
- **Frontend talks to the wrong API origin** — `NEXT_PUBLIC_API_URL` changed without a rebuild; run `just docker-deploy`.
- **Stale container after a config-only change** — `docker compose restart` does not re-read `environment:`; use `just docker-deploy` (recreates) or `just docker-restart` where only the process needs a kick.
- **Disk filling up** — logs are capped by rotation (`json-file`, 10 MB × 3 per container); old images are pruned by `just docker-update`. Also see `docker system df`.
