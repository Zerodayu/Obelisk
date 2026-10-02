set shell := ["bash", "-uc"]
set fallback := true

# default: list recipes
default:
    @just --list

# --- helpers ---

_bun pkg cmd:
    cd {{pkg}} && bun run {{cmd}}

_uv cmd:
    cd apps/python-server && uv run {{cmd}}

# --- install ---

# install dependencies for all packages
[group('setup')]
install: install-bun install-etl db-up

# install bun packages (single root workspace install; postinstall writes the backend runtime-env stub)
[group('setup')]
install-bun:
    bun install

# decrypt the root .env.local + .env.prod + .env.docker for editing (re-encrypt with `just env-encrypt`)
[group('setup')]
env-decrypt:
    bun run env:decrypt

# encrypt the root env files (private keys stay in the gitignored .env.keys)
[group('setup')]
env-encrypt:
    bun run env:encrypt

# sync python-server deps + start redis
[group('setup')]
install-etl: redis
    cd apps/python-server && uv sync

# start redis via docker compose (needed by the ETL service; root compose file)
[group('setup')]
redis:
    docker compose up -d redis

# --- database ---

# start the app Postgres via docker compose (needed by the backend; root compose file, loopback :5432)
[group('setup')]
db-up:
    bunx dotenvx run -f .env.docker -- docker compose up -d db

# apply pending Prisma migrations (DATABASE_URL read from the root .env.local; needs `just db-up` first)
[group('setup')]
db-migrate:
    @just _bun apps/backend db:migrate

# regenerate the Prisma client after a schema change
[group('setup')]
db-generate:
    @just _bun apps/backend db:generate

# seed dev data: one account per role (`<role>@jmcfi.edu.ph` / `password123`), department, program, active term, course, section A, CLO1-7. Wipes previous seed rows first. No demo submissions are seeded — rollup/CQI/PLAN dashboards stay empty until real forms are submitted. Re-run this after `just test`: the test wrapper wipes the whole database before and after every run.
[group('setup')]
db-seed:
    @just _bun apps/backend db:seed

# --- dev ---

# run backend + frontend + etl in parallel with colored log prefixes (Ctrl+C stops all)
[group('dev')]
dev: _dev

# start the full stack and open the browser already signed in as a seeded role account — real session + cookie, so the backend still enforces everything (accounts from `just db-seed`, DEVELOPMENT=false)
[group('dev')]
dev-as role:
    #!/usr/bin/env bash
    set -euo pipefail
    role='{{role}}'
    roles="user faculty program_chair dean aqau vpaa system_admin"
    if [[ " $roles " != *" $role "* ]]; then
        echo "unknown role: $role" >&2
        echo "usage: just dev-as <role>" >&2
        printf '  - %s\n' $roles >&2
        exit 1
    fi
    exec just _dev "$role"

# sign in as a seeded role account and print its session cookie for direct backend calls — also writes apps/frontend/.dev-session/<role>.cookie
[group('dev')]
session role:
    @just _bun apps/frontend "dev-session {{role}}"

# internal: full dev stack. Empty role = plain dev, otherwise probe the seeded
# account and open /dev/session?role=ROLE so the browser starts signed in.
_dev role="":
    #!/usr/bin/env bash
    set -euo pipefail
    role='{{role}}'
    # NOTE: the dev-only /dev/session route answers 404 unless this is set, and
    # next.config.ts refuses a production build while it is on — exporting it
    # here (dotenvx/Next never override an existing var) keeps hand-run dev
    # servers without the route. .env.local untouched.
    export DEV_SESSION_ENABLED=true
    # NOTE: a per-role session is a real login, so the frontend has to run with
    # dev mode off or getMe() returns DEV_USER and ignores the cookie. Exported
    # here (dotenvx/Next never override an existing var) — .env.local untouched.
    if [ -n "$role" ]; then
        export DEVELOPMENT=false
        echo "[dev] DEVELOPMENT=false (real session) — .env.local left unchanged"
    fi
    tmp=$(mktemp -d)
    cleanup() {
        for f in "$tmp"/*.pid; do
            [ -f "$f" ] || continue
            pid=$(cat "$f")
            kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
        done
        wait 2>/dev/null || true
        rm -rf "$tmp"
    }
    trap cleanup EXIT INT TERM HUP

    R=$'\033[0m'
    C_BACKEND=$'\033[1;34m'   # bold blue
    C_FRONTEND=$'\033[1;35m'  # bold magenta
    C_ETL=$'\033[1;33m'       # bold yellow

    open_browser() {
        local url="$1"
        if command -v xdg-open >/dev/null 2>&1; then
            xdg-open "$url" >/dev/null 2>&1 &
        elif command -v powershell.exe >/dev/null 2>&1; then
            powershell.exe -NoProfile -Command "Start-Process '$url'" >/dev/null 2>&1 &
        elif command -v wslview >/dev/null 2>&1; then
            wslview "$url" >/dev/null 2>&1 &
        elif command -v explorer.exe >/dev/null 2>&1; then
            explorer.exe "$url" 2>/dev/null || true
        else
            echo "open manually: $url"
        fi
    }

    base_url="http://localhost:3000"
    session_url="$base_url"
    if [ -n "$role" ]; then
        session_url="$base_url/dev/session?role=$role"
    fi

    # wait until the stack answers, then open it in the browser
    # (linux/windows/wsl); with a role, probe the seeded account first so a
    # missing one is reported here instead of failing in the browser
    (
        for _ in $(seq 1 30); do
            (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null && { exec 3>&-; break; }
            sleep 1
        done

        if [ -n "$role" ]; then
            # backend has to be up too — the probe signs in against it
            for _ in $(seq 1 30); do
                (exec 3<>/dev/tcp/127.0.0.1/8080) 2>/dev/null && { exec 3>&-; break; }
                sleep 1
            done
            if ! (cd apps/frontend && bun run dev-session "$role"); then
                echo "[dev] sign-in probe failed (see above) — missing account? run: just db-seed" >&2
            fi
        fi

        open_browser "$session_url"
    ) &

    # each service runs in its own session (setsid); its PGID == PID recorded in .pid,
    # so cleanup can kill the entire tree (uvicorn workers, next children, etc.)
    setsid bash -c "echo \$\$ > $tmp/backend.pid; cd apps/backend && exec bun run dev" 2>&1 \
        | sed -u "s/^/${C_BACKEND}[backend]${R} /" &
    setsid bash -c "echo \$\$ > $tmp/frontend.pid; cd apps/frontend && exec bun run dev" 2>&1 \
        | sed -u "s/^/${C_FRONTEND}[frontend]${R} /" &
    setsid bash -c "echo \$\$ > $tmp/etl.pid; cd apps/python-server && exec uv run dev" 2>&1 \
        | sed -u "s/^/${C_ETL}[etl]${R} /" &
    wait

# kill any leftover dev processes
[group('dev')]
stop:
    pkill -f 'bun run dev|next-server|next dev|python-server/.venv/bin/dev|uvicorn' || true

# run only the backend (bun watch)
[group('dev')]
dev-backend:
    @just _bun apps/backend dev

# run only the frontend (next dev) — exports DEV_SESSION_ENABLED so the dev-only /dev/session route exists
[group('dev')]
dev-frontend:
    #!/usr/bin/env bash
    set -euo pipefail
    # NOTE: same flag as `_dev` — only justfile-launched dev runs expose the route.
    export DEV_SESSION_ENABLED=true
    exec just _bun apps/frontend dev

# run only the python ETL service (uvicorn reload on :8000)
[group('dev')]
dev-etl:
    @just _uv dev

# --- quality ---

# lint backend + frontend (biome, orchestrated by turbo)
[group('quality')]
lint:
    bun run lint

# typecheck via turbo (backend only — frontend has no typecheck script, see apps/frontend/next.config.ts)
[group('quality')]
typecheck:
    bun run typecheck

# format backend + frontend (biome, orchestrated by turbo)
[group('quality')]
format:
    bun run format

# run backend tests (all)
[group('quality')]
test:
    @just _bun apps/backend test

# run backend unit tests
[group('quality')]
test-unit:
    @just _bun apps/backend test:unit

# run backend integration tests
[group('quality')]
test-integration:
    @just _bun apps/backend test:integration

# run all quality checks
[group('quality')]
check: lint typecheck test

# --- deploy (docker self-hosted stack) ---

# build + (re)start the whole stack in Docker with the root .env.prod (fill it + `just env-encrypt` first) — stop `just dev` first so dev/prod don't mix
# NOTE: the dotenvx wrap injects APP_DOMAIN/DOZZLE_DOMAIN/UMAMI_DOMAIN/ADMIN_IPS/UMAMI_DB_PASSWORD/UMAMI_APP_SECRET from .env.docker for compose interpolation (the file stays encrypted — a bare `docker compose up` starts caddy without them and its guard refuses to boot)
[group('deploy')]
docker-deploy:
    bunx dotenvx run -f .env.docker -- docker compose up -d --build

# deploy for machine-local access only — *.localhost → loopback, Caddy internal CA, no ACME/public exposure (LOCAL_* from .env.docker; `just docker-deploy` switches back to public mode)
# NOTE: second -f layers docker-compose.local.yml over the base file — origins are baked, so this rebuilds like docker-deploy does
[group('deploy')]
deploy-local:
    bunx dotenvx run -f .env.docker -- docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build

# restart the running containers in place — no rebuild, for config/resource tweaks
[group('deploy')]
docker-restart:
    docker compose restart

# update the app: pull latest code, rebuild images, recreate containers, drop the superseded untagged images (run `just docker-migrate` too if the schema changed)
[group('deploy')]
docker-update:
    git pull --ff-only
    just docker-deploy
    docker image prune -f

# apply pending Prisma migrations inside the running backend container (.env.prod — the dev `just db-migrate` reads .env.local)
[group('deploy')]
docker-migrate:
    docker compose exec backend bun run db:migrate-prod

# stop the Docker stack (containers stay around for lazydocker; `docker compose down -v` also drops the uploads volume)
[group('deploy')]
docker-down:
    docker compose down

# follow logs of all services (Ctrl+C detaches, containers keep running)
[group('deploy')]
docker-logs:
    docker compose logs -f

# reload caddy in place after editing the Caddyfile — no rebuild, no downtime
[group('deploy')]
docker-caddy-reload:
    docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
