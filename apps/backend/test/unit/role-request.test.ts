import { describe, expect, it } from "bun:test";
import {
	REQUESTED_SCOPE,
	requestedScopeForRole,
	roleNeedsDepartment,
	roleNeedsProgram,
	SELF_SELECTABLE_ROLES,
	validateRoleRequest,
} from "@v1/auth/model";
import { REQUESTED_SCOPE as FRONTEND_REQUESTED_SCOPE } from "../../../frontend/lib/roles";

const PROGRAM_ID = "program-bsit";
const DEPARTMENT_ID = "department-cite";
const PLAIN_USER = { role: "user", roleRequestStatus: "none" } as const;

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
				{ programId: PROGRAM_ID },
			),
		).toEqual({ ok: true });
	});

	it("accepts re-filing after a denial", () => {
		expect(
			validateRoleRequest(
				{ role: "user", roleRequestStatus: "denied" },
				"dean",
				{ departmentId: DEPARTMENT_ID },
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
				{ programId: PROGRAM_ID },
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
				{ programId: PROGRAM_ID },
			),
		).toEqual({
			ok: false,
			status: 409,
			message: "Your role request was already approved.",
		});
	});

	it("rejects a non-self-selectable role", () => {
		expect(validateRoleRequest({ ...PLAIN_USER }, "system_admin")).toEqual({
			ok: false,
			status: 400,
			message: "Invalid requested role.",
		});
	});
});

describe("role request scope rules", () => {
	it("requires a program (and only a program) for faculty/program_chair", () => {
		for (const role of ["faculty", "program_chair"] as const) {
			// No scope at all.
			expect(validateRoleRequest({ ...PLAIN_USER }, role)).toEqual({
				ok: false,
				status: 400,
				message: "Select the program you belong to.",
			});
			// Department where a program belongs.
			expect(
				validateRoleRequest({ ...PLAIN_USER }, role, {
					departmentId: DEPARTMENT_ID,
				}),
			).toEqual({
				ok: false,
				status: 400,
				message: "Department does not apply to the selected role.",
			});
			// Accepted with the program only — the id's existence is checked
			// against the DB in the controller.
			expect(
				validateRoleRequest({ ...PLAIN_USER }, role, {
					programId: PROGRAM_ID,
				}),
			).toEqual({ ok: true });
			// The department derived from that program must not be sent back.
			expect(
				validateRoleRequest({ ...PLAIN_USER }, role, {
					programId: PROGRAM_ID,
					departmentId: DEPARTMENT_ID,
				}),
			).toEqual({
				ok: false,
				status: 400,
				message: "Department does not apply to the selected role.",
			});
		}
	});

	it("requires a department (and only a department) for dean", () => {
		expect(validateRoleRequest({ ...PLAIN_USER }, "dean")).toEqual({
			ok: false,
			status: 400,
			message: "Select your department.",
		});
		expect(
			validateRoleRequest({ ...PLAIN_USER }, "dean", {
				programId: PROGRAM_ID,
			}),
		).toEqual({
			ok: false,
			status: 400,
			message: "Program does not apply to the selected role.",
		});
		expect(
			validateRoleRequest({ ...PLAIN_USER }, "dean", {
				departmentId: DEPARTMENT_ID,
			}),
		).toEqual({ ok: true });
	});

	it("rejects any scope on the institution-wide roles", () => {
		for (const role of ["aqau", "vpaa"] as const) {
			expect(
				validateRoleRequest({ ...PLAIN_USER }, role, {
					programId: PROGRAM_ID,
				}),
			).toEqual({
				ok: false,
				status: 400,
				message: "The selected role is not scoped to a program or department.",
			});
			expect(
				validateRoleRequest({ ...PLAIN_USER }, role, {
					departmentId: DEPARTMENT_ID,
				}),
			).toEqual({
				ok: false,
				status: 400,
				message: "The selected role is not scoped to a program or department.",
			});
			expect(validateRoleRequest({ ...PLAIN_USER }, role)).toEqual({
				ok: true,
			});
		}
	});

	it("derives the scope kind from the requested role", () => {
		expect(requestedScopeForRole("faculty")).toBe("program");
		expect(requestedScopeForRole("program_chair")).toBe("program");
		expect(requestedScopeForRole("dean")).toBe("department");
		expect(requestedScopeForRole("aqau")).toBeNull();
		expect(requestedScopeForRole("vpaa")).toBeNull();
		expect(requestedScopeForRole(undefined)).toBeNull();

		expect(roleNeedsProgram("faculty")).toBe(true);
		expect(roleNeedsProgram("dean")).toBe(false);
		expect(roleNeedsDepartment("dean")).toBe(true);
		expect(roleNeedsDepartment("faculty")).toBe(false);
	});
});

describe("requested-scope mirror", () => {
	it("keeps the frontend selects in sync with backend enforcement", () => {
		expect(FRONTEND_REQUESTED_SCOPE).toEqual(REQUESTED_SCOPE);
	});

	it("only scopes self-selectable roles", () => {
		for (const role of Object.keys(REQUESTED_SCOPE)) {
			expect(SELF_SELECTABLE_ROLES as readonly string[]).toContain(role);
		}
	});
});
