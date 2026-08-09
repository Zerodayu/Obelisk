/**
 * Better Auth client — the single browser-side entry point for auth actions.
 *
 * `baseURL` is intentionally omitted so the client resolves the current origin
 * (`window.location.origin`); `next.config.ts` proxies `/api/v1/auth/:path*`
 * to the backend, relaying cookies and `Set-Cookie` headers so better-auth
 * session cookies land on the frontend origin.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  basePath: "/api/v1/auth",
});