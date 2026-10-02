# syntax=docker/dockerfile:1
# NOTE: one Dockerfile, one stage per service — `docker compose build` picks targets
# NOTE: .env.prod-only — .env.keys enters as a BuildKit secret, never a layer
# NOTE: runtime bind-mounts .env.prod + .env.keys; start:prod decrypts them

# NOTE: shared bun workspace stage — manifests + install cached across source edits
FROM oven/bun:1.4.2 AS base
WORKDIR /app

# NOTE: manifests + postinstall stub must exist before install
COPY package.json bun.lock ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/env/package.json packages/env/package.json
COPY packages/app-info/package.json packages/app-info/package.json
COPY packages/env/scripts/gen-runtime-env.ts packages/env/scripts/gen-runtime-env.ts
COPY packages/env/env-keys.ts packages/env/env-keys.ts
RUN bun install --frozen-lockfile

# NOTE: .dockerignore drops node_modules, .next and .env.keys; encrypted .env.* stay in context
COPY . .

# NOTE: backend stage (Elysia, :8080)
FROM base AS backend
# NOTE: build:prod = prisma generate + runtime-env bake under dotenvx — hence the keys secret
WORKDIR /app/apps/backend
RUN --mount=type=secret,id=envkeys,target=/app/.env.keys bun run build:prod
EXPOSE 8080
# NOTE: start:prod re-runs the same dotenvx over .env.prod
CMD ["bun", "run", "start:prod"]

# NOTE: frontend stage (Next.js, :3000)
FROM base AS frontend
# NOTE: ARG fixes the baked routes-manifest rewrite; ENV keeps runtime `next start` on it
# NOTE: the browser keeps the baked NEXT_PUBLIC_API_URL
ARG API_INTERNAL_URL=http://backend:8080
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
# NOTE: local mode passes the *.localhost origins; public mode passes nothing → build:prod reads .env.prod
ARG NEXT_PUBLIC_API_URL
ARG BETTER_AUTH_URL
ARG FRONTEND_URL
# NOTE: tracker origin injected per mode; the website key always comes from .env.prod
ARG NEXT_PUBLIC_UMAMI_DOMAIN
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
WORKDIR /app/apps/frontend
# NOTE: same build command as vercel.json's buildCommand
RUN --mount=type=secret,id=envkeys,target=/app/.env.keys bun run build:prod
EXPOSE 3000
CMD ["bun", "run", "start:prod"]

# NOTE: etl stage (python-server / uv, :8000)
# NOTE: decrypted in-process by app/core/env.py from the bind-mounted .env.prod + .env.keys
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
