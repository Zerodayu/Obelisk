import { describe, expect, it } from "bun:test";

import {
	aiRecommendationUnitWhere,
	atRiskFlagUnitWhere,
	classSectionUnitWhere,
	cloAttainmentUnitWhere,
	clusterEntryUnitWhere,
	clusterUnitWhere,
	courseUnitWhere,
	departmentUnitWhere,
	peoAttainmentUnitWhere,
	ploAttainmentUnitWhere,
	programUnitWhere,
	scopeCaller,
	studentUnitWhere,
	submissionUnitWhere,
	type UnitScope,
	UnitScopeError,
	unitCacheKey,
	unitScopeOf,
	uploadRecordUnitWhere,
} from "@lib/unit-scope";
import { REQUESTED_SCOPE } from "@v1/auth/model";

import { REQUESTED_SCOPE as FRONTEND_REQUESTED_SCOPE } from "../../../frontend/lib/roles";

// --- Fixtures ----------------------------------------------------------------

const PROGRAM = "unit-prog-bsit";
const OTHER_PROGRAM = "unit-prog-cs";
const DEPARTMENT = "unit-dept-cite";
const USER_ID = "unit-user-1";

/** A fully-scoped session user for each role (better-auth shape). */
function session(role: string, unit: Record<string, string> = {}) {
	return { id: USER_ID, role, ...unit };
}

const SCOPES = {
	institution: { kind: "institution", userId: USER_ID } as UnitScope,
	program: {
		kind: "program",
		userId: USER_ID,
		programId: PROGRAM,
	} as UnitScope,
	department: {
		kind: "department",
		userId: USER_ID,
		departmentId: DEPARTMENT,
	} as UnitScope,
	own: { kind: "own", userId: USER_ID } as UnitScope,
};

// --- Caller normalization ----------------------------------------------------

describe("scopeCaller", () => {
	it("defaults every missing field instead of widening", () => {
		expect(scopeCaller(undefined)).toEqual({
			id: "",
			role: "user",
			programId: null,
			departmentId: null,
		});
	});

	it("keeps session-derived unit fields verbatim", () => {
		expect(
			scopeCaller(session("faculty", { programId: PROGRAM })),
		).toMatchObject({
			role: "faculty",
			programId: PROGRAM,
			departmentId: null,
		});
	});
});

// --- Role → unit resolution --------------------------------------------------

describe("unitScopeOf", () => {
	it("scopes faculty and program_chair to their program", () => {
		for (const role of ["faculty", "program_chair"]) {
			expect(unitScopeOf(session(role, { programId: PROGRAM }))).toEqual({
				kind: "program",
				userId: USER_ID,
				programId: PROGRAM,
			});
		}
	});

	it("scopes a dean to its department", () => {
		expect(unitScopeOf(session("dean", { departmentId: DEPARTMENT }))).toEqual({
			kind: "department",
			userId: USER_ID,
			departmentId: DEPARTMENT,
		});
	});

	it("leaves institution-wide roles unscoped (onboarding `user` included)", () => {
		for (const role of ["aqau", "vpaa", "system_admin", "user"]) {
			expect(unitScopeOf(session(role)).kind).toBe("institution");
		}
	});

	it("fails closed when a scoped role has no unit on file", () => {
		// The unit is never taken from the request — a role request still
		// pending (or a program-less session) must see only its own rows.
		expect(unitScopeOf(session("faculty")).kind).toBe("own");
		expect(unitScopeOf(session("program_chair")).kind).toBe("own");
		expect(unitScopeOf(session("dean")).kind).toBe("own");
		expect(unitScopeOf(session("dean", { programId: PROGRAM })).kind).toBe(
			"own",
		);
	});

	it("fails closed for unknown roles and for no caller at all", () => {
		expect(unitScopeOf(session("superuser"))).toEqual({
			kind: "own",
			userId: USER_ID,
		});
		// No session user (auth flagged 401 but the handler still ran) never
		// inherits the `user` role's institution-wide read — it matches nothing.
		expect(unitScopeOf(undefined)).toEqual({ kind: "own", userId: "" });
		expect(unitScopeOf({ role: null })).toEqual({ kind: "own", userId: "" });
		expect(unitScopeOf({ role: "faculty", programId: PROGRAM })).toEqual({
			kind: "own",
			userId: "",
		});
	});

	it("never widens because a unit field claims to be institution-wide", () => {
		// Only the role decides institution access — a spoofed `programId`
		// cannot promote a faculty session.
		expect(unitScopeOf(session("faculty", { programId: "" })).kind).toBe("own");
		expect(unitScopeOf(session("dean", { programId: PROGRAM })).kind).toBe(
			"own",
		);
	});
});

// --- Role ↔ requested-scope mirror -------------------------------------------

describe("requested scope ↔ enforced unit", () => {
	it("enforces exactly the unit onboarding told the account to file", () => {
		for (const [role, scope] of Object.entries(REQUESTED_SCOPE)) {
			const unit = unitScopeOf(
				session(role, {
					...(scope === "program" ? { programId: PROGRAM } : {}),
					...(scope === "department" ? { departmentId: DEPARTMENT } : {}),
				}),
			);
			expect(unit.kind).toBe(scope);
		}
	});

	it("keeps the frontend onboarding selects in sync too", () => {
		expect(FRONTEND_REQUESTED_SCOPE).toEqual(REQUESTED_SCOPE);
	});
});

// --- Cache keys --------------------------------------------------------------

describe("unitCacheKey", () => {
	it("gives every unit a distinct fragment", () => {
		const keys = [
			unitCacheKey(SCOPES.institution),
			unitCacheKey(SCOPES.program),
			unitCacheKey({
				kind: "program",
				userId: USER_ID,
				programId: OTHER_PROGRAM,
			}),
			unitCacheKey(SCOPES.department),
			unitCacheKey(SCOPES.own),
			unitCacheKey({ kind: "own", userId: "" }),
		].join("|");
		expect(new Set(keys.split("|")).size).toBe(keys.split("|").length);
	});

	it("separates an unauthenticated caller from every unit", () => {
		expect(unitCacheKey({ kind: "own", userId: "" })).toBe("anon");
		expect(unitCacheKey(SCOPES.institution)).toBe("inst");
		expect(unitCacheKey(SCOPES.program)).toBe(`prog:${PROGRAM}`);
		expect(unitCacheKey(SCOPES.department)).toBe(`dept:${DEPARTMENT}`);
	});
});

// --- Where-builders ----------------------------------------------------------

describe("submissionUnitWhere", () => {
	it("is unrestricted for institution-wide roles", () => {
		expect(submissionUnitWhere(SCOPES.institution)).toEqual({});
	});

	it("includes own rows plus the unit (and unit-bound section fallbacks)", () => {
		expect(submissionUnitWhere(SCOPES.program)).toEqual({
			OR: [
				{ submittedByUserId: USER_ID },
				{ programId: PROGRAM },
				{
					AND: [
						{ programId: null },
						{ classSection: { course: { programId: PROGRAM } } },
					],
				},
			],
		});
		expect(submissionUnitWhere(SCOPES.department)).toEqual({
			OR: [
				{ submittedByUserId: USER_ID },
				{ program: { departmentId: DEPARTMENT } },
				{
					AND: [
						{ programId: null },
						{
							classSection: {
								course: { program: { departmentId: DEPARTMENT } },
							},
						},
					],
				},
			],
		});
	});

	it("narrows a unit-less scoped caller to its own rows only", () => {
		expect(submissionUnitWhere(SCOPES.own)).toEqual({
			submittedByUserId: USER_ID,
		});
	});
});

describe("reference / entity where-builders", () => {
	it("unscopable lists return nothing for a unit-less caller", () => {
		// Programs, departments, courses, PLO/PEO attainment and AI
		// recommendations carry no owner — `own` may not list them at all.
		for (const where of [
			programUnitWhere(SCOPES.own),
			departmentUnitWhere(SCOPES.own),
			courseUnitWhere(SCOPES.own),
			ploAttainmentUnitWhere(SCOPES.own),
			peoAttainmentUnitWhere(SCOPES.own),
			aiRecommendationUnitWhere(SCOPES.own),
		]) {
			expect(where).toEqual({ id: { in: [] } });
		}
	});

	it("programs: program → itself, department → its programs", () => {
		expect(programUnitWhere(SCOPES.program)).toEqual({ id: PROGRAM });
		expect(programUnitWhere(SCOPES.department)).toEqual({
			departmentId: DEPARTMENT,
		});
		expect(programUnitWhere(SCOPES.institution)).toEqual({});
	});

	it("departments: program → the carrier department, department → itself", () => {
		expect(departmentUnitWhere(SCOPES.program)).toEqual({
			programs: { some: { id: PROGRAM } },
		});
		expect(departmentUnitWhere(SCOPES.department)).toEqual({
			id: DEPARTMENT,
		});
	});

	it("class sections follow the course's program (own → taught sections)", () => {
		expect(classSectionUnitWhere(SCOPES.institution)).toEqual({});
		expect(classSectionUnitWhere(SCOPES.program)).toEqual({
			course: { programId: PROGRAM },
		});
		expect(classSectionUnitWhere(SCOPES.department)).toEqual({
			course: { program: { departmentId: DEPARTMENT } },
		});
		expect(classSectionUnitWhere(SCOPES.own)).toEqual({
			facultyId: USER_ID,
		});
	});

	it("students: unit program/department, own → enrolled in own sections", () => {
		expect(studentUnitWhere(SCOPES.institution)).toEqual({});
		expect(studentUnitWhere(SCOPES.program)).toEqual({ programId: PROGRAM });
		expect(studentUnitWhere(SCOPES.department)).toEqual({
			program: { departmentId: DEPARTMENT },
		});
		expect(studentUnitWhere(SCOPES.own)).toEqual({
			enrollments: { some: { classSection: { facultyId: USER_ID } } },
		});
	});

	it("CLO attainment covers the section's program and the student's program", () => {
		expect(cloAttainmentUnitWhere(SCOPES.program)).toEqual({
			OR: [
				{ classSection: { course: { programId: PROGRAM } } },
				{ student: { programId: PROGRAM } },
			],
		});
		expect(cloAttainmentUnitWhere(SCOPES.department)).toEqual({
			OR: [
				{
					classSection: { course: { program: { departmentId: DEPARTMENT } } },
				},
				{ student: { program: { departmentId: DEPARTMENT } } },
			],
		});
		expect(cloAttainmentUnitWhere(SCOPES.own)).toEqual({
			classSection: { facultyId: USER_ID },
		});
	});

	it("at-risk flags follow the flagged student's program", () => {
		expect(atRiskFlagUnitWhere(SCOPES.program)).toEqual({
			student: { programId: PROGRAM },
		});
		expect(atRiskFlagUnitWhere(SCOPES.department)).toEqual({
			student: { program: { departmentId: DEPARTMENT } },
		});
		expect(atRiskFlagUnitWhere(SCOPES.own)).toEqual({
			student: {
				enrollments: { some: { classSection: { facultyId: USER_ID } } },
			},
		});
	});

	it("AI recommendations: institution-wide rows stay institution-only", () => {
		expect(aiRecommendationUnitWhere(SCOPES.institution)).toEqual({});
		expect(aiRecommendationUnitWhere(SCOPES.program)).toEqual({
			programId: PROGRAM,
		});
		expect(aiRecommendationUnitWhere(SCOPES.own)).toEqual({ id: { in: [] } });
	});

	it("upload records hang off a class section for every scoped caller", () => {
		expect(uploadRecordUnitWhere(SCOPES.institution)).toEqual({});
		expect(uploadRecordUnitWhere(SCOPES.program)).toEqual({
			classSection: { course: { programId: PROGRAM } },
		});
		expect(uploadRecordUnitWhere(SCOPES.own)).toEqual({
			classSection: { facultyId: USER_ID },
		});
	});
});

// --- Pure membership (DB-backed paths are covered by integration tests) ------

describe("UnitScopeError", () => {
	it("is a 403 the global handler maps once", () => {
		const error = new UnitScopeError();
		expect(error.status).toBe(403);
		expect(error.name).toBe("UnitScopeError");
		expect(error.message).toMatch(/program or department/);
	});
});

// --- Graduation clusters -----------------------------------------------------

describe("clusterUnitWhere", () => {
	it("scopes a cluster to the caller's program or department", () => {
		expect(clusterUnitWhere(SCOPES.institution)).toEqual({});
		expect(clusterUnitWhere(SCOPES.program)).toEqual({ programId: PROGRAM });
		expect(clusterUnitWhere(SCOPES.department)).toEqual({
			program: { departmentId: DEPARTMENT },
		});
		// A unit-less scoped caller must never see another unit's clusters.
		expect(clusterUnitWhere(SCOPES.own)).toEqual({ id: { in: [] } });
	});

	it("scopes compiled entries through their cluster", () => {
		expect(clusterEntryUnitWhere(SCOPES.institution)).toEqual({});
		expect(clusterEntryUnitWhere(SCOPES.program)).toEqual({
			cluster: { programId: PROGRAM },
		});
		expect(clusterEntryUnitWhere(SCOPES.own)).toEqual({
			cluster: { id: { in: [] } },
		});
	});
});
