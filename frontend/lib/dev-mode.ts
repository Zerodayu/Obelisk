/**
 * DEVELOPMENT mode flag — when true, the frontend disables auth entirely:
 * every route is viewable without an account (see `server/auth.ts`).
 *
 * Note: this module is imported by `proxy.ts` (edge runtime), so it must stay
 * edge-safe — no dotenvx, no `server-only`, no filesystem access. Env values
 * are injected into the process by `dotenvx run` / Next.js env loading.
 */
import { env } from "@/utils/env";

const raw = env.DEVELOPMENT?.trim().toLowerCase();
export const isDevMode = raw === "true" || raw === "1" || raw === "yes";

/**
 * When true (default), the simulated dev role (`DEV_ROLE` in
 * `server/api-client.ts`) enforces route access exactly like production —
 * e.g. a `faculty` dev user gets redirected from `/archives` to `/dashboard`.
 * Set to `false` to keep the old behavior: every route reachable while nav and
 * dashboards still reflect the simulated role.
 *
 * Must stay edge-safe (plain boolean) — `proxy.ts` imports this module.
 */
export const DEV_ENFORCE_ROLE_ACCESS = true;
