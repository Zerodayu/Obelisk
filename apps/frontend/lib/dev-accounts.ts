/**
 * Seeded dev accounts + the shared sign-in helper behind the dev-only
 * session shortcut, so you can run the app as any role without typing a
 * password:
 *
 * - browser: `GET /dev/session?role=<id>` (`app/dev/session/route.ts`)
 * - terminal: `bun run dev-session <id>` (`scripts/dev-session.ts`)
 *
 * The accounts are created by `ROLE_ACCOUNTS` in `backend/prisma/seed.ts`
 * (`<id>@jmcfi.edu.ph` / `password123`) — **keep both sides in sync**. Every
 * role has a base account (`<role>`); the data-bearing roles also have a
 * second one (`<role>1` — e.g. `faculty1`) so one role can be signed in as
 * two different users and you can see which data is shared between them.
 *
 * NOTE: this is a *real* better-auth sign-in against the backend, so it only
 * works with `DEVELOPMENT=false` — with dev mode on, `getMe()` short-circuits
 * to `DEV_USER` and the session cookie is ignored.
 *
 * Must stay edge-safe: no `server-only`, no `next/headers`, no filesystem.
 */
import { API_ROOT } from "@/lib/api-client";
import type { UserRole } from "@/lib/roles";

/** Password every seeded dev account shares (see `backend/prisma/seed.ts`). */
export const DEV_ACCOUNT_PASSWORD = "password123";

/** Email domain of the seeded accounts. */
export const DEV_ACCOUNT_DOMAIN = "jmcfi.edu.ph";

/** A seeded dev account: `id` is the email local part + the `dev-as` argument. */
export interface DevAccount {
  id: string;
  role: UserRole;
}

/**
 * Every seeded account, mirroring `ROLE_ACCOUNTS` in
 * `backend/prisma/seed.ts` (keep in sync). A literal list rather than a
 * derivation so a missing seed row is a visible edit on both sides.
 */
export const DEV_ACCOUNTS = [
  // NOTE: "user" is the onboarding role — these accounts land on /onboarding.
  { id: "user", role: "user" },
  { id: "faculty", role: "faculty" },
  { id: "faculty1", role: "faculty" },
  { id: "program_chair", role: "program_chair" },
  { id: "program_chair1", role: "program_chair" },
  { id: "dean", role: "dean" },
  { id: "dean1", role: "dean" },
  { id: "aqau", role: "aqau" },
  { id: "aqau1", role: "aqau" },
  { id: "vpaa", role: "vpaa" },
  { id: "vpaa1", role: "vpaa" },
  { id: "system_admin", role: "system_admin" },
] as const satisfies readonly DevAccount[];

/** The email local part (and `dev-as` argument) of every seeded account. */
export type DevAccountId = (typeof DEV_ACCOUNTS)[number]["id"];

/** Every seeded account id — for usage/error messages. */
export const DEV_ACCOUNT_IDS: readonly DevAccountId[] = DEV_ACCOUNTS.map(
  (account) => account.id,
);

export function devAccountEmail(account: DevAccountId): string {
  return `${account}@${DEV_ACCOUNT_DOMAIN}`;
}

/** The role a seeded account signs in with (undefined = unknown account). */
export function devAccountRole(account: DevAccountId): UserRole | undefined {
  return DEV_ACCOUNTS.find((entry) => entry.id === account)?.role;
}

/** Is `value` a seeded account id? (also guards against bad input) */
export function isDevAccount(value: unknown): value is DevAccountId {
  return (
    typeof value === "string" &&
    (DEV_ACCOUNT_IDS as readonly string[]).includes(value)
  );
}

/** `127.0.0.0/8` in dotted-quad form (rejects look-alikes such as `127.evil.com`). */
const LOOPBACK_IPV4 = /^127(?:\.\d{1,3}){3}$/;

/**
 * Does `hostname` point at this machine? Route handlers never see the client
 * IP, so this is what stands between a dev-only shortcut and the network.
 * Normalises what real clients send: brackets (`[::1]`), an IPv4-mapped prefix
 * (`::ffff:127.0.0.1` from a local proxy) and mixed case.
 */
export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/^::ffff:/, "");
  return host === "localhost" || host === "::1" || LOOPBACK_IPV4.test(host);
}

/** Backend trustedOrigins only allows the frontend origin — see backend `src/index.ts`. */
const DEFAULT_ORIGIN = "http://localhost:3000";

/** Sign-in failure, carrying enough context for a useful message upstream. */
export class DevSignInError extends Error {
  constructor(
    readonly account: DevAccountId,
    readonly status?: number,
    message?: string,
  ) {
    super(
      message ??
        `Sign-in failed for ${devAccountEmail(account)} (HTTP ${status ?? "no response"}).`,
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
 *
 * NOTE: parallel arrays rather than a `Map` — the old iterator spread only
 * typechecked at `target >= ES2015`, which broke editors that check this file
 * against a looser config.
 */
export function cookieHeaderFrom(setCookies: readonly string[]): string {
  const names: string[] = [];
  const pairs: string[] = [];
  for (const header of setCookies) {
    const pair = header.split(";")[0]?.trim();
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq);
    const at = names.indexOf(name);
    // NOTE: keep the first position, take the last value — same as `Map.set`.
    if (at === -1) {
      names.push(name);
      pairs.push(pair);
    } else {
      pairs[at] = pair;
    }
  }
  return pairs.join("; ");
}

/**
 * Sign in as a seeded dev account (best-effort sign-out first) and return the
 * backend's `Set-Cookie` headers for the caller to relay. Throws
 * `DevSignInError` when the account does not exist (DB not seeded) or the
 * backend is unreachable.
 */
export async function signInDevAccount(
  account: DevAccountId,
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
      email: devAccountEmail(account),
      password: DEV_ACCOUNT_PASSWORD,
    }),
    cache: "no-store",
  }).catch((err: unknown) => {
    throw new DevSignInError(
      account,
      undefined,
      `Backend unreachable at ${apiRoot} (${String(err)}). Is it running?`,
    );
  });

  if (!res.ok) {
    // 401/404 here almost always means the account was never seeded.
    throw new DevSignInError(account, res.status);
  }

  setCookies.push(...res.headers.getSetCookie());
  return { setCookies };
}
