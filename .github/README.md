# OBELISK

Outcomes-Based Educational Learning and Intelligent System Kit for **Jose Maria College Foundation, Inc. (JMCFI)**.

Obelisk digitizes the JMCFI WIN-OBE assessment **forms** (CLO/PLO attainment, course assessment reports, CQI plans, institutional reviews) with an approval workflow and audit trail. It ingests instructor class-record Excel workbooks, computes per-student Direct CLO attainment and institutional roll-ups, and surfaces results through a web dashboard.

This is a monorepo containing three services:

| Service | Path | Stack | Port |
| :--- | :--- | :--- | :--- |
| Backend API | `apps/backend/` | Bun · Elysia · Prisma + PostgreSQL (Docker `db` service) · better-auth · Zod | `8080` |
| Web frontend | `apps/frontend/` | Next.js 16 · React 19 · Tailwind CSS v4 · shadcn/ui | `3000` |
| ETL & analytics | `apps/python-server/` | FastAPI · Python + uv (pure compute, no DB access) | `8000` |

Each service has its own README and agent guide with deeper details:

- [`apps/backend/README.md`](../apps/backend/README.md) — see also `apps/backend/SYSTEM-DESIGN.md`
- [`apps/frontend/README.md`](../apps/frontend/README.md) — see also `apps/frontend/SYSTEM-DESIGN.md`
- [`apps/python-server/README.md`](../apps/python-server/README.md) — see also `apps/python-server/SYSTEM-DESIGN.md`

---

## Documentation

| Doc | What it covers |
| :--- | :--- |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Development — prerequisites, environment setup, running the services, justfile recipes, quality checks, dev mode, troubleshooting. |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Deployment — self-hosted eleven-service Docker stack behind Caddy (TLS, Dozzle / umami on the tailnet, machine-local mode, updates, migrations). |
| [`VPS_SETUP.md`](VPS_SETUP.md) | VPS setup — packages to install on a fresh server (apt / pacman), firewall + DNS, up to the first `just docker-deploy`. |
| [`CHANGELOG.md`](../CHANGELOG.md) | Release notes — what changed in each version. |
| [`FORKING.md`](FORKING.md) | Forking — starting your own instance for a different institution (fresh keys, env, branding). |
| [`system-docs/`](../system-docs/README.md) | Project docs — roadmap, testing results, domain reference, architecture audits. |

> **Note:** The project is under active development (backend-first). See [`roadmap.md`](../system-docs/roadmap.md) for what is built and what is pending, and the [`JMCFI-WIN-OBE Forms Digitization Reference`](../system-docs/JMCFI-WIN-OBE-Forms-Digitization-Reference.md) for the domain model.

---

## License

See [LICENSE](../LICENSE).
