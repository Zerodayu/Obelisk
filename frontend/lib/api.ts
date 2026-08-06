/**
 * Obelisk API client — the single typed wrapper around the backend at `api/v1`.
 *
 * All data flows through this module; pages and components must not call
 * `fetch` directly against the backend. Authentication uses better-auth
 * cookie/session (see `backend/SYSTEM-DESIGN.md` §1).
 *
 * The server-side variant used inside server components / layouts lives in
 * `lib/api/server.ts`; import from there when you are fetching for RSC pages.
 */

import type { UserRole } from "@/lib/roles";
import { env } from "@/utils/env";

export const API_BASE_URL = env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export const API_ROOT = `${API_BASE_URL}/api/v1`;

/** mirrors the backend `user` model (better-auth + institutional extensions). */
export interface ApiUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role: UserRole;
  employeeId?: string | null;
  programId?: string | null;
  departmentId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** mirrors `better-auth` Session. */
export interface ApiSession {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** `GET /auth/me` response shape. */
export interface MeResponse {
  user: ApiUser;
  session: ApiSession;
}

export interface ApiErrorPayload {
  error?: string;
  message?: string;
  /** structured python-server error type, when applicable (ingest). */
  error_type?: string;
  details?: unknown;
}

/**
 * Thrown for any non-2xx / network failure from the API client. `status` is
 * `undefined` for network errors.
 */
export class ApiError extends Error {
  readonly status?: number;
  readonly payload?: ApiErrorPayload;

  constructor(
    message: string,
    opts: { status?: number; payload?: ApiErrorPayload } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.payload = opts.payload;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: HeadersInit;
  /**
   * By default the client sends `credentials: "include"` (cookie auth).
   * Set `credentials: false` for non-authenticated endpoints.
   */
  credentials?: boolean;
  signal?: AbortSignal;
}

/** browser-facing client — sends HTTP-only cookies automatically. */
async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const {
    method = "GET",
    query,
    body,
    headers,
    credentials = true,
    signal,
  } = opts;

  const url = new URL(`${API_ROOT}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(headers ?? {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: credentials ? "include" : "omit",
      signal,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(`Network error reaching ${url.pathname}`, {
      status: undefined,
    });
  }

  if (!res.ok) {
    let payload: ApiErrorPayload | undefined;
    try {
      payload = (await res.json()) as ApiErrorPayload;
    } catch {
      payload = undefined;
    }
    const message =
      payload?.message ?? payload?.error ?? `Request failed (${res.status})`;
    throw new ApiError(message, { status: res.status, payload });
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, opts: Omit<RequestOptions, "method" | "body"> = {}) =>
    request<T>(path, { ...opts, method: "GET" }),

  post: <T>(
    path: string,
    body?: unknown,
    opts: Omit<RequestOptions, "method" | "body"> = {},
  ) => request<T>(path, { ...opts, method: "POST", body }),

  put: <T>(
    path: string,
    body?: unknown,
    opts: Omit<RequestOptions, "method" | "body"> = {},
  ) => request<T>(path, { ...opts, method: "PUT", body }),

  patch: <T>(
    path: string,
    body?: unknown,
    opts: Omit<RequestOptions, "method" | "body"> = {},
  ) => request<T>(path, { ...opts, method: "PATCH", body }),

  delete: <T>(
    path: string,
    opts: Omit<RequestOptions, "method" | "body"> = {},
  ) => request<T>(path, { ...opts, method: "DELETE" }),

  me: () => request<MeResponse>("/auth/me"),
};

export const isApiError = (err: unknown): err is ApiError =>
  err instanceof ApiError;
