# File Structure

Routes follow a feature-module pattern (see <https://github.com/Zerodayu/bun-elysia-app>):

```
src/
├── index.ts              # Elysia app entry point
├── routes.ts             # Aggregates all feature route plugins
├── auth/                 # Auth (better-auth config, session guard macro)
└── {feature}/
    ├── controller.ts     # Route definitions (Elysia plugin with prefix + tags)
    ├── service.ts        # Business logic (class with methods)
    └── model.ts          # Validation schemas using Elysia's t + Static types
```

## Conventions

- **controller.ts**: Define routes as an Elysia plugin with `prefix` and `tags`. Mount auth guard via `.use(authPlugin)`, then guard individual routes with `{ auth: true }`. Use `detail` for OpenAPI descriptions.
- **service.ts**: Class-based business logic. One class per feature. Throws on errors; controller handles status codes.
- **model.ts**: Validation schemas using Elysia's `t` from `elysia`. Export both schema objects and `Static<typeof ...>` types.
- **routes.ts**: Import and chain feature plugins: `.use(featureRoutes)`. The `api/v1/` prefix is set here, so feature routes use relative paths.
- **env vars**: Always import `env` from `@env` instead of accessing `process.env` directly. The `env.ts` file uses zod validation, so missing vars fail at startup with a clear error.

## System Design Documentation

When adding a new feature (new endpoints, database tables, service methods, or auth changes) or modifying existing ones, update `SYSTEM-DESIGN.md` to reflect the changes. Keep the following sections in sync:

- **API Endpoints** — add/modify route table entries
- **Database Schema** — add/modify table definitions and ERD
- **Roles Table / Authorization Matrix** — update if role checks change
- **Service Layer** — document new/updated service methods
- **System Architecture / Request Flow** — update if middleware or request pipeline changes
