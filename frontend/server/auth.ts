/**
 * Server-only auth helpers for layouts, route guards, and Server Actions.
 *
 * These resolve the better-auth session on the server (via `server/api-client.ts`)
 * and provide role-based guards for route groups. Use in Server Components;
 * client components should rely on session state passed down by the shell.
 */

import "server-only";

import { notFound, redirect } from "next/navigation";
import type { ApiUser } from "@/lib/api-client";
import { DEV_ENFORCE_ROLE_ACCESS, isDevMode } from "@/lib/dev-mode";
import { hasAccess, type UserRole } from "@/lib/roles";
import { getMe } from "@/server/api-client";

export type { ApiUser } from "@/lib/api-client";

/** Current user, or `null` when unauthenticated. */
export async function currentUser(): Promise<ApiUser | null> {
  const me = await getMe();
  return me?.user ?? null;
}

/**
 * Guard for the authenticated app shell: redirects to `/login` when there is
 * no valid session. Returns the user when authenticated.
 */
export async function requireUser(): Promise<ApiUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Guest guard for auth-only routes (`/login`, `/register`): redirects an
 * already-authenticated user to their home (`/dashboard`).
 *
 * In dev mode the simulated role is treated as authenticated like production
 * when `DEV_ENFORCE_ROLE_ACCESS` is `true`; when it is `false` the auth pages
 * stay previewable.
 */
export async function requireGuest(): Promise<void> {
  const user = await currentUser();
  if (user && (!isDevMode || DEV_ENFORCE_ROLE_ACCESS)) redirect("/dashboard");
}

/**
 * Role guard for a route group: redirects to `/login` when unauthenticated and
 * to `/dashboard` when authenticated but not allowed (matching the "client
 * hides/navigates" model — the backend still enforces authority).
 *
 * In dev mode the simulated role (`DEV_ROLE` in `server/api-client.ts`) gates
 * access exactly like production unless `DEV_ENFORCE_ROLE_ACCESS` is set to
 * `false`, which restores open navigation for inspecting any route.
 */
export async function requireRole(
  allowed?: readonly UserRole[],
): Promise<ApiUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if ((!isDevMode || DEV_ENFORCE_ROLE_ACCESS) && !hasAccess(user.role, allowed))
    redirect("/dashboard");
  return user;
}

/** Role guard that 404s instead of redirecting (deny without revealing existence). */
export async function requireRoleOrNotFound(
  allowed?: readonly UserRole[],
): Promise<ApiUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if ((!isDevMode || DEV_ENFORCE_ROLE_ACCESS) && !hasAccess(user.role, allowed))
    notFound();
  return user;
}
