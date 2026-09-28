/**
 * Standalone dev sign-in: `bun run dev-session <role>`.
 *
 * Signs in as the seeded `<role>@jmcfi.edu.ph` account, writes the session
 * cookie to `.dev-session/<role>.cookie` (gitignored), and prints a `Cookie:`
 * header you can paste into curl/Bun when hitting the backend directly.
 *
 * The browser equivalent is `GET /dev/session?role=<role>`
 * (`app/dev/session/route.ts`) — that is what `just dev-as <role>` opens.
 *
 * Requires the backend on :8080; warns under `DEVELOPMENT=true`, since the
 * frontend would ignore the cookie (the backend still accepts it).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { API_ROOT } from "@/lib/api-client";
import {
  cookieHeaderFrom,
  DEV_ACCOUNT_ROLES,
  devAccountEmail,
  isDevAccountRole,
  isLoopbackHostname,
  signInDevRole,
} from "@/lib/dev-accounts";
import type { UserRole } from "@/lib/roles";
import { env } from "@/utils/env";

// WARN: this helper mints a real session with a shared password — never point
// it at a remote backend. Fail closed, including when the URL won't parse.
let apiHost: string | null = null;
try {
  apiHost = new URL(API_ROOT).hostname;
} catch {
  apiHost = null;
}
if (!apiHost || !isLoopbackHostname(apiHost)) {
  console.error(
    `refusing: API_ROOT is ${API_ROOT} — only a loopback backend is allowed.`,
  );
  process.exit(1);
}

const roleArg = process.argv[2];
if (!roleArg || !isDevAccountRole(roleArg)) {
  if (roleArg) console.error(`unknown role: ${roleArg}`);
  console.error("usage: bun run dev-session <role>");
  console.error(`valid roles: ${DEV_ACCOUNT_ROLES.join(", ")}`);
  process.exit(1);
}
const role: UserRole = roleArg;

// NOTE: dev mode overrides getMe() with DEV_USER, so the *frontend* would
// ignore this cookie — the backend still honours it (curl/Bun calls).
const devMode = env.DEVELOPMENT?.trim().toLowerCase();
if (devMode === "true" || devMode === "1" || devMode === "yes") {
  console.warn(
    "WARN: DEVELOPMENT=true — the frontend ignores this cookie (DEV_USER wins); the backend still accepts it.",
  );
}

try {
  const { setCookies } = await signInDevRole(role);

  const cookieHeader = cookieHeaderFrom(setCookies);

  const file = join(
    fileURLToPath(new URL("../", import.meta.url)),
    ".dev-session",
    `${role}.cookie`,
  );
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${cookieHeader}\n`, "utf8");

  console.log(`signed in as ${devAccountEmail(role)} (role: ${role})`);
  console.log(`cookie file: ${file}`);
  console.log("");
  console.log(`Cookie: ${cookieHeader}`);
  console.log("");
  console.log("# curl:");
  console.log(`curl -H "Cookie: ${cookieHeader}" ${API_ROOT}/auth/me`);
  console.log("");
  console.log(`# browser: http://localhost:3000/dev/session?role=${role}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  // TODO: distinguish "backend down" from "account missing" more precisely
  console.error("Accounts are seeded by `just db-seed` (repo root).");
  process.exit(1);
}
