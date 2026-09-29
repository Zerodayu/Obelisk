# syntax=docker/dockerfile:1
# Obelisk — single root Dockerfile, one stage per service:
#   docker compose build                  # all three images (compose picks targets)
#   docker build --target backend .       # a single image
#
# The stack is .env.prod-only — build and run both decrypt the root .env.prod
# (fill it + `just env-encrypt` before building). Env delivery is split:
#   * build time — the encrypted root env files ride in the context (ciphertext,
#     they're committed); the gitignored .env.keys enters only as a BuildKit
#     secret so no layer ever contains a private key.
#   * run time  — compose bind-mounts .env.prod + .env.keys read-only and the
#     per-package `start:prod` scripts decrypt them with dotenvx (cwd stays
#     inside apps/*, so their ../../.env.prod paths resolve to /app unchanged).

# --- shared bun workspace (manifests + install, cached across source edits) ---
FROM oven/bun:1.4.2 AS base
WORKDIR /app

# The package manifests plus the files root `postinstall` (gen-runtime-env
# --stub, now in packages/env) needs must exist before install; node_modules
# then lands before the big COPY for layer reuse.
COPY package.json bun.lock ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/env/package.json packages/env/package.json
COPY packages/app-info/package.json packages/app-info/package.json
COPY packages/env/scripts/gen-runtime-env.ts packages/env/scripts/gen-runtime-env.ts
COPY packages/env/env-keys.ts packages/env/env-keys.ts
RUN bun install --frozen-lockfile

# Full tree on top. .dockerignore keeps node_modules, .next, .env.keys,
# plaintext `**/.env` and src/generated/runtime-env.ts out of the context — the
# postinstall stub therefore survives COPY and no host dev values ship.
COPY . .

# --- backend (Elysia, :8080) ------------------------------------------------
FROM base AS backend
# `build:prod` = prisma generate + runtime-env bake, both under dotenvx over
# the root .env.prod (hence the keys secret on this RUN).
WORKDIR /app/apps/backend
RUN --mount=type=secret,id=envkeys,target=/app/.env.keys bun run build:prod
EXPOSE 8080
# `start:prod` = the same dotenvx over .env.prod at runtime.
CMD ["bun", "run", "start:prod"]

# --- frontend (Next.js, :3000) ---------------------------------------------
FROM base AS frontend
# The browser keeps using the NEXT_PUBLIC_API_URL baked from .env.prod, but
# server-side fetches and the /api/v1/auth rewrite destination are inlined at
# build too and must reach the backend over the compose network instead. ARG
# fixes the baked routes-manifest; ENV keeps a runtime `next start` that
# re-reads next.config.ts on the same internal origin.
ARG API_INTERNAL_URL=http://backend:8080
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
WORKDIR /app/apps/frontend
# frontend's prod build script (same command as vercel.json's buildCommand)
RUN --mount=type=secret,id=envkeys,target=/app/.env.keys bun run build:prod
EXPOSE 3000
CMD ["bun", "run", "start:prod"]

# --- etl (python-server / uv, :8000) ---------------------------------------
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
