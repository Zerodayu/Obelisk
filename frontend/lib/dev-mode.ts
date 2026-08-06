/**
 * DEVELOPMENT mode flag — when true, the frontend disables auth entirely:
 * every route is viewable without an account (see `server/auth.ts`).
 *
 * Note: this module is imported by `proxy.ts` (edge runtime), so it must stay
 * edge-safe — no dotenvx, no `server-only`, no filesystem access. Env values
 * are injected into the process by `dotenvx run` / Next.js env loading.
 */
import { env } from "@/utils/env";

const normalized = env.DEVELOPMENT.trim().toLowerCase();
export const isDevMode =
  normalized === "true" || normalized === "1" || normalized === "yes";
