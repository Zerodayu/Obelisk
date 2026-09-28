import { type NextProxy, NextResponse } from "next/server";
import { isDevMode } from "@/lib/dev-mode";

/**
 * Coarse authentication gate (Next.js 16 `proxy`, formerly middleware).
 *
 * Proxy is intentionally limited to what it is good at: redirecting
 * unauthenticated requests away from authenticated areas using a cheap
 * session-cookie presence check. It never authorizes — real session validation
 * and role gating happen in server layouts (`app/(app)/layout.tsx` +
 * `lib/auth.ts`), which is what proxy is NOT meant to do.
 *
 * When DEVELOPMENT=true the gate is disabled so every route is viewable
 * without an account (frontend-only; the backend still requires a session).
 *
 * The better-auth session cookie is named `<cookiePrefix>.session_token`,
 * where the backend sets `cookiePrefix: "obelisk-app"`.
 */
const AUTH_COOKIE_PREFIX = "obelisk-app";

const PROTECTED_PREFIXES = ["/dashboard", "/forms", "/archives"];

export default function nextProxy(
  request: Parameters<NextProxy>[0],
  _event: Parameters<NextProxy>[1],
) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const isStatic =
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/images/") ||
    pathname === "/favicon.ico";

  if (!isProtected || isStatic || isDevMode) return NextResponse.next();

  const hasSessionCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith(`${AUTH_COOKIE_PREFIX}.session`));

  if (!hasSessionCookie && request.method === "GET") {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on the protected prefixes only; never on static assets or login.
  matcher: ["/dashboard/:path*", "/forms/:path*", "/archives/:path*"],
};
