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
 * It also doubles as the frontend's access log: `next start` prints nothing
 * per-request in production, so without this line the container is silent and
 * Dozzle (obelisk-frontend) shows no page visits.
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

	// NOTE: one line per request → container stdout → Dozzle; `pass` vs
	// `redirect` is all proxy can know (final status lives in the caddy log)
	const log = (decision: string) =>
		console.log(`[frontend] ${request.method} ${pathname} ${decision}`);

	if (isStatic) return NextResponse.next();

	if (!isProtected || isDevMode) {
		log("pass");
		return NextResponse.next();
	}

	const hasSessionCookie = request.cookies
		.getAll()
		.some((cookie) => cookie.name.startsWith(`${AUTH_COOKIE_PREFIX}.session`));

	if (!hasSessionCookie && request.method === "GET") {
		log("redirect /login");
		const loginUrl = new URL("/login", request.url);
		loginUrl.searchParams.set("next", pathname);
		return NextResponse.redirect(loginUrl);
	}

	log("pass");
	return NextResponse.next();
}

export const config = {
	// NOTE: the auth gate only fires on the protected prefixes below, but the
	// access log should see every page visit (incl. /login) — the negative
	// lookahead keeps static assets out of both
	matcher: ["/((?!_next/static|_next/image|favicon\\.ico|images/).*)"],
};
