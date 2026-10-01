import { defineConfig, env } from "prisma/config";

export default defineConfig({
	schema: "prisma/schema",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		// NOTE: CLI ops (migrate/introspect/db push) run on the unpooled direct
		// URL — Neon's pooler rejects migrations; the runtime client keeps the
		// pooled DATABASE_URL via the neon adapter (lib/prisma.ts)
		url: env("DIRECT_URL"),
	},
});
