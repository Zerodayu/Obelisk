# OBELISK

Outcomes-Based Educational Learning and Intelligent System Kit for **Jose Maria College Foundation, Inc. (JMCFI)**.

Obelisk digitizes the JMCFI WIN-OBE assessment **forms** (CLO/PLO attainment, course assessment reports, CQI plans, institutional reviews) with an approval workflow and audit trail. It ingests instructor class-record Excel workbooks, computes per-student Direct CLO attainment and institutional roll-ups, and surfaces results through a web dashboard.

This is a monorepo containing three services:

| Service | Path | Stack | Port |
| :--- | :--- | :--- | :--- |
| Backend API | `backend/` | Bun · Elysia · Prisma + PostgreSQL (Neon) · better-auth · Zod | `8080` |
| Web frontend | `frontend/` | Next.js 16 · React 19 · Tailwind CSS v4 · shadcn/ui | `3000` |
| ETL & analytics | `python-server/` | FastAPI · Python + uv (pure compute, no DB access) | `8000` |

Each service has its own README and agent guide with deeper details:

- [`backend/README.md`](backend/README.md) — see also `backend/SYSTEM-DESIGN.md`
- [`frontend/README.md`](frontend/README.md) — see also `frontend/SYSTEM-DESIGN.md`
- [`python-server/README.md`](python-server/README.md) — see also `python-server/SYSTEM-DESIGN.md`

> **Note:** The project is under active development (backend-first). See [`roadmap.md`](roadmap.md) for what is built and what is pending, and the [`JMCFI-WIN-OBE Forms Digitization Reference`](JMCFI-WIN-OBE-Forms-Digitization-Reference.md) for the domain model.

---

## Development

All development documentation — prerequisites, environment setup, running the services, quality checks, dev mode, and troubleshooting — lives in [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## License

See [LICENSE](LICENSE).
