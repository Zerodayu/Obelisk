import { describe, expect, it } from "bun:test";
import {
	SELF_SELECTABLE_ROLES,
	validateRoleRequest,
} from "../../src/v1/auth/model";

describe("role request validation", () => {
	it("exposes exactly the self-selectable roles", () => {
		expect(SELF_SELECTABLE_ROLES).toEqual([
			"faculty",
			"program_chair",
			"dean",
			"aqau",
			"vpaa",
		]);
	});

	it("accepts a first request from a plain `user` account", () => {
		expect(
			validateRoleRequest(
				{ role: "user", roleRequestStatus: "none" },
				"faculty",
			),
		).toEqual({ ok: true });
	});

	it("accepts re-filing after a denial", () => {
		expect(
			validateRoleRequest(
				{ role: "user", roleRequestStatus: "denied" },
				"dean",
			),
		).toEqual({ ok: true });
	});

	it("rejects a request from an account that already holds a role", () => {
		expect(
			validateRoleRequest(
				{ role: "vpaa", roleRequestStatus: "approved" },
				"aqau",
			),
		).toEqual({
			ok: false,
			status: 409,
			message: "Your account already holds an institutional role.",
		});
	});

	it("rejects a duplicate request while one is pending", () => {
		expect(
			validateRoleRequest(
				{ role: "user", roleRequestStatus: "pending" },
				"faculty",
			),
		).toEqual({
			ok: false,
			status: 409,
			message: "A role request is already pending approval.",
		});
	});

	it("rejects a request from an approved account", () => {
		expect(
			validateRoleRequest(
				{ role: "user", roleRequestStatus: "approved" },
				"faculty",
			),
		).toEqual({
			ok: false,
			status: 409,
			message: "Your role request was already approved.",
		});
	});

	it("rejects a non-self-selectable role", () => {
		expect(
			validateRoleRequest(
				{ role: "user", roleRequestStatus: "none" },
				"system_admin",
			),
		).toEqual({ ok: false, status: 400, message: "Invalid requested role." });
	});
});
