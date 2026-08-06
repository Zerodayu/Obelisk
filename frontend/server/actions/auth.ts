/**
 * Auth server actions — the frontend's mutation layer for email sign-in, role
 * requests, and sign-out. Google social sign-in uses the better-auth client
 * (`lib/auth-client.ts`) directly in the browser.
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
