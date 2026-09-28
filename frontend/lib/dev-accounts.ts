/**
 * Seeded dev accounts + the shared sign-in helper behind the dev-only
 * session shortcut, so you can run the app as any role without typing a
 * password:
 *
 * - browser: `GET /dev/session?role=<role>` (`app/dev/session/route.ts`)
 * - terminal: `bun run dev-session <role>` (`scripts/dev-session.ts`)
 *
 * The accounts are created by `ROLE_ACCOUNTS` in `backend/prisma/seed.ts`
 * (`<role>@jmcfi.edu.ph` / `password123`) — **keep both sides in sync**.
 *
 * NOTE: this is a *real* better-auth sign-in against the backend, so it only
 * works with `DEVELOPMENT=false` — with dev mode on, `getMe()` short-circuits
 * to `DEV_USER` and the session cookie is ignored.
 *
 * Must stay edge-safe: no `server-only`, no `next/headers`, no filesystem.
 */
import { API_ROOT } from "@/lib/api-client";
import { USER_ROLES, type UserRole } from "@/lib/roles";

/** Password every seeded dev account shares (see `backend/prisma/seed.ts`). */
export const DEV_ACCOUNT_PASSWORD = "password123";

/** Email domain of the seeded accounts. */
export const DEV_ACCOUNT_DOMAIN = "jmcfi.edu.ph";

/** Every role that has a seeded `<role>@jmcfi.edu.ph` account. */
export const DEV_ACCOUNT_ROLES = USER_ROLES;

export function devAccountEmail(role: UserRole): string {
  return `${role}@${DEV_ACCOUNT_DOMAIN}`;
}

/** Is `value` a role with a seeded account? (also guards against bad input) */
export function isDevAccountRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    (DEV_ACCOUNT_ROLES as readonly string[]).includes(value)
  );
}

/** Backend trustedOrigins only allows the frontend origin — see backend `src/index.ts`. */
const DEFAULT_ORIGIN = "http://localhost:3000";

/** Sign-in failure, carrying enough context for a useful message upstream. */
export class DevSignInError extends Error {
  constructor(
    readonly role: UserRole,
    readonly status?: number,
    message?: string,
  ) {
    super(
      message ??
        `Sign-in failed for ${devAccountEmail(role)} (HTTP ${status ?? "no response"}).`,
    );
    this.name = "DevSignInError";
  }
}

export interface DevSignInOptions {
  /** Backend API root; defaults to `API_ROOT` from `lib/api-client.ts`. */
  apiRoot?: string;
  /** Injected fetch (tests); defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /**
   * Cookie header of the incoming browser request, so any live session is
   * signed out instead of left dangling on the backend.
   */
  cookieHeader?: string;
  /** `Origin`/`Referer` forwarded to the backend; defaults to the local frontend. */
  origin?: string;
}

export interface DevSignInResult {
  /**
   * Raw `Set-Cookie` headers, sign-out first and sign-in second. Relay them
   * onto the response **in this order** so the new session wins.
   */
  setCookies: string[];
}

/**
 * Flatten `Set-Cookie` headers into one `Cookie:` request header. Sign-out
 * deletions come first, so keep the **last** value per cookie name — an
 * ambiguous duplicate would make servers read the empty one.
 */
export function cookieHeaderFrom(setCookies: readonly string[]): string {
  const byName = new Map<string, string>();
  for (const header of setCookies) {
    const pair = header.split(";")[0]?.trim();
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    byName.set(pair.slice(0, eq), pair);
  }
  return [...byName.values()].join("; ");
}

/**
 * Sign in as a seeded dev account (best-effort sign-out first) and return the
 * backend's `Set-Cookie` headers for the caller to relay. Throws
 * `DevSignInError` when the account does not exist (DB not seeded) or the
 * backend is unreachable.
 */
export async function signInDevRole(
  role: UserRole,
  options: DevSignInOptions = {},
): Promise<DevSignInResult> {
  const apiRoot = options.apiRoot ?? API_ROOT;
  const fetchImpl = options.fetchImpl ?? fetch;
  const origin = options.origin ?? DEFAULT_ORIGIN;
  const setCookies: string[] = [];

  const headers = (): Record<string, string> => ({
    "Content-Type": "application/json",
    ...(options.cookieHeader ? { Cookie: options.cookieHeader } : {}),
    Origin: origin,
  });

  // NOTE: best effort — a stale session is harmless, the new sign-in overwrites
  // the browser cookie anyway; we just don't want to leak backend sessions.
  try {
    const out = await fetchImpl(`${apiRoot}/auth/sign-out`, {
      method: "POST",
      headers: headers(),
      cache: "no-store",
    });
    setCookies.push(...out.headers.getSetCookie());
  } catch {
    // ignore — sign-out is optional
  }

  const res = await fetchImpl(`${apiRoot}/auth/sign-in/email`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      email: devAccountEmail(role),
      password: DEV_ACCOUNT_PASSWORD,
    }),
    cache: "no-store",
  }).catch((err: unknown) => {
    throw new DevSignInError(
      role,
      undefined,
      `Backend unreachable at ${apiRoot} (${String(err)}). Is it running?`,
    );
  });

  if (!res.ok) {
    // 401/404 here almost always means the account was never seeded.
    throw new DevSignInError(role, res.status);
  }

  setCookies.push(...res.headers.getSetCookie());
  return { setCookies };
}
