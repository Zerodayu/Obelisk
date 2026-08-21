set shell := ["bash", "-uc"]
set fallback := true

# default: list recipes
default:
    @just --list

# --- helpers ---

_bun pkg cmd:
    cd {{pkg}} && bun run {{cmd}}

_uv cmd:
    cd python-server && uv run {{cmd}}

# --- install ---

# install dependencies for all packages
[group('setup')]
install: install-bun install-etl

# install bun packages (backend + frontend)
[group('setup')]
install-bun:
    cd backend && bun install
    cd frontend && bun install

# sync python-server deps + start redis
[group('setup')]
install-etl: redis
    cd python-server && uv sync

# start redis via docker compose (needed by the ETL service)
[group('setup')]
redis:
    cd python-server && docker compose up -d redis

# --- dev ---

# run backend + frontend + etl in parallel with colored log prefixes (Ctrl+C stops all)
[group('dev')]
dev:
    #!/usr/bin/env bash
    set -euo pipefail
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

    # wait until the frontend answers, then open it in the browser (linux/windows/wsl)
    (
        for _ in $(seq 1 30); do
            (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null && { exec 3>&-; break; }
            sleep 1
        done
        open_browser "http://localhost:3000"
    ) &

    # each service runs in its own session (setsid); its PGID == PID recorded in .pid,
    # so cleanup can kill the entire tree (uvicorn workers, next children, etc.)
    setsid bash -c "echo \$\$ > $tmp/backend.pid; cd backend && exec bun run dev" 2>&1 \
        | sed -u "s/^/${C_BACKEND}[backend]${R} /" &
    setsid bash -c "echo \$\$ > $tmp/frontend.pid; cd frontend && exec bun run dev" 2>&1 \
        | sed -u "s/^/${C_FRONTEND}[frontend]${R} /" &
    setsid bash -c "echo \$\$ > $tmp/etl.pid; cd python-server && exec uv run dev" 2>&1 \
        | sed -u "s/^/${C_ETL}[etl]${R} /" &
    wait

# kill any leftover dev processes
[group('dev')]
stop:
    pkill -f 'bun run dev|next-server|next dev|python-server/.venv/bin/dev|uvicorn' || true

# run only the backend (bun watch)
[group('dev')]
dev-backend:
    @just _bun backend dev

# run only the frontend (next dev)
[group('dev')]
dev-frontend:
    @just _bun frontend dev

# run only the python ETL service (uvicorn reload on :8000)
[group('dev')]
dev-etl:
    @just _uv dev

# --- quality ---

# lint backend + frontend (biome)
[group('quality')]
lint:
    cd backend && bunx biome check .
    cd frontend && bun run lint

# typecheck the backend
[group('quality')]
typecheck:
    @just _bun backend typecheck

# format backend + frontend (biome)
[group('quality')]
format:
    cd backend && bunx biome format --write .
    cd frontend && bun run format

# run backend tests (all)
[group('quality')]
test:
    @just _bun backend test

# run backend unit tests
[group('quality')]
test-unit:
    @just _bun backend test:unit

# run backend integration tests
[group('quality')]
test-integration:
    @just _bun backend test:integration

# run all quality checks
[group('quality')]
check: lint typecheck test
