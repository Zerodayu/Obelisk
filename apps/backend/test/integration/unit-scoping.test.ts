import { describe, expect, it } from "bun:test";
import { cached } from "@lib/cache";
import { prisma } from "@lib/prisma";
import {
	assertClassSectionInScope,
	assertSubmissionInScope,
	UnitScopeError,
	unitScopeForUser,
	unitScopeOf,
} from "@lib/unit-scope";
import { isDbReachable } from "@test/helpers/db-gate";
import {
	listClassSections,
	listDepartments,
	listPrograms,
} from "@v1/academic/service";
import { scopeWhere, submissionService } from "@v1/forms/service";

const db = await isDbReachable();

/**
 * Two departments, three programs — the whole point of unit scoping:
 *
 *   Dept A (US-A) → BSIT-A1, BSCS-A2      Dept B (US-B) → BSIT-B1
 *
 * Every assertion here answers "does an account of one unit ever see, read or
 * write the records of another unit?" — list narrowing (`lib/unit-scope.ts`
 * where-builders), a spoofed `?programId=` filter (intersect, never widen),
 * a foreign record id (403, not 404/empty), and `cached()` (per-unit key).
 */
const IDS = {
	deptA: "unit-scope-dept-a",
	deptB: "unit-scope-dept-b",
	progA1: "unit-scope-prog-a1",
	progA2: "unit-scope-prog-a2",
	progB1: "unit-scope-prog-b1",
	term: "unit-scope-term",
	courseA: "unit-scope-course-a",
	courseB: "unit-scope-course-b",
	sectionA: "unit-scope-section-a",
	sectionB: "unit-scope-section-b",
	studentA: "unit-scope-student-a",
	studentB: "unit-scope-student-b",
	facultyA: "unit-scope-faculty-a",
	chairA: "unit-scope-chair-a",
	deanA: "unit-scope-dean-a",
	facultyB: "unit-scope-faculty-b",
	deanB: "unit-scope-dean-b",
	admin: "unit-scope-admin",
	// A faculty account that filed no program — must fail closed to `own`.
	facultyUnbound: "unit-scope-faculty-unbound",
	type: "unit-scope-form-type",
};

/** Program-scoped / department-scoped sessions (better-auth session shape). */
const CALLER = {
	facultyA: { id: IDS.facultyA, role: "faculty", programId: IDS.progA1 },
	chairA: { id: IDS.chairA, role: "program_chair", programId: IDS.progA1 },
	deanA: { id: IDS.deanA, role: "dean", departmentId: IDS.deptA },
	facultyB: { id: IDS.facultyB, role: "faculty", programId: IDS.progB1 },
	deanB: { id: IDS.deanB, role: "dean", departmentId: IDS.deptB },
	admin: { id: IDS.admin, role: "system_admin" },
};

async function seed() {
	await prisma.department.createMany({
		data: [
			{ id: IDS.deptA, name: "Unit Scope Dept A", code: "US-A" },
			{ id: IDS.deptB, name: "Unit Scope Dept B", code: "US-B" },
		],
	});
	await prisma.program.createMany({
		data: [
			{ id: IDS.progA1, departmentId: IDS.deptA, name: "A1", code: "US-A1" },
			{ id: IDS.progA2, departmentId: IDS.deptA, name: "A2", code: "US-A2" },
			{ id: IDS.progB1, departmentId: IDS.deptB, name: "B1", code: "US-B1" },
		],
	});
	await prisma.academicTerm.create({
		data: {
			id: IDS.term,
			schoolYear: "2094-2095",
			semester: "1st",
			isActive: false,
		},
	});
	await prisma.user.createMany({
		data: [
			{
				id: IDS.facultyA,
				name: "Unit Faculty A",
				email: "unit-faculty-a@obelisk.local",
				role: "faculty",
				programId: IDS.progA1,
				departmentId: IDS.deptA,
				isActive: true,
			},
			{
				id: IDS.chairA,
				name: "Unit Chair A",
				email: "unit-chair-a@obelisk.local",
				role: "program_chair",
				programId: IDS.progA1,
				departmentId: IDS.deptA,
				isActive: true,
			},
			{
				id: IDS.deanA,
				name: "Unit Dean A",
				email: "unit-dean-a@obelisk.local",
				role: "dean",
				departmentId: IDS.deptA,
				isActive: true,
			},
			{
				id: IDS.facultyB,
				name: "Unit Faculty B",
				email: "unit-faculty-b@obelisk.local",
				role: "faculty",
				programId: IDS.progB1,
				departmentId: IDS.deptB,
				isActive: true,
			},
			{
				id: IDS.deanB,
				name: "Unit Dean B",
				email: "unit-dean-b@obelisk.local",
				role: "dean",
				departmentId: IDS.deptB,
				isActive: true,
			},
			{
				id: IDS.admin,
				name: "Unit Admin",
				email: "unit-admin@obelisk.local",
				role: "system_admin",
				isActive: true,
			},
			{
				id: IDS.facultyUnbound,
				name: "Unit Faculty Unbound",
				email: "unit-faculty-unbound@obelisk.local",
				role: "faculty",
				isActive: true,
			},
		],
	});
	await prisma.course.createMany({
		data: [
			{ id: IDS.courseA, programId: IDS.progA1, code: "US-101", title: "A" },
			{ id: IDS.courseB, programId: IDS.progB1, code: "US-102", title: "B" },
		],
	});
	await prisma.classSection.createMany({
		data: [
			{
				id: IDS.sectionA,
				courseId: IDS.courseA,
				termId: IDS.term,
				sectionCode: "UA",
				facultyId: IDS.facultyA,
			},
			{
				id: IDS.sectionB,
				courseId: IDS.courseB,
				termId: IDS.term,
				sectionCode: "UB",
				facultyId: IDS.facultyB,
			},
		],
	});
	await prisma.student.createMany({
		data: [
			{
				id: IDS.studentA,
				studentNumber: "US-0001",
				programId: IDS.progA1,
				firstName: "Unit",
				lastName: "StudentA",
				anonymizedId: "unit-scope-anon-a",
			},
			{
				id: IDS.studentB,
				studentNumber: "US-0002",
				programId: IDS.progB1,
				firstName: "Unit",
				lastName: "StudentB",
				anonymizedId: "unit-scope-anon-b",
			},
		],
	});
	// Reuse the registered `clo_raw_data` row when another suite owns it, so
	// `scope=visible` resolves the real approval chain (and cleanup only
	// deletes what this file created).
	const existing = await prisma.formType.findUnique({
		where: { code: "clo_raw_data" },
		select: { id: true },
	});
	if (!existing) {
		await prisma.formType.create({
			data: {
				id: IDS.type,
				code: "clo_raw_data",
				name: "Per-Student CLO Raw Data Sheet",
				pdcaStage: "DO",
				sequenceNo: 7,
			},
		});
	}
}

async function cleanup() {
	await prisma.formSubmission.deleteMany({
		where: { programId: { in: [IDS.progA1, IDS.progA2, IDS.progB1] } },
	});
	await prisma.formType.deleteMany({ where: { id: IDS.type } });
	await prisma.classSection.deleteMany({
		where: { id: { in: [IDS.sectionA, IDS.sectionB] } },
	});
	await prisma.student.deleteMany({
		where: { id: { in: [IDS.studentA, IDS.studentB] } },
	});
	await prisma.course.deleteMany({
		where: { id: { in: [IDS.courseA, IDS.courseB] } },
	});
	await prisma.user.deleteMany({
		where: {
			id: {
				in: [
					IDS.facultyA,
					IDS.chairA,
					IDS.deanA,
					IDS.facultyB,
					IDS.deanB,
					IDS.admin,
					IDS.facultyUnbound,
				],
			},
		},
	});
	await prisma.program.deleteMany({
		where: { id: { in: [IDS.progA1, IDS.progA2, IDS.progB1] } },
	});
	await prisma.department.deleteMany({
		where: { id: { in: [IDS.deptA, IDS.deptB] } },
	});
	await prisma.academicTerm.deleteMany({ where: { id: IDS.term } });
}

/** One submission per program, filed by that program's faculty member. */
async function createSubmissions() {
	const formType = await prisma.formType.findUniqueOrThrow({
		where: { code: "clo_raw_data" },
		select: { id: true },
	});
	const a = await submissionService.create(
		{
			formTypeId: formType.id,
			programId: IDS.progA1,
			classSectionId: IDS.sectionA,
			termId: IDS.term,
			formData: { note: "unit-a" },
		},
		IDS.facultyA,
	);
	const b = await submissionService.create(
		{
			formTypeId: formType.id,
			programId: IDS.progB1,
			classSectionId: IDS.sectionB,
			termId: IDS.term,
			formData: { note: "unit-b" },
		},
		IDS.facultyB,
	);
	return { a, b };
}

describe.skipIf(!db)("unit scoping (integration)", () => {
	it("narrows reference lists to the caller's department/program", async () => {
		await seed();
		try {
			// A dean lists its department's programs only — B1 is another
			// department's, facultyB's program.
			const deanAPrograms = await listPrograms(unitScopeOf(CALLER.deanA));
			expect(deanAPrograms.map((p) => p.id)).toContain(IDS.progA1);
			expect(deanAPrograms.map((p) => p.id)).toContain(IDS.progA2);
			expect(deanAPrograms.map((p) => p.id)).not.toContain(IDS.progB1);

			// A faculty member sees exactly its own program.
			const facultyAPrograms = await listPrograms(unitScopeOf(CALLER.facultyA));
			expect(facultyAPrograms.map((p) => p.id)).toEqual([IDS.progA1]);

			// A program-less faculty account fails closed to `own` → nothing.
			expect(
				await listPrograms(await unitScopeForUser(IDS.facultyUnbound)),
			).toEqual([]);

			// Departments: a dean sees its own department only; a program-
			// scoped chair sees the department carrying its program.
			const deanADepts = await listDepartments(unitScopeOf(CALLER.deanA));
			expect(deanADepts.map((d) => d.id)).toContain(IDS.deptA);
			expect(deanADepts.map((d) => d.id)).not.toContain(IDS.deptB);
			const chairADepts = await listDepartments(unitScopeOf(CALLER.chairA));
			expect(chairADepts.map((d) => d.id)).toEqual([IDS.deptA]);
		} finally {
			await cleanup();
		}
	}, 60000);

	it("refuses a spoofed foreign ?programId= instead of intersecting it", async () => {
		await seed();
		try {
			// Program-scoped caller naming another program → 403, not [].
			await expect(
				listClassSections(unitScopeOf(CALLER.facultyA), IDS.progB1),
			).rejects.toThrow(UnitScopeError);
			await expect(
				listClassSections(unitScopeOf(CALLER.deanA), IDS.progB1),
			).rejects.toThrow(UnitScopeError);
			// Own unit's program is accepted (dean → its program, chair → its own).
			const sections = await listClassSections(
				unitScopeOf(CALLER.deanA),
				IDS.progA2,
			);
			expect(sections).toEqual([]);
			await expect(
				listClassSections(unitScopeOf(CALLER.chairA), IDS.progA1),
			).resolves.toHaveLength(1);
			// An institution-wide role passes any filter.
			await expect(
				listClassSections(unitScopeOf(CALLER.admin), IDS.progB1),
			).resolves.toHaveLength(1);
		} finally {
			await cleanup();
		}
	}, 60000);

	it("keeps each unit's approval queues invisible to the other", async () => {
		await seed();
		try {
			const { a, b } = await createSubmissions();

			const chairAQueue = await submissionService.list(
				scopeWhere("visible", CALLER.chairA),
			);
			expect(chairAQueue.map((s) => s.id)).toContain(a.id);
			expect(chairAQueue.map((s) => s.id)).not.toContain(b.id);

			const chairBQueue = await submissionService.list(
				scopeWhere("visible", CALLER.facultyB),
			);
			expect(chairBQueue.map((s) => s.id)).toContain(b.id);
			expect(chairBQueue.map((s) => s.id)).not.toContain(a.id);

			// deanA is the next rung after the chair — still its own program only.
			const deanAQueue = await submissionService.list(
				scopeWhere("visible", CALLER.deanA),
			);
			expect(deanAQueue.map((s) => s.id)).toContain(a.id);
			expect(deanAQueue.map((s) => s.id)).not.toContain(b.id);

			// A spoofed program filter intersects the unit clause — it can only
			// return *less*, never another unit's rows.
			const spoofed = await submissionService.list({
				AND: [scopeWhere("visible", CALLER.chairA), { programId: IDS.progB1 }],
			});
			expect(spoofed).toEqual([]);

			// The institution role still sees both (no unit clause).
			const adminQueue = await submissionService.list(
				scopeWhere("visible", CALLER.admin),
			);
			const ids = adminQueue.map((s) => s.id);
			expect(ids).toContain(a.id);
			expect(ids).toContain(b.id);
		} finally {
			await cleanup();
		}
	}, 60000);

	it("403s a foreign record id instead of leaking or hiding it", async () => {
		await seed();
		try {
			const { a, b } = await createSubmissions();

			// Read paths: the record exists, it just is not this unit's.
			await expect(
				submissionService.getForViewer(b.id, CALLER.chairA),
			).rejects.toThrow(UnitScopeError);
			await expect(
				submissionService.evidence(b.id, CALLER.chairA),
			).rejects.toThrow(UnitScopeError);
			await expect(
				assertSubmissionInScope(unitScopeOf(CALLER.deanA), b.id),
			).rejects.toThrow(UnitScopeError);
			await expect(
				assertClassSectionInScope(unitScopeOf(CALLER.facultyA), IDS.sectionB),
			).rejects.toThrow(UnitScopeError);

			// Own unit's records read normally.
			await expect(
				submissionService.getForViewer(a.id, CALLER.chairA),
			).resolves.toMatchObject({ id: a.id });
			await expect(
				assertClassSectionInScope(unitScopeOf(CALLER.facultyA), IDS.sectionA),
			).resolves.toBeUndefined();

			// Write path: filing into another unit is refused outright.
			const formType = await prisma.formType.findUniqueOrThrow({
				where: { code: "clo_raw_data" },
				select: { id: true },
			});
			await expect(
				submissionService.create(
					{
						formTypeId: formType.id,
						programId: IDS.progB1,
						termId: IDS.term,
						formData: { note: "spoof" },
					},
					IDS.facultyA,
				),
			).rejects.toThrow(UnitScopeError);
			// …and an institution-level target (no program) is the institution
			// roles' business only.
			await expect(
				submissionService.create(
					{ formTypeId: formType.id, termId: IDS.term, formData: {} },
					IDS.facultyA,
				),
			).rejects.toThrow(UnitScopeError);
		} finally {
			await cleanup();
		}
	}, 60000);

	it("keys the response cache per unit and marks it private", async () => {
		// Same URL for everyone — only the session's unit may change the body.
		// (Unique per run so the entry below is a guaranteed MISS.)
		const url = `http://localhost/api/v1/programs?run=${crypto.randomUUID()}`;
		const handler = cached(30, async (ctx: { user: unknown }) => ({
			who: (ctx.user as { id?: string })?.id ?? "anon",
			unit: unitScopeOf(ctx.user),
		}));
		const ctxFor = (user?: unknown) => ({
			request: new Request(url),
			set: { status: 200, headers: {} as Record<string, string> },
			user,
		});

		const ctxA = ctxFor(CALLER.facultyA);
		const a = await handler(ctxA);
		const ctxB = ctxFor(CALLER.deanB);
		const b = await handler(ctxB);
		const anon = await handler(ctxFor(undefined));

		// Each caller gets its own unit's payload back (the key carries the
		// unit, so a warm entry for A can never be served to B or anon — B
		// must miss, not read A's line).
		expect(a.who).toBe(IDS.facultyA);
		expect(a.unit).toMatchObject({ kind: "program", programId: IDS.progA1 });
		expect(b.who).toBe(IDS.deanB);
		expect(b.unit).toMatchObject({
			kind: "department",
			departmentId: IDS.deptB,
		});
		expect(ctxB.set.headers["X-Cache"]).not.toBe("HIT");
		expect(anon.who).toBe("anon");
		expect(anon.unit).toEqual({ kind: "own", userId: "" });

		// Per-session/per-unit responses must not sit in a shared
		// browser or CDN cache across accounts.
		expect(ctxA.set.headers["Cache-Control"]).toMatch(/^private, max-age=30$/);
	}, 60000);
});
