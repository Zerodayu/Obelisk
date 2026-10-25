import { describe, expect, it } from "bun:test";

import { prisma } from "@lib/prisma";
import { UnitScopeError, unitScopeOf } from "@lib/unit-scope";
import { isDbReachable } from "@test/helpers/db-gate";
import { createClassSection, ReferenceDataError } from "@v1/academic/service";

const db = await isDbReachable();

/**
 * Section creation covers the production bootstrap gap: capture roles must be
 * able to bring a section (and a new course's CLOs) into existence before a
 * class-record upload can bind to it. Exercises the service directly — the
 * controller only adds the role gate.
 */
const IDS = {
	deptA: "acad-create-dept-a",
	deptB: "acad-create-dept-b",
	progA: "acad-create-prog-a",
	progB: "acad-create-prog-b",
	term: "acad-create-term",
	facultyA: "acad-create-faculty-a",
	admin: "acad-create-admin",
	type: "acad-create-form-type",
};

const FACULTY_A = {
	id: IDS.facultyA,
	role: "faculty",
	programId: IDS.progA,
};
const ADMIN = { id: IDS.admin, role: "system_admin" };

async function seed() {
	await cleanup();
	await prisma.department.createMany({
		data: [
			{
				id: IDS.deptA,
				name: "Academic Create Dept A",
				code: "ACAD-A",
			},
			{
				id: IDS.deptB,
				name: "Academic Create Dept B",
				code: "ACAD-B",
			},
		],
	});
	await prisma.program.createMany({
		data: [
			{
				id: IDS.progA,
				departmentId: IDS.deptA,
				name: "Academic Create A",
				code: "ACAD-A1",
			},
			{
				id: IDS.progB,
				departmentId: IDS.deptB,
				name: "Academic Create B",
				code: "ACAD-B1",
			},
		],
	});
	// NOTE: inactive so the suite's real active term is never touched.
	await prisma.academicTerm.create({
		data: {
			id: IDS.term,
			schoolYear: "2098-2099",
			semester: "Test Semester",
			isActive: false,
		},
	});
	await prisma.user.createMany({
		data: [
			{
				id: IDS.facultyA,
				name: "Academic Faculty A",
				email: "acad-faculty-a@obelisk.local",
				role: "faculty",
				programId: IDS.progA,
				departmentId: IDS.deptA,
				isActive: true,
			},
			{
				id: IDS.admin,
				name: "Academic Admin",
				email: "acad-admin@obelisk.local",
				role: "system_admin",
				isActive: true,
			},
		],
	});
}

async function cleanup() {
	// Programs cascade courses → CLOs → sections, so one delete clears the tree.
	await prisma.user.deleteMany({
		where: { id: { in: [IDS.facultyA, IDS.admin] } },
	});
	await prisma.program.deleteMany({
		where: { id: { in: [IDS.progA, IDS.progB] } },
	});
	await prisma.department.deleteMany({
		where: { id: { in: [IDS.deptA, IDS.deptB] } },
	});
	await prisma.academicTerm.deleteMany({ where: { id: IDS.term } });
}

/** Run + capture an expected `ReferenceDataError` status. */
async function failureStatus(fn: () => Promise<unknown>): Promise<number> {
	const error = await fn().catch((cause) => cause);
	expect(error).toBeInstanceOf(ReferenceDataError);
	return (error as ReferenceDataError).status;
}

describe.skipIf(!db)("class-section creation (integration)", () => {
	it("faculty creates a section with its new course and CLOs", async () => {
		await seed();
		try {
			const section = await createClassSection(
				unitScopeOf(FACULTY_A),
				{
					sectionCode: "1A",
					courseCode: "AC 101",
					courseTitle: "Academic Create Course",
					termId: IDS.term,
					clos: [
						{ code: "CLO1", description: "First outcome" },
						{ code: "CLO2", description: "Second outcome" },
					],
				},
				FACULTY_A,
			);

			expect(section.course.programId).toBe(IDS.progA);
			expect(section.term.id).toBe(IDS.term);
			expect(section.faculty?.id).toBe(IDS.facultyA);
			expect(section.sectionCode).toBe("1A");

			const course = await prisma.course.findUniqueOrThrow({
				where: { id: section.course.id },
				select: { clos: { select: { code: true }, orderBy: { code: "asc" } } },
			});
			expect(course.clos.map((clo) => clo.code)).toEqual(["CLO1", "CLO2"]);
		} finally {
			await cleanup();
		}
	}, 60000);

	it("reuses an existing course and leaves its CLOs unchanged", async () => {
		await seed();
		try {
			const first = await createClassSection(
				unitScopeOf(FACULTY_A),
				{
					sectionCode: "1A",
					courseCode: "AC 101",
					courseTitle: "Academic Create Course",
					termId: IDS.term,
					clos: [{ code: "CLO1", description: "First outcome" }],
				},
				FACULTY_A,
			);

			const second = await createClassSection(
				unitScopeOf(FACULTY_A),
				{
					sectionCode: "1B",
					courseCode: "AC 101",
					courseTitle: "Ignored title",
					termId: IDS.term,
					clos: [{ code: "CLO1", description: "Changed description" }],
				},
				FACULTY_A,
			);

			expect(second.course.id).toBe(first.course.id);
			const course = await prisma.course.findUniqueOrThrow({
				where: { id: first.course.id },
				select: {
					title: true,
					clos: { select: { code: true, description: true } },
				},
			});
			expect(course.title).toBe("Academic Create Course");
			expect(course.clos).toEqual([
				{ code: "CLO1", description: "First outcome" },
			]);
		} finally {
			await cleanup();
		}
	}, 60000);

	it("refuses a section for another program", async () => {
		await seed();
		try {
			await expect(
				createClassSection(
					unitScopeOf(FACULTY_A),
					{
						sectionCode: "1A",
						courseCode: "AC 101",
						courseTitle: "Foreign",
						programId: IDS.progB,
						termId: IDS.term,
						clos: [{ code: "CLO1", description: "First outcome" }],
					},
					FACULTY_A,
				),
			).rejects.toThrow(UnitScopeError);
		} finally {
			await cleanup();
		}
	}, 60000);

	it("refuses a course with no CLOs", async () => {
		await seed();
		try {
			const course = await prisma.course.create({
				data: {
					id: crypto.randomUUID(),
					programId: IDS.progA,
					code: "AC 102",
					title: "Existing Course",
				},
			});

			const status = await failureStatus(() =>
				createClassSection(
					unitScopeOf(FACULTY_A),
					{
						sectionCode: "1A",
						courseCode: course.code,
						termId: IDS.term,
					},
					FACULTY_A,
				),
			);
			expect(status).toBe(400);
		} finally {
			await cleanup();
		}
	}, 60000);

	it("refuses a duplicate section and a missing admin program", async () => {
		await seed();
		try {
			const input = {
				sectionCode: "1A",
				courseCode: "AC 101",
				courseTitle: "Academic Create Course",
				termId: IDS.term,
				clos: [{ code: "CLO1", description: "First outcome" }],
			};
			await createClassSection(unitScopeOf(FACULTY_A), input, FACULTY_A);

			const duplicate = await failureStatus(() =>
				createClassSection(unitScopeOf(FACULTY_A), input, FACULTY_A),
			);
			expect(duplicate).toBe(409);

			const missingProgram = await failureStatus(() =>
				createClassSection(
					unitScopeOf(ADMIN),
					{ sectionCode: "2A", courseCode: "AC 103", termId: IDS.term },
					ADMIN,
				),
			);
			expect(missingProgram).toBe(400);
		} finally {
			await cleanup();
		}
	}, 60000);

	it("lets an admin create a section in any program", async () => {
		await seed();
		try {
			const section = await createClassSection(
				unitScopeOf(ADMIN),
				{
					sectionCode: "1A",
					courseCode: "AC 201",
					courseTitle: "Admin Course",
					programId: IDS.progB,
					termId: IDS.term,
					clos: [{ code: "CLO1", description: "First outcome" }],
				},
				ADMIN,
			);

			expect(section.course.programId).toBe(IDS.progB);
			// NOTE: admin-created sections stay unassigned (program scope governs).
			expect(section.faculty).toBeNull();
		} finally {
			await cleanup();
		}
	}, 60000);
});
