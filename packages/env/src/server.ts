import { z } from "zod";

// NOTE: build-time `.env.prod` snapshot (gitignored) — process.env wins per key,
// so platform-provided vars still override the baked-in file. Written by
// scripts/gen-runtime-env.ts (stub by the root postinstall).
import runtimeEnv from "./generated/runtime-env";

const rawEnv = {
  DATABASE_URL: process.env.DATABASE_URL ?? runtimeEnv.DATABASE_URL,
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ?? runtimeEnv.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? runtimeEnv.BETTER_AUTH_URL,
  FRONTEND_URL: process.env.FRONTEND_URL ?? runtimeEnv.FRONTEND_URL,
  PYTHON_SERVER_URL:
    process.env.PYTHON_SERVER_URL ?? runtimeEnv.PYTHON_SERVER_URL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? runtimeEnv.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET:
    process.env.GOOGLE_CLIENT_SECRET ?? runtimeEnv.GOOGLE_CLIENT_SECRET,
  ORG_EMAIL_DOMAIN: process.env.ORG_EMAIL_DOMAIN ?? runtimeEnv.ORG_EMAIL_DOMAIN,
  REDIS_HOST: process.env.REDIS_HOST ?? runtimeEnv.REDIS_HOST,
  REDIS_PORT: process.env.REDIS_PORT ?? runtimeEnv.REDIS_PORT,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD ?? runtimeEnv.REDIS_PASSWORD,
};

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().min(1),
  FRONTEND_URL: z.string().min(1),
  PYTHON_SERVER_URL: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  ORG_EMAIL_DOMAIN: z.string().min(1),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.string().min(1),
  // NOTE: optional — the prod Redis (docker host) may run without auth while
  // exposed; see lib/redis.ts
  REDIS_PASSWORD: z.string().optional(),
});

export const serverENV = envSchema.parse(rawEnv);
