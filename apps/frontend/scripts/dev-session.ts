/**
 * Standalone dev sign-in: `bun run dev-session <id>`.
 *
 * Signs in as the seeded `<id>@jmcfi.edu.ph` account (`<id>` is a role such
 * as `dean`, or a role's second account such as `faculty1`), writes the
 * session cookie to `.dev-session/<id>.cookie` (gitignored), and prints a
 * `Cookie:` header you can paste into curl/Bun when hitting the backend
 * directly.
 *
 * The browser equivalent is `GET /dev/session?role=<id>`
 * (`app/dev/session/route.ts`) — that is what `just dev-as <id>` opens.
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
  DEV_ACCOUNT_IDS,
  devAccountEmail,
  devAccountRole,
  isDevAccount,
  isLoopbackHostname,
  signInDevAccount,
} from "@/lib/dev-accounts";
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

const accountArg = process.argv[2];
if (!accountArg || !isDevAccount(accountArg)) {
  if (accountArg) console.error(`unknown account: ${accountArg}`);
  console.error("usage: bun run dev-session <id>");
  console.error(`valid accounts: ${DEV_ACCOUNT_IDS.join(", ")}`);
  process.exit(1);
}
const account = accountArg;

// NOTE: dev mode overrides getMe() with DEV_USER, so the *frontend* would
// ignore this cookie — the backend still honours it (curl/Bun calls).
const devMode = env.DEVELOPMENT?.trim().toLowerCase();
if (devMode === "true" || devMode === "1" || devMode === "yes") {
  console.warn(
    "WARN: DEVELOPMENT=true — the frontend ignores this cookie (DEV_USER wins); the backend still accepts it.",
  );
}

try {
  const { setCookies } = await signInDevAccount(account);

  const cookieHeader = cookieHeaderFrom(setCookies);

  const file = join(
    fileURLToPath(new URL("../", import.meta.url)),
    ".dev-session",
    `${account}.cookie`,
  );
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${cookieHeader}\n`, "utf8");

  console.log(
    `signed in as ${devAccountEmail(account)} (role: ${devAccountRole(account) ?? "unknown"})`,
  );
  console.log(`cookie file: ${file}`);
  console.log("");
  console.log(`Cookie: ${cookieHeader}`);
  console.log("");
  console.log("# curl:");
  console.log(`curl -H "Cookie: ${cookieHeader}" ${API_ROOT}/auth/me`);
  console.log("");
  console.log(`# browser: http://localhost:3000/dev/session?role=${account}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  // TODO: distinguish "backend down" from "account missing" more precisely
  console.error("Accounts are seeded by `just db-seed` (repo root).");
  process.exit(1);
}
