import { wipeTestDatabase } from "./wipe-db";

/**
 * Test-suite wrapper: wipes the database before and after `bun test` so every
 * run starts blank and leaves nothing behind (pass or fail). Forwards all
 * args to bun test and propagates its real exit code.
 *
 * Usage: bun test/helpers/run-tests.ts [-- <path>...]
 */
const args = process.argv.slice(2).filter((arg) => arg !== "--");

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
