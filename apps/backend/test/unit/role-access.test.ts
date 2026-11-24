import { describe, expect, it } from "bun:test";

import {
	assertCanCaptureClassRecords,
	assertCanManageClassSections,
	assertCanManageReferenceData,
	assertCanManageUsers,
	assertCanReadAtRiskFlags,
	CLASS_RECORD_ROLES,
	CLASS_SECTION_ROLES,
	CLUSTER_CONFIRM_ROLES,
	FEATURE_ACCESS,
	hasRole,
	PLO_MANAGEMENT_ROLES,
	REFERENCE_DATA_ROLES,
	ROLE_REQUEST_ROLES,
	RoleAccessForbiddenError,
	USER_MANAGEMENT_ROLES,
} from "@lib/role-access";
import {
	assertCanDirectManagePlos,
	assertCanProposePlos,
	PloForbiddenError,
} from "@v1/plan/compute";

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

	it("restricts archiving to vpaa/system_admin; AQAU may view archives", () => {
		expect(FEATURE_ACCESS.archive).toEqual(["vpaa", "system_admin"]);
		expect(FEATURE_ACCESS.viewArchives).toEqual([
			"aqau",
			"vpaa",
			"system_admin",
		]);
	});

	it("gates PLO management to program_chair and dean — no admin bypass", () => {
		expect(PLO_MANAGEMENT_ROLES).toEqual(["program_chair", "dean"]);
		// The chair proposes; the dean authors/approves directly.
		expect(() => assertCanProposePlos("program_chair")).not.toThrow();
		expect(() => assertCanProposePlos("dean")).toThrow(PloForbiddenError);
		expect(() => assertCanDirectManagePlos("dean")).not.toThrow();
		expect(() => assertCanDirectManagePlos("program_chair")).toThrow(
			PloForbiddenError,
		);
		expect(() => assertCanDirectManagePlos("system_admin")).toThrow(
			PloForbiddenError,
		);
	});

	it("restricts role-request management to system_admin", () => {
		expect(ROLE_REQUEST_ROLES).toEqual(["system_admin"]);
		expect(hasRole("system_admin", ROLE_REQUEST_ROLES)).toBe(true);
		expect(hasRole("vpaa", ROLE_REQUEST_ROLES)).toBe(false);
		expect(hasRole(undefined, ROLE_REQUEST_ROLES)).toBe(false);
	});

	it("restricts reference-data creation to system_admin", () => {
		expect(REFERENCE_DATA_ROLES).toEqual(["system_admin"]);
		expect(() => assertCanManageReferenceData("system_admin")).not.toThrow();
		for (const role of ["vpaa", "aqau", "dean", "faculty", "user"]) {
			expect(() => assertCanManageReferenceData(role)).toThrow(
				RoleAccessForbiddenError,
			);
		}
		expect(() => assertCanManageReferenceData(undefined)).toThrow(
			RoleAccessForbiddenError,
		);
	});

	it("lets capture roles create class sections, not reviewers", () => {
		expect(CLASS_SECTION_ROLES).toEqual([
			"faculty",
			"program_chair",
			"system_admin",
		]);
		for (const role of ["faculty", "program_chair", "system_admin"]) {
			expect(() => assertCanManageClassSections(role)).not.toThrow();
		}
		for (const role of ["vpaa", "aqau", "dean", "user"]) {
			expect(() => assertCanManageClassSections(role)).toThrow(
				RoleAccessForbiddenError,
			);
		}
		expect(() => assertCanManageClassSections(undefined)).toThrow(
			RoleAccessForbiddenError,
		);
	});

	it("restricts user-account creation to system_admin", () => {
		expect(USER_MANAGEMENT_ROLES).toEqual(["system_admin"]);
		expect(() => assertCanManageUsers("system_admin")).not.toThrow();
		for (const role of ["vpaa", "aqau", "dean", "faculty", "user"]) {
			expect(() => assertCanManageUsers(role)).toThrow(
				RoleAccessForbiddenError,
			);
		}
		expect(() => assertCanManageUsers(undefined)).toThrow(
			RoleAccessForbiddenError,
		);
	});

	it("names cluster confirm for aqau/system_admin", () => {
		expect(CLUSTER_CONFIRM_ROLES).toEqual(["aqau", "system_admin"]);
	});

	it("gates the AI drawer to aqau/vpaa/system_admin and the at-risk watchlist to its union", () => {
		expect(FEATURE_ACCESS.viewAiInsights).toEqual([
			"aqau",
			"vpaa",
			"system_admin",
		]);
		for (const role of ["aqau", "vpaa", "system_admin"]) {
			expect(() => assertCanReadAtRiskFlags(role)).not.toThrow();
		}
		// NOTE: faculty/chair keep the action-taken watchlist picker; dean and
		// the onboarding role stay out of both the table and the drawer.
		for (const role of ["faculty", "program_chair"]) {
			expect(() => assertCanReadAtRiskFlags(role)).not.toThrow();
		}
		for (const role of ["dean", "user"]) {
			expect(() => assertCanReadAtRiskFlags(role)).toThrow(
				RoleAccessForbiddenError,
			);
		}
		expect(() => assertCanReadAtRiskFlags(undefined)).toThrow(
			RoleAccessForbiddenError,
		);
	});
});
