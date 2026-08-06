/**
 * Server-side API helpers for Server Components / layouts / Server Actions.
 *
 * These forward the request's cookies to the backend so better-auth sessions
 * resolve from the server-to-server request. Only import from Server
 * Components or Server Actions (`"server-only"` enforces that).
 *
 * `serverApi` is for reads (Server Components). `actionApi` is for mutations
 * (Server Actions): it relays the backend's `Set-Cookie` headers back to the
 * browser so better-auth cookies land on the frontend origin — matching the
 * session-cookie check in `proxy.ts` and the cookie forwarding in reads.
 */

import "server-only";

import { cookies, headers } from "next/headers";

import {
  API_ROOT,
  ApiError,
  type ApiSession,
  type ApiUser,
  type MeResponse,
} from "@/lib/api-client";
import { isDevMode } from "@/lib/dev-mode";
import type { UserRole } from "@/lib/roles";

/**
 * Role the dev user simulates when DEVELOPMENT=true. Change this to preview
 * what each role sees (nav, dashboards, route gates). `DEV_ENFORCE_ROLE_ACCESS`
 * in `lib/dev-mode.ts` decides whether route access is enforced like prod.
 *
 * Valid values (from `USER_ROLES` in `lib/roles.ts`):
 * "user" | "faculty" | "program_chair" | "dean" | "aqau" | "vpaa" | "system_admin"
 *
 * `satisfies UserRole` errors at compile time if a wrong role is typed here.
 */
export const DEV_ROLE = "faculty" satisfies UserRole;

/** Fixed session presented when DEVELOPMENT=true (auth disabled, frontend-only). */
export const DEV_USER: ApiUser = {
  id: "dev-user",
  name: "Development User",
  email: "dev@obelisk.local",
  emailVerified: true,
  image: null,
  role: DEV_ROLE,
  requestedRole: null,
  roleRequestStatus: "none",
  employeeId: null,
  programId: null,
  departmentId: null,
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
};

const DEV_SESSION: ApiSession = {
  id: "dev-session",
  userId: DEV_USER.id,
  expiresAt: new Date("2099-01-01T00:00:00.000Z").toISOString(),
  createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  ipAddress: null,
  userAgent: null,
};

/**
 * Relay the incoming request's `Origin` (falling back to `Referer`) to the
 * backend. better-auth validates the `Origin` header on cookie-carrying POSTs
 * (CSRF protection); without it the backend rejects with "Missing or null
 * Origin".
 */
async function forwardedOrigin(): Promise<string | undefined> {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("origin") ?? requestHeaders.get("referer") ?? undefined
  );
}

async function serverFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  const origin = await forwardedOrigin();

  const res = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Server request failed (${res.status}) for ${path}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

interface RelayCookie {
  name: string;
  value: string;
  options: {
    path?: string;
    maxAge?: number;
    expires?: Date;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "lax" | "strict" | "none";
  };
}

/**
 * Reverse the URL-encoding the backend applies to cookie values (better-auth
 * signs+encodes before writing `Set-Cookie`). The relay must hand Next.js the
 * decoded value so its own re-encoding restores the backend's original form;
 * otherwise the browser stores a double-encoded value the backend can't parse.
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Parse a raw `Set-Cookie` header into name/value + the options `cookies()` accepts. */
function parseSetCookie(header: string): RelayCookie | null {
  const parts = header.split(";");
  const [nameValue = "", ...rest] = parts;
  const eq = nameValue.indexOf("=");
  if (eq <= 0) return null;
  const name = nameValue.slice(0, eq).trim();
  const value = safeDecode(nameValue.slice(eq + 1).trim());
  const options: RelayCookie["options"] = {};

  for (const part of rest) {
    const [rawKey, ...rawValueParts] = part.split("=");
    const key = rawKey.trim().toLowerCase();
    const rawValue = rawValueParts.join("=").trim();
    switch (key) {
      case "path":
        options.path = rawValue || "/";
        break;
      case "max-age": {
        const maxAge = Number(rawValue);
        if (Number.isFinite(maxAge)) options.maxAge = maxAge;
        break;
      }
      case "expires": {
        const expires = new Date(rawValue);
        if (!Number.isNaN(expires.getTime())) options.expires = expires;
        break;
      }
      case "secure":
        options.secure = true;
        break;
      case "httponly":
        options.httpOnly = true;
        break;
      case "samesite": {
        const sameSite = rawValue.toLowerCase();
        if (
          sameSite === "lax" ||
          sameSite === "strict" ||
          sameSite === "none"
        ) {
          options.sameSite = sameSite;
        }
        break;
      }
    }
  }

  return { name, value, options };
}

/**
 * Relay the backend response's `Set-Cookie` headers onto the outgoing browser
 * response. Server Actions must call this so better-auth session cookies are
 * stored on the frontend origin instead of being swallowed by the
 * server-to-server fetch.
 */
async function forwardSetCookies(res: Response): Promise<void> {
  const store = await cookies();
  for (const header of res.headers.getSetCookie()) {
    const cookie = parseSetCookie(header);
    if (!cookie) continue;
    store.set(cookie.name, cookie.value, cookie.options);
  }
}

async function actionFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  const origin = await forwardedOrigin();

  const res = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  await forwardSetCookies(res);

  if (!res.ok) {
    let payload: { error?: string; message?: string } | undefined;
    try {
      payload = (await res.json()) as { error?: string; message?: string };
    } catch {
      payload = undefined;
    }
    throw new ApiError(
      payload?.message ?? payload?.error ?? `Request failed (${res.status})`,
      { status: res.status, payload },
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Server Action variant of `serverApi`. Use from `server/actions/*` for
 * mutations that must set/clear cookies (sign-in, sign-out) or that carry the
 * browser session forward. Unlike `serverFetch`, failures throw `ApiError`
 * (with the backend's message) so actions can surface them to the UI.
 */
export const actionApi = {
  post: <T>(path: string, body?: unknown) =>
    actionFetch<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};

/**
 * Resolve the current user + session on the server. Returns `null` when the
 * request is unauthenticated (rather than throwing) so layouts can redirect.
 */
export async function getMe(): Promise<MeResponse | null> {
  if (isDevMode) return { user: DEV_USER, session: DEV_SESSION };
  try {
    return await serverFetch<MeResponse>("/auth/me");
  } catch {
    return null;
  }
}

export const serverApi = {
  get: <T>(
    path: string,
    query?: Record<string, string | number | boolean | null | undefined>,
  ) => {
    const url = new URL(`${API_ROOT}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return serverFetch<T>(url.pathname + url.search);
  },
  post: <T>(path: string, body?: unknown) =>
    serverFetch<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};
