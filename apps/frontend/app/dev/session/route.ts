/**
 * Dev-only one-click session: `GET /dev/session?role=dean[&next=/dashboard]`.
 *
 * Signs into the backend as the seeded `<role>@jmcfi.edu.ph` account, relays
 * the session `Set-Cookie` headers onto the browser, then redirects — so
 * `just dev-as <role>` opens the app already logged in as that role with a
 * real better-auth session (the backend still enforces everything).
 *
 * WARN: it signs in without a password, so it sits behind three hard gates
 * that all answer an empty 404 (`unavailable()` below) and a build-time
 * refusal in `next.config.ts`. Soft gates come after them: 409 when
 * `DEVELOPMENT=true` (dev mode ignores session cookies, so setting one would
 * change nothing) and 400 for an unknown role.
 */
import { type NextRequest, NextResponse } from "next/server";
import {
  DEV_ACCOUNT_ROLES,
  devAccountEmail,
  isDevAccountRole,
  isLoopbackHostname,
  signInDevRole,
} from "@/lib/dev-accounts";
import { isDevMode } from "@/lib/dev-mode";
import { parseSetCookie } from "@/server/api-client";
import { env } from "@/utils/env";

/** Empty 404 — indistinguishable from a route that does not exist. */
function notFound(reason: string): Response {
  // NOTE: the reason goes to the log only; the body says nothing at all.
  console.warn(`[dev-session] refused: ${reason}`);
  return new Response(null, { status: 404 });
}

/**
 * The hard gates, checked before any work happens. Route handlers never see
 * the client IP, so "local" is the request host plus `x-forwarded-for` when a
 * proxy supplies one — an SSH tunnel forwards to localhost too, which is why
 * the forwarded client must also be loopback.
 */
function unavailable(request: NextRequest): Response | null {
  if (process.env.NODE_ENV === "production") {
    return notFound("production build");
  }
  // WARN: opt-in — the justfile dev recipes export it, nothing else does.
  if (env.DEV_SESSION_ENABLED !== "true") {
    return notFound("DEV_SESSION_ENABLED is not set");
  }
  const host = request.nextUrl.hostname;
  if (!isLoopbackHostname(host)) {
    return notFound(`host ${host} is not loopback`);
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null) {
    const client = forwarded.split(",")[0]?.trim() ?? "";
    if (!isLoopbackHostname(client)) {
      return notFound(`x-forwarded-for ${forwarded} is not loopback`);
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const blocked = unavailable(request);
  if (blocked) return blocked;

  // NOTE: dev mode answers getMe() with DEV_USER, so a session cookie would be
  // silently ignored — say so instead of setting a cookie that changes nothing.
  if (isDevMode) {
    return new Response(
      "DEVELOPMENT=true — the frontend uses the simulated dev user and ignores session cookies.\n" +
        "Run `just dev-as <role>` (it starts the stack with DEVELOPMENT=false), or turn dev mode off:\n" +
        "  bunx dotenvx set DEVELOPMENT false -f .env.local\n",
      { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const role = request.nextUrl.searchParams.get("role");
  if (!isDevAccountRole(role)) {
    return new Response(
      `Unknown role "${role ?? ""}".\nValid roles: ${DEV_ACCOUNT_ROLES.join(", ")}\n`,
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";
  // NOTE: open-redirect guard — same-origin paths only.
  const target =
    next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  try {
    const { setCookies } = await signInDevRole(role, {
      cookieHeader: request.headers.get("cookie") ?? undefined,
      origin:
        request.headers.get("origin") ??
        request.headers.get("referer") ??
        undefined,
    });

    const res = NextResponse.redirect(new URL(target, request.url), 307);
    // NOTE: apply in order (sign-out first) — the new session must win.
    for (const header of setCookies) {
      const cookie = parseSetCookie(header);
      if (cookie) res.cookies.set(cookie.name, cookie.value, cookie.options);
    }
    console.log(`[dev-session] signed in as ${devAccountEmail(role)}`);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      `${message}\nSeeded accounts come from \`just db-seed\` (run it in the repo root).\n`,
      { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
}
