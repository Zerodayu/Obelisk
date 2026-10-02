import { defineConfig, env } from "prisma/config";

export default defineConfig({
	schema: "prisma/schema",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		// NOTE: CLI ops (migrate/introspect/db push) run on DIRECT_URL — it now
		// holds the same Docker Postgres URL as DATABASE_URL (no pooler to
		// bypass like Neon's); the key stays because the env schema requires it
		url: env("DIRECT_URL"),
	},
});
