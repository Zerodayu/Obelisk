import { prisma } from "@lib/prisma";

let cached: boolean | null = null;

/**
 * Determines whether the dev database is reachable. Caches the result for the
 * process lifetime. Used to gate DB-backed integration tests so the suite is
 * green while Neon is offline (P1001) and runs automatically once reachable.
 */
export async function isDbReachable(): Promise<boolean> {
	if (cached !== null) return cached;

	try {
		await prisma.$queryRaw`SELECT 1`;
		cached = true;
	} catch {
		cached = false;
	}

	return cached;
}

export async function requireDb(): Promise<boolean> {
	const reachable = await isDbReachable();
	if (!reachable) {
		console.warn(
			"Skipping integration tests: dev database unreachable (P1001).",
		);
	}
	return reachable;
}
