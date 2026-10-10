import { describe, expect, it } from "bun:test";

import {
	assertCanViewPlatformStats,
	FEATURE_ACCESS,
	hasRole,
	PLATFORM_STATS_ROLES,
	RoleAccessForbiddenError,
} from "@lib/role-access";

/**
 * The two platform-wide aggregate reads (`GET /auth/users/role-counts` and
 * `GET /reports/exports`) are deliberately NOT unit-scoped — they are
 * institution-level statistics — so `viewPlatformStats` is the only thing
 * keeping them from being readable by every authenticated role.
 */
describe("platform statistics role gate", () => {
	it("names the allow-list", () => {
		expect(PLATFORM_STATS_ROLES).toEqual(["system_admin"]);
		expect(FEATURE_ACCESS.viewPlatformStats).toEqual(["system_admin"]);
	});

	it("lets the system admin through", () => {
		expect(() => assertCanViewPlatformStats("system_admin")).not.toThrow();
	});

	it("rejects every other role, including the institution-wide QA roles", () => {
		// NOTE: aqau/vpaa are institution-wide for unit-scoped reads, but these
		// aggregates are explicitly out of their reach — they get 403, not a
		// zeroed-out response.
		for (const role of [
			"faculty",
			"program_chair",
			"dean",
			"aqau",
			"vpaa",
			"user",
			undefined,
		]) {
			expect(() => assertCanViewPlatformStats(role)).toThrow(
				RoleAccessForbiddenError,
			);
			expect(hasRole(role, PLATFORM_STATS_ROLES)).toBe(false);
		}
	});
});
