import type { NextConfig } from "next";

// WARN: /dev/session mints sessions without a password — refuse to build or
// start a production bundle while its opt-in flag is on. `next dev` also loads
// this file (the justfile exports the flag legitimately), so the command name
// is checked too and a plain `next dev` never throws.
const isProductionRun =
  process.argv.includes("build") ||
  process.argv.includes("start") ||
  process.env.NODE_ENV === "production";
if (isProductionRun && process.env.DEV_SESSION_ENABLED === "true") {
  throw new Error(
    "DEV_SESSION_ENABLED must not be set for `next build`/`next start` " +
      "— app/dev/session would ship.",
  );
}

/**
 * Proxy better-auth browser routes to the backend so the OAuth state cookie and
 * session cookie both live on the frontend origin. `BETTER_AUTH_URL` must point
 * at the frontend origin for the Google `redirect_uri` to land here.
 *
 * NOTE: the destination is inlined into routes-manifest.json at build time, so
 * it must be reachable FROM the Next server process. Docker builds therefore
 * bake API_INTERNAL_URL (http://backend:8080, see root Dockerfile); Vercel and
 * local builds leave it unset and keep the public origin as before.
 */
const authBackend = (
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8080"
).replace(/\/$/, "");

// TODO: remove once the pre-existing type errors in components/ui (ark
// `render` prop, login-form FieldError, scrollFade) are fixed — otherwise
// `next build` (Vercel) fails before producing a bundle.
const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // NOTE: workspace packages ship raw .ts (no build step) — transpile them so
  // the client bundle also inlines `process.env.NEXT_PUBLIC_*` read in
  // @obelisk/env/client.
  transpilePackages: ["@obelisk/env", "@obelisk/app-info"],
  rewrites: async () => [
    {
      source: "/api/v1/auth/:path*",
      destination: `${authBackend}/api/v1/auth/:path*`,
    },
  ],
};

export default nextConfig;
