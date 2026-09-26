import { describe, expect, it } from "bun:test";
import {
	assertCanCaptureClassRecords,
	CLASS_RECORD_ROLES,
	CLUSTER_CONFIRM_ROLES,
	FEATURE_ACCESS,
	hasRole,
	PLO_MANAGEMENT_ROLES,
	ROLE_REQUEST_ROLES,
	RoleAccessForbiddenError,
} from "@lib/role-access";
import { assertCanManagePlos, PloForbiddenError } from "@v1/plan/compute";

describe("feature role gates (lib/role-access)", () => {
	it("restricts class-record capture to faculty/program_chair/system_admin", () => {
		expect(CLASS_RECORD_ROLES).toEqual([
			"faculty",
			"program_chair",
			"system_admin",
		]);
		expect(() => assertCanCaptureClassRecords("faculty")).not.toThrow();
		expect(() => assertCanCaptureClassRecords("program_chair")).not.toThrow();
		expect(() => assertCanCaptureClassRecords("system_admin")).not.toThrow();
		expect(() => assertCanCaptureClassRecords("dean")).toThrow(
			RoleAccessForbiddenError,
		);
		expect(() => assertCanCaptureClassRecords("aqau")).toThrow(
			RoleAccessForbiddenError,
		);
		expect(() => assertCanCaptureClassRecords("vpaa")).toThrow(
			RoleAccessForbiddenError,
		);
		expect(() => assertCanCaptureClassRecords("user")).toThrow(
			RoleAccessForbiddenError,
		);
		expect(() => assertCanCaptureClassRecords(undefined)).toThrow(
			RoleAccessForbiddenError,
		);
	});

	it("restricts archiving (and the archive screens) to vpaa/system_admin", () => {
		expect(FEATURE_ACCESS.archive).toEqual(["vpaa", "system_admin"]);
		expect(FEATURE_ACCESS.viewArchives).toEqual(FEATURE_ACCESS.archive);
	});

	it("keeps PLO management dean-only — no system_admin bypass", () => {
		expect(PLO_MANAGEMENT_ROLES).toEqual(["dean"]);
		expect(() => assertCanManagePlos("dean")).not.toThrow();
		expect(() => assertCanManagePlos("system_admin")).toThrow(
			PloForbiddenError,
		);
		expect(() => assertCanManagePlos("vpaa")).toThrow(PloForbiddenError);
	});

	it("restricts role-request management to system_admin", () => {
		expect(ROLE_REQUEST_ROLES).toEqual(["system_admin"]);
		expect(hasRole("system_admin", ROLE_REQUEST_ROLES)).toBe(true);
		expect(hasRole("vpaa", ROLE_REQUEST_ROLES)).toBe(false);
		expect(hasRole(undefined, ROLE_REQUEST_ROLES)).toBe(false);
	});

	it("names cluster confirm for aqau/system_admin", () => {
		expect(CLUSTER_CONFIRM_ROLES).toEqual(["aqau", "system_admin"]);
	});
});
