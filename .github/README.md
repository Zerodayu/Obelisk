# OBELISK

Outcomes-Based Educational Learning and Intelligent System Kit for **Jose Maria College Foundation, Inc. (JMCFI)**.

Obelisk digitizes the JMCFI WIN-OBE assessment **forms** (CLO/PLO attainment, course assessment reports, CQI plans, institutional reviews) with an approval workflow and audit trail. It ingests instructor class-record Excel workbooks, computes per-student Direct CLO attainment and institutional roll-ups, and surfaces results through a web dashboard.

This is a monorepo containing three services:

| Service | Path | Stack | Port |
| :--- | :--- | :--- | :--- |
| Backend API | `apps/backend/` | Bun · Elysia · Prisma + PostgreSQL (Neon) · better-auth · Zod | `8080` |
| Web frontend | `apps/frontend/` | Next.js 16 · React 19 · Tailwind CSS v4 · shadcn/ui | `3000` |
| ETL & analytics | `apps/python-server/` | FastAPI · Python + uv (pure compute, no DB access) | `8000` |

Each service has its own README and agent guide with deeper details:

- [`apps/backend/README.md`](../apps/backend/README.md) — see also `apps/backend/SYSTEM-DESIGN.md`
- [`apps/frontend/README.md`](../apps/frontend/README.md) — see also `apps/frontend/SYSTEM-DESIGN.md`
- [`apps/python-server/README.md`](../apps/python-server/README.md) — see also `apps/python-server/SYSTEM-DESIGN.md`

> **Note:** The project is under active development (backend-first). See [`roadmap.md`](../system-docs/roadmap.md) for what is built and what is pending, and the [`JMCFI-WIN-OBE Forms Digitization Reference`](../system-docs/JMCFI-WIN-OBE-Forms-Digitization-Reference.md) for the domain model. All four system docs live in [`system-docs/`](../system-docs/README.md).

---

## Development

Quickstart — running locally:

```sh
bun install         # one root install for the whole workspace
just env-decrypt    # once — decrypt the committed root .env.local / .env.prod
just dev            # dev stack: backend :8080, frontend :3000, ETL :8000
```

Running the production servers locally:

```sh
just start          # turbo-cached build + serve with .env.local
just start-prod     # same, with .env.prod — fill the root .env.prod first (CONTRIBUTING §2)
```

Running everything in Docker (backend + frontend + ETL + Redis) — the stack is `.env.prod`-only (fill the root `.env.prod` first, CONTRIBUTING §2):

```sh
just docker-up            # build + start the whole stack (root Dockerfile + docker-compose.yml)
```

`just` is optional — the same thing with plain Docker Compose (repo root; the committed encrypted `.env.prod` + gitignored `.env.keys` must be present):

```sh
docker compose up -d --build       # build + start the stack
docker compose logs -f             # tail all service logs
docker compose down                # stop the stack
```

(`start` covers backend + frontend with the ETL separate (`just dev-etl`); the Docker stack covers all four services — manage containers with lazydocker or `just docker-logs`.)

All development documentation — prerequisites, environment setup, running the services, quality checks, dev mode, and troubleshooting — lives in [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## License

See [LICENSE](LICENSE).
