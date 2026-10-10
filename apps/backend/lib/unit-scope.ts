import { prisma } from "@lib/prisma";
import type { Prisma } from "@prisma/generated/prisma/client";

/**
 * Unit scope — **which program/department a caller may see**.
 *
 * `lib/role-access.ts` answers "may this role do X?"; this module answers
 * "whose rows is it allowed to touch?". Every read of program/department data
 * (submissions, class sections, students, attainment, at-risk flags, the
 * program/department lists themselves) is narrowed through the helpers below so
 * a `faculty`/`program_chair` only ever sees its own program and a `dean` only
 * ever sees the programs of its department. Institution-wide roles
 * (aqau/vpaa/system_admin) are unscoped.
 *
 * The scope is **session-derived** (`user.program_id` / `user.department_id`,
 * written when a role request is filed) — a client can never claim another
 * unit by sending a `?programId=` parameter: those filters are intersected with
 * (never trusted over) the caller's scope.
 *
 * Mirrors the backend `REQUESTED_SCOPE` in `src/v1/auth/model.ts` — keep the
 * role → unit mapping in sync (guarded by `test/unit/unit-scope.test.ts`).
 */

/** Roles that are deliberately institution-wide (no unit of their own). */
const INSTITUTIONAL_ROLES = new Set(["aqau", "vpaa", "system_admin", "user"]);

/**
 * The minimum a caller looks like for scope resolution — a better-auth session
 * user (`role`/`programId`/`departmentId` are `additionalFields`) or a plain
 * `{ id, role }` object.
 */
export interface ScopeCaller {
	id?: string;
	role?: string | null;
	programId?: string | null;
	departmentId?: string | null;
}

/**
 * Normalize a session user (or anything shaped like one — including the
 * `undefined` Elysia leaves behind when the auth macro rejected the request)
 * into a scope caller. Missing values fail closed: no id, no unit.
 */
export interface NormalizedCaller {
	id: string;
	role: string;
	programId: string | null;
	departmentId: string | null;
}

export function scopeCaller(user: unknown): NormalizedCaller {
	const u = (user ?? {}) as ScopeCaller;
	return {
		id: u.id ?? "",
		role: u.role ?? "user",
		programId: u.programId ?? null,
		departmentId: u.departmentId ?? null,
	};
}

/**
 * The narrowest unit a caller operates in.
 *
 * - `institution` — aqau/vpaa/system_admin (and pre-onboarding `user`
 *   accounts, which only reach reference data while filing a role request).
 * - `program` — faculty/program_chair with a program on file.
 * - `department` — dean with a department on file.
 * - `own` — **fail-closed default**: a scoped role without its unit on file
 *   (or an unknown role) sees only the rows it owns, never another unit.
 */
export interface UnitScope {
	kind: "institution" | "program" | "department" | "own";
	/** The caller's user id — owner exemptions and the `own` filter. */
	userId: string;
	programId?: string;
	departmentId?: string;
}

/** Resolve a caller's unit scope from its session fields (never spoofable). */
export function unitScopeOf(caller: unknown): UnitScope {
	const { id, role, programId, departmentId } = scopeCaller(caller);
	// NOTE: no session user at all (`undefined` — some auth macros flag 401
	// without halting the handler) must NOT inherit the institution-wide
	// `user` default below: it matches nothing, so an unauthenticated call
	// can never read unscoped rows. A real onboarding account carries an id.
	if (!id) return { kind: "own", userId: "" };
	if (role === "faculty" || role === "program_chair") {
		return programId
			? { kind: "program", userId: id, programId }
			: { kind: "own", userId: id };
	}
	if (role === "dean") {
		return departmentId
			? { kind: "department", userId: id, departmentId }
			: { kind: "own", userId: id };
	}
	// NOTE: unknown/future roles fail closed (`own`), only the explicitly
	// institution-wide roles get an unscoped read.
	if (INSTITUTIONAL_ROLES.has(role)) {
		return { kind: "institution", userId: id };
	}
	return { kind: "own", userId: id };
}

/**
 * Stable per-unit cache key fragment. `lib/cache.ts` folds this into its key
 * so two units can never be served each other's cached response (and an
 * unauthenticated caller keys separately from any unit).
 */
export function unitCacheKey(unit: UnitScope): string {
	switch (unit.kind) {
		case "institution":
			return "inst";
		case "program":
			return `prog:${unit.programId}`;
		case "department":
			return `dept:${unit.departmentId}`;
		default:
			return unit.userId ? `own:${unit.userId}` : "anon";
	}
}

/** 403 — the record exists but belongs to another unit. */
export class UnitScopeError extends Error {
	readonly status = 403;

	constructor(
		message = "This record belongs to another program or department",
	) {
		super(message);
		this.name = "UnitScopeError";
	}
}

/** `own` has no rows at all — used for reference tables it may not list. */
function nothing<T>(): T {
	return { id: { in: [] } } as T;
}

// --- Where-builders (pure — no DB round-trip) --------------------------------

/**
 * Which `form_submission` rows belong to `unit`.
 *
 * A row's unit is its `programId`; when that is null (section-bound captures)
 * it falls back to the section's course program. The caller's own submissions
 * are always included so `scope=mine` and drafts never disappear.
 */
export function submissionUnitWhere(
	unit: UnitScope,
): Prisma.FormSubmissionWhereInput {
	switch (unit.kind) {
		case "institution":
			return {};
		case "program":
			return {
				OR: [
					{ submittedByUserId: unit.userId },
					{ programId: unit.programId },
					{
						AND: [
							{ programId: null },
							{ classSection: { course: { programId: unit.programId } } },
						],
					},
				],
			};
		case "department":
			return {
				OR: [
					{ submittedByUserId: unit.userId },
					{ program: { departmentId: unit.departmentId } },
					{
						AND: [
							{ programId: null },
							{
								classSection: {
									course: { program: { departmentId: unit.departmentId } },
								},
							},
						],
					},
				],
			};
		default:
			return { submittedByUserId: unit.userId };
	}
}

/** Which `class_section` rows belong to `unit`. */
export function classSectionUnitWhere(
	unit: UnitScope,
): Prisma.ClassSectionWhereInput {
	switch (unit.kind) {
		case "institution":
			return {};
		case "program":
			return { course: { programId: unit.programId } };
		case "department":
			return { course: { program: { departmentId: unit.departmentId } } };
		default:
			return { facultyId: unit.userId };
	}
}

/** Which `program` rows `unit` may list. */
export function programUnitWhere(unit: UnitScope): Prisma.ProgramWhereInput {
	switch (unit.kind) {
		case "institution":
			return {};
		case "program":
			return { id: unit.programId };
		case "department":
			return { departmentId: unit.departmentId };
		default:
			return nothing<Prisma.ProgramWhereInput>();
	}
}

/** Which `department` rows `unit` may list. */
export function departmentUnitWhere(
	unit: UnitScope,
): Prisma.DepartmentWhereInput {
	switch (unit.kind) {
		case "institution":
			return {};
		case "program":
			// The department that carries the caller's program.
			return { programs: { some: { id: unit.programId } } };
		case "department":
			return { id: unit.departmentId };
		default:
			return nothing<Prisma.DepartmentWhereInput>();
	}
}

/** Which `course` rows belong to `unit`. */
export function courseUnitWhere(unit: UnitScope): Prisma.CourseWhereInput {
	switch (unit.kind) {
		case "institution":
			return {};
		case "program":
			return { programId: unit.programId };
		case "department":
			return { program: { departmentId: unit.departmentId } };
		default:
			return nothing<Prisma.CourseWhereInput>();
	}
}

/** Which `student` rows belong to `unit`. */
export function studentUnitWhere(unit: UnitScope): Prisma.StudentWhereInput {
	switch (unit.kind) {
		case "institution":
			return {};
		case "program":
			return { programId: unit.programId };
		case "department":
			return { program: { departmentId: unit.departmentId } };
		default:
			// No program on file → only students in the caller's own sections.
			return {
				enrollments: {
					some: { classSection: { facultyId: unit.userId } },
				},
			};
	}
}

/** Which `clo_attainment` rows belong to `unit` (section's program, or the row's own program). */
export function cloAttainmentUnitWhere(
	unit: UnitScope,
): Prisma.CloAttainmentWhereInput {
	switch (unit.kind) {
		case "institution":
			return {};
		case "program":
			return {
				OR: [
					{ classSection: { course: { programId: unit.programId } } },
					{ student: { programId: unit.programId } },
				],
			};
		case "department":
			return {
				OR: [
					{
						classSection: {
							course: { program: { departmentId: unit.departmentId } },
						},
					},
					{ student: { program: { departmentId: unit.departmentId } } },
				],
			};
		default:
			return { classSection: { facultyId: unit.userId } };
	}
}

/** Which `at_risk_flag` rows belong to `unit` (the flagged student's program). */
export function atRiskFlagUnitWhere(
	unit: UnitScope,
): Prisma.AtRiskFlagWhereInput {
	switch (unit.kind) {
		case "institution":
			return {};
		case "program":
			return { student: { programId: unit.programId } };
		case "department":
			return { student: { program: { departmentId: unit.departmentId } } };
		default:
			return {
				student: {
					enrollments: { some: { classSection: { facultyId: unit.userId } } },
				},
			};
	}
}

/** Which `plo_attainment` rows belong to `unit`. */
export function ploAttainmentUnitWhere(
	unit: UnitScope,
): Prisma.PloAttainmentWhereInput {
	switch (unit.kind) {
		case "institution":
			return {};
		case "program":
			return { programId: unit.programId };
		case "department":
			return { program: { departmentId: unit.departmentId } };
		default:
			return nothing<Prisma.PloAttainmentWhereInput>();
	}
}

/** Which `peo_attainment` rows belong to `unit`. */
export function peoAttainmentUnitWhere(
	unit: UnitScope,
): Prisma.PeoAttainmentWhereInput {
	switch (unit.kind) {
		case "institution":
			return {};
		case "program":
			return { programId: unit.programId };
		case "department":
			return { program: { departmentId: unit.departmentId } };
		default:
			return nothing<Prisma.PeoAttainmentWhereInput>();
	}
}

/** Which `graduation_cluster` rows belong to `unit` (via the cluster's program). */
export function clusterUnitWhere(
	unit: UnitScope,
): Prisma.GraduationClusterWhereInput {
	switch (unit.kind) {
		case "institution":
			return {};
		case "program":
			return { programId: unit.programId };
		case "department":
			return { program: { departmentId: unit.departmentId } };
		default:
			return nothing<Prisma.GraduationClusterWhereInput>();
	}
}

/** Which `graduation_cluster_entry` rows belong to `unit` (via the cluster). */
export function clusterEntryUnitWhere(
	unit: UnitScope,
): Prisma.GraduationClusterEntryWhereInput {
	switch (unit.kind) {
		case "institution":
			return {};
		default:
			return { cluster: clusterUnitWhere(unit) };
	}
}

/** Which `ai_recommendation` rows belong to `unit` (program-less rows are institution-wide). */
export function aiRecommendationUnitWhere(
	unit: UnitScope,
): Prisma.AiRecommendationWhereInput {
	switch (unit.kind) {
		case "institution":
			return {};
		case "program":
			return { programId: unit.programId };
		case "department":
			return { program: { departmentId: unit.departmentId } };
		default:
			return nothing<Prisma.AiRecommendationWhereInput>();
	}
}

/** Which `upload_record` rows belong to `unit` (they hang off a class section). */
export function uploadRecordUnitWhere(
	unit: UnitScope,
): Prisma.UploadRecordWhereInput {
	switch (unit.kind) {
		case "institution":
			return {};
		default:
			return { classSection: classSectionUnitWhere(unit) };
	}
}

// --- Membership asserts (one small lookup each) ------------------------------

/** The program a submission belongs to — its own program, else its section's. */
async function submissionProgramId(
	submissionId: string,
): Promise<{ programId: string | null; ownerUserId: string | null } | null> {
	const row = await prisma.formSubmission.findUnique({
		where: { id: submissionId },
		select: {
			programId: true,
			submittedByUserId: true,
			classSection: { select: { course: { select: { programId: true } } } },
		},
	});
	if (!row) return null;
	return {
		programId: row.programId ?? row.classSection?.course.programId ?? null,
		ownerUserId: row.submittedByUserId,
	};
}

/** Is `programId` inside `unit`? (no program ⇒ institution-only) */
export async function programInScope(
	unit: UnitScope,
	programId: string | null | undefined,
): Promise<boolean> {
	if (unit.kind === "institution") return true;
	if (!programId) return false;
	if (unit.kind === "own") return false;
	if (unit.kind === "program") return unit.programId === programId;
	const owned = await prisma.program.findFirst({
		where: { id: programId, departmentId: unit.departmentId },
		select: { id: true },
	});
	return !!owned;
}

/**
 * Throws `UnitScopeError` (403) unless `programId` names a program inside
 * `unit` — used for an explicitly client-supplied `?programId=`/`programId`
 * filter, which must never widen a caller beyond its own unit.
 */
export async function assertProgramInScope(
	unit: UnitScope,
	programId: string | null | undefined,
): Promise<void> {
	if (await programInScope(unit, programId)) return;
	throw new UnitScopeError();
}

/**
 * Throws `UnitScopeError` (403) unless a write target (`programId`, or the
 * program derived from a bound `classSectionId`) is inside the caller's unit.
 * Institution-level targets — no program at all — are the institution roles'
 * business only.
 */
export async function assertTargetInScope(
	unit: UnitScope,
	target: { programId?: string | null; classSectionId?: string | null },
): Promise<void> {
	if (unit.kind === "institution") return;
	let programId = target.programId ?? null;
	if (!programId && target.classSectionId) {
		const section = await prisma.classSection.findUnique({
			where: { id: target.classSectionId },
			select: { course: { select: { programId: true } } },
		});
		programId = section?.course.programId ?? null;
	}
	if (await programInScope(unit, programId)) return;
	throw new UnitScopeError();
}

/**
 * Throws `UnitScopeError` (403) unless the submission (read or write) is
 * inside the caller's unit. The owner always passes — a record you filed is
 * yours even if it predates your current scope.
 */
export async function assertSubmissionInScope(
	unit: UnitScope,
	submissionId: string,
): Promise<void> {
	if (unit.kind === "institution") return;
	const row = await submissionProgramId(submissionId);
	if (!row) return; // unknown id — the caller gets the usual 404 from the read
	if (row.ownerUserId && row.ownerUserId === unit.userId) return;
	if (await programInScope(unit, row.programId)) return;
	throw new UnitScopeError();
}

/** Throws `UnitScopeError` (403) unless the class section is inside `unit`. */
export async function assertClassSectionInScope(
	unit: UnitScope,
	classSectionId: string,
): Promise<void> {
	if (unit.kind === "institution") return;
	const section = await prisma.classSection.findUnique({
		where: { id: classSectionId },
		select: {
			facultyId: true,
			course: { select: { programId: true } },
		},
	});
	if (!section) return; // unknown id — the caller gets the usual 404
	if (unit.kind === "own") {
		if (section.facultyId === unit.userId) return;
		throw new UnitScopeError();
	}
	if (await programInScope(unit, section.course.programId)) return;
	throw new UnitScopeError();
}

/**
 * Resolve the unit scope of an **authenticated user id** straight from the DB
 * rather than the session — for service methods that only receive `userId`
 * (`submissionService.create/update/submit/decide/archive`). Reading the row
 * (not trusting a caller-supplied program) keeps the unit session-derived even
 * at these write choke points.
 *
 * Unknown users fail closed to `own("")`, which matches nothing.
 */
export async function unitScopeForUser(userId: string): Promise<UnitScope> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, role: true, programId: true, departmentId: true },
	});
	if (!user) return { kind: "own", userId: "" };
	return unitScopeOf(user);
}
