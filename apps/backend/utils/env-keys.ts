/**
 * Canonical backend env var names + types.
 *
 * NOTE: the literal `process.env.X` reads in utils/env.ts mirror this list —
 * keep both in sync (the runtime-env generator derives its output from here,
 * so a var missing here never reaches the Vercel function bundle).
 */
export const BACKEND_ENV_KEYS = [
	"DATABASE_URL",
	"BETTER_AUTH_SECRET",
	"BETTER_AUTH_URL",
	"FRONTEND_URL",
	"PYTHON_SERVER_URL",
	"GOOGLE_CLIENT_ID",
	"GOOGLE_CLIENT_SECRET",
	"ORG_EMAIL_DOMAIN",
	"REDIS_HOST",
	"REDIS_PORT",
	"REDIS_PASSWORD",
] as const;

/** Mirrors the `.optional()` entries in utils/env.ts — may be absent from .env.prod. */
export const OPTIONAL_BACKEND_ENV_KEYS = ["REDIS_PASSWORD"] as const;

export type BackendEnvKey = (typeof BACKEND_ENV_KEYS)[number];

/** Decrypted .env.prod values baked into src/generated/runtime-env.ts at build time. */
export type RuntimeEnv = Partial<Record<BackendEnvKey, string>>;
