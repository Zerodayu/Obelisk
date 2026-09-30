# syntax=docker/dockerfile:1
# NOTE: one root Dockerfile, one stage per service — `docker compose build`
# picks targets, `docker build --target backend .` builds a single image.
# NOTE: .env.prod-only (fill it + `just env-encrypt` first): build gets the
# gitignored .env.keys only as a BuildKit secret so no layer holds a key,
# runtime gets .env.prod + .env.keys bind-mounted read-only and the per-package
# `start:prod` scripts decrypt them with dotenvx.

# --- shared bun workspace (manifests + install, cached across source edits) ---
FROM oven/bun:1.4.2 AS base
WORKDIR /app

# NOTE: manifests + the gen-runtime-env postinstall stub must exist before
# install, so node_modules lands early and survives later source edits
COPY package.json bun.lock ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/env/package.json packages/env/package.json
COPY packages/app-info/package.json packages/app-info/package.json
COPY packages/env/scripts/gen-runtime-env.ts packages/env/scripts/gen-runtime-env.ts
COPY packages/env/env-keys.ts packages/env/env-keys.ts
RUN bun install --frozen-lockfile

# NOTE: .dockerignore keeps node_modules, .next, secrets and the baked
# runtime-env out of the context — no host dev values ship
COPY . .

# --- backend (Elysia, :8080) ------------------------------------------------
FROM base AS backend
# NOTE: build:prod = prisma generate + runtime-env bake under dotenvx over
# .env.prod — hence the keys secret on this RUN
WORKDIR /app/apps/backend
RUN --mount=type=secret,id=envkeys,target=/app/.env.keys bun run build:prod
EXPOSE 8080
# NOTE: start:prod re-runs the same dotenvx over .env.prod
CMD ["bun", "run", "start:prod"]

# --- frontend (Next.js, :3000) ---------------------------------------------
FROM base AS frontend
# NOTE: ARG fixes the baked routes-manifest (server fetches + the /api/v1/auth
# rewrite must reach the backend over the compose network), ENV keeps a runtime
# `next start` on that origin; the browser keeps the baked NEXT_PUBLIC_API_URL
ARG API_INTERNAL_URL=http://backend:8080
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
WORKDIR /app/apps/frontend
# NOTE: same build command as vercel.json's buildCommand
RUN --mount=type=secret,id=envkeys,target=/app/.env.keys bun run build:prod
EXPOSE 3000
CMD ["bun", "run", "start:prod"]

# --- etl (python-server / uv, :8000) ---------------------------------------
# NOTE: decrypted in-process by app/core/env.py from the bind-mounted
# .env.prod + .env.keys (OBELISK_ENV=prod) — neither file is in this image
FROM ghcr.io/astral-sh/uv:python3.13-trixie-slim AS etl

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
  UV_LINK_MODE=copy

COPY apps/python-server/pyproject.toml apps/python-server/uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev
COPY apps/python-server/ . .

ENV PYTHONPATH=/app \
  PATH="/app/.venv/bin:$PATH"

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
