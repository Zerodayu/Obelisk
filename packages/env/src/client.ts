import { z } from "zod";

const rawEnv = {
  DEVELOPMENT: process.env.DEVELOPMENT,
  // WARN: opt-in for the dev-only /dev/session route — the justfile dev recipes
  // set it, a hand-run `bun dev` and every production build leave it off.
  DEV_SESSION_ENABLED: process.env.DEV_SESSION_ENABLED,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  // NOTE: optional umami tracker config — NEXT_PUBLIC_UMAMI_DOMAIN is injected
  // as a build ARG (UMAMI_DOMAIN / LOCAL_UMAMI_DOMAIN) and the website key is
  // filled in .env.prod; both unset in dev, so no script renders there.
  NEXT_PUBLIC_UMAMI_DOMAIN: process.env.NEXT_PUBLIC_UMAMI_DOMAIN,
  NEXT_PUBLIC_UMAMI_WEBSITE_ID: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
  // NOTE: server-only in-network backend origin (Docker Compose: http://backend:8080).
  // Not NEXT_PUBLIC, so client bundles compile this to undefined (hence the
  // optional schema below) while the server reads it from the container env.
  API_INTERNAL_URL: process.env.API_INTERNAL_URL,
  // DATABASE_URL: process.env.DATABASE_URL,
  // BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  // BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  // FRONTEND_URL: process.env.FRONTEND_URL,
  // PYTHON_SERVER_URL: process.env.PYTHON_SERVER_URL,
};

const envSchema = z.object({
  DEVELOPMENT: z.string().min(1).optional(),
  DEV_SESSION_ENABLED: z.string().optional(),
  NEXT_PUBLIC_API_URL: z.string().min(1),
  // NOTE: `.optional()` alone, not `.min(1)` — local-mode builds pass a
  // set-but-empty key/ID and UmamiTracker treats "" like absent
  NEXT_PUBLIC_UMAMI_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_UMAMI_WEBSITE_ID: z.string().optional(),
  API_INTERNAL_URL: z.string().optional(),
  // DATABASE_URL: z.string().min(1),
  // BETTER_AUTH_SECRET: z.string().min(1),
  // BETTER_AUTH_URL: z.string().min(1),
  // FRONTEND_URL: z.string().min(1),
  // PYTHON_SERVER_URL: z.string().min(1),
});

export const clientENV = envSchema.parse(rawEnv);
