import dotenvx from "@dotenvx/dotenvx";
import { z } from "zod";

// Load the encrypted `.env.local` from disk in the Node runtime only. The
// edge runtime (`proxy.ts`) and the browser cannot access the filesystem —
// they rely on vars injected by `dotenvx run` / Next.js at build time.
if (
  typeof process !== "undefined" &&
  process.env.NEXT_RUNTIME !== "edge" &&
  process.env.NODE_ENV
) {
  dotenvx.config({ path: ".env.local" });
}

const envSchema = z.object({
  DEVELOPMENT: z.string().min(1),
  NEXT_PUBLIC_API_URL: z.string().min(1),
  // DATABASE_URL: z.string().min(1),
  // BETTER_AUTH_SECRET: z.string().min(1),
  // BETTER_AUTH_URL: z.string().min(1),
  // FRONTEND_URL: z.string().min(1),
  // PYTHON_SERVER_URL: z.string().min(1),
});

export const env = envSchema.parse(process.env);
