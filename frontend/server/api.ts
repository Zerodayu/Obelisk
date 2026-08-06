/**
 * Server-side API helpers for Server Components / layouts / Server Actions.
 *
 * These forward the request's cookies to the backend so better-auth sessions
 * resolve from the server-to-server request. Only import from Server
 * Components or Server Actions (`"server-only"` enforces that).
 */

import "server-only";

import { cookies } from "next/headers";

import { API_ROOT, type MeResponse } from "@/lib/api";

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
