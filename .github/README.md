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

> **Note:** The project is under active development (backend-first). See [`roadmap.md`](../roadmap.md) for what is built and what is pending, and the [`JMCFI-WIN-OBE Forms Digitization Reference`](JMCFI-WIN-OBE-Forms-Digitization-Reference.md) for the domain model.

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

(`start` covers backend + frontend; the ETL service is separate — `just dev-etl` or Docker Compose.)

All development documentation — prerequisites, environment setup, running the services, quality checks, dev mode, and troubleshooting — lives in [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## License

See [LICENSE](LICENSE).
