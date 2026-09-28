/**
 * Dev-only one-click session: `GET /dev/session?role=dean[&next=/dashboard]`.
 *
 * Signs into the backend as the seeded `<role>@jmcfi.edu.ph` account, relays
 * the session `Set-Cookie` headers onto the browser, then redirects — so
 * `just dev-as <role>` opens the app already logged in as that role with a
 * real better-auth session (the backend still enforces everything).
 *
 * 404s in production builds, and answers 409 when `DEVELOPMENT=true` (dev
 * mode ignores session cookies, so setting one would change nothing).
 */
import { type NextRequest, NextResponse } from "next/server";
import {
  DEV_ACCOUNT_ROLES,
  isDevAccountRole,
  signInDevRole,
} from "@/lib/dev-accounts";
import { isDevMode } from "@/lib/dev-mode";
import { parseSetCookie } from "@/server/api-client";

export async function GET(request: NextRequest) {
  // WARN: this route signs in without a password — never ship it in a build.
  if (process.env.NODE_ENV === "production") {
    return new Response(null, { status: 404 });
  }

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
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      `${message}\nSeeded accounts come from \`just db-seed\` (run it in the repo root).\n`,
      { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
}
