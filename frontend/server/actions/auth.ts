/**
 * Auth server actions — the frontend's mutation layer for sign-in, social
 * sign-in, role requests, and sign-out.
 *
 * Server actions live in `server/actions/` (one file per domain) and are the
 * only place the frontend performs authenticated mutations. They go through
 * `actionApi` (`server/api-client.ts`), which forwards the browser's cookies
 * and relays the backend's `Set-Cookie` headers back so better-auth sessions
 * land on the frontend origin.
 *
 * Every action authenticates/authorizes and returns a serializable
 * `ActionResult` instead of leaking raw backend responses. Success
 * navigations use `redirect()` so the response ships fresh RSC + cookies.
 */

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api-client";
import { actionApi } from "@/server/api-client";
import { requireRole } from "@/server/auth";

/** Serializable result every server action returns to the client. */
export type ActionResult<TData = void> =
  | { ok: true; data: TData }
  | { ok: false; error: string };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** Resolve a frontend path into an absolute URL from the incoming request. */
async function absoluteUrl(path: string): Promise<string> {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const proto =
    requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  return `${proto}://${host}${path}`;
}

/**
 * Sign in with email/password (existing accounts). On success the backend's
 * session cookies are relayed to the browser and the user is redirected.
 */
export async function signInWithEmail(input: {
  email: string;
  password: string;
  /** Frontend path to land on after sign-in. */
  next?: string;
}): Promise<ActionResult> {
  try {
    await actionApi.post("/auth/sign-in/email", {
      email: input.email,
      password: input.password,
    });
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Sign-in failed. Please try again."),
    };
  }
  redirect(input.next?.startsWith("/") ? input.next : "/dashboard");
}

/** Start the Google OAuth flow; returns the authorize URL for the browser to follow. */
export async function startGoogleSignIn(input: {
  /** Frontend path better-auth redirects the browser to after the OAuth exchange. */
  callbackURL: string;
  /** Frontend path the browser lands on when the OAuth exchange fails. */
  errorCallbackURL?: string;
}): Promise<ActionResult<{ url: string }>> {
  try {
    const { url } = await actionApi.post<{ url: string }>(
      "/auth/sign-in/social",
      {
        provider: "google",
        callbackURL: await absoluteUrl(input.callbackURL),
        errorCallbackURL: input.errorCallbackURL
          ? await absoluteUrl(input.errorCallbackURL)
          : undefined,
      },
    );
    return { ok: true, data: { url } };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Could not start Google sign-in. Please try again.",
      ),
    };
  }
}

/** File (or re-file) a role request for the signed-in user. */
export async function fileRoleRequest(
  requestedRole: string,
): Promise<ActionResult> {
  try {
    await actionApi.post("/auth/role-request", { requestedRole });
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Could not submit your role request. Please try again.",
      ),
    };
  }
}

/** Approve or deny a pending role request (system_admin only). */
export async function decideRoleRequest(
  userId: string,
  decision: "approve" | "deny",
): Promise<ActionResult> {
  await requireRole(["system_admin"]);
  try {
    await actionApi.post(`/auth/role-requests/${userId}/${decision}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Action failed. Please retry."),
    };
  }
}

/** Sign the current user out; clears session cookies and redirects to `/login`. */
export async function signOut(): Promise<ActionResult> {
  try {
    await actionApi.post("/auth/sign-out");
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Could not sign out. Please try again."),
    };
  }
  redirect("/login");
}
