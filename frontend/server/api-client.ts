/**
 * Server-side API helpers for Server Components / layouts / Server Actions.
 *
 * These forward the request's cookies to the backend so better-auth sessions
 * resolve from the server-to-server request. Only import from Server
 * Components or Server Actions (`"server-only"` enforces that).
 */

import "server-only";

import { cookies } from "next/headers";

import {
  API_ROOT,
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

async function serverFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  const res = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
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
