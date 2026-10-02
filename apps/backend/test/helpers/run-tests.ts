import { wipeTestDatabase } from "./wipe-db";

/**
 * Test-suite wrapper: wipes the database before and after `bun test` so every
 * run starts blank and leaves nothing behind (pass or fail). Forwards all
 * args to bun test and propagates its real exit code.
 *
 * Usage: bun test/helpers/run-tests.ts [-- <path>...]
 */
const args = process.argv.slice(2).filter((arg) => arg !== "--");

// NOTE: integration tests run against the Docker Postgres (`just db-up`) —
// keep the generous 60s budget as a margin for slow hosts; a failing round-trip
// aborts `finally` cleanup blocks, cascading FK/unique errors into later tests
// in the same file. An explicit per-test timeout still wins.
if (
	!args.includes("--timeout") &&
	!args.some((a) => a.startsWith("--timeout="))
) {
	args.push("--timeout=60000");
}

await wipeTestDatabase();

let code = 1;
try {
	const run = Bun.spawn(["bun", "test", ...args], {
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	code = await run.exited;
} catch {
	code = 1;
}

await wipeTestDatabase();
process.exit(code);
