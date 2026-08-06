import type { NextConfig } from "next";

/**
 * Proxy better-auth browser routes to the backend so the OAuth state cookie and
 * session cookie both live on the frontend origin. `BETTER_AUTH_URL` must point
 * at the frontend origin for the Google `redirect_uri` to land here.
 */
const authBackend = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  rewrites: async () => [
    {
      source: "/api/v1/auth/:path*",
      destination: `${authBackend}/api/v1/auth/:path*`,
    },
  ],
};

export default nextConfig;
