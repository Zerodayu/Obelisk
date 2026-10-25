import { prisma } from "@lib/prisma";
import {
	assertProgramInScope,
	classSectionUnitWhere,
	departmentUnitWhere,
	programUnitWhere,
	studentUnitWhere,
	type UnitScope,
} from "@lib/unit-scope";

import type {
	CreateClassSection,
	CreateDepartment,
	CreateProgram,
} from "./model";

/**
 * Reference-data write errors — the controller maps `status` straight onto the
 * HTTP response (409 duplicate code, 404 unknown department).
 */
export class ReferenceDataError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "ReferenceDataError";
	}
}

/**
 * Reference lists are unit-scoped too (`lib/unit-scope.ts`): a faculty/chair
 * only gets its own program, a dean only the programs of its department, so a
 * scoped account cannot even enumerate another unit's offering. `terms` stay
 * institution-wide — the calendar is shared by every unit.
 */
export async function listPrograms(unit: UnitScope) {
	return prisma.program.findMany({
		where: programUnitWhere(unit),
		select: { id: true, code: true, name: true, departmentId: true },
		orderBy: { code: "asc" },
	});
}

export async function listDepartments(unit: UnitScope) {
	return prisma.department.findMany({
		where: departmentUnitWhere(unit),
		select: { id: true, code: true, name: true },
		orderBy: { code: "asc" },
	});
}

export async function listTerms() {
	return prisma.academicTerm.findMany({
		select: {
			id: true,
			schoolYear: true,
			semester: true,
			isActive: true,
			startDate: true,
			endDate: true,
		},
		orderBy: [{ schoolYear: "desc" }, { semester: "asc" }],
	});
}

/**
 * Students per year level, unit-scoped (`studentUnitWhere`). NULL yearLevel
 * (a student with no level on file) is reported as `null` rather than dropped,
 * so the client can show it instead of silently under-counting the roster.
 */
export async function listStudentYearLevels(unit: UnitScope) {
	const rows = await prisma.student.groupBy({
		by: ["yearLevel"],
		where: studentUnitWhere(unit),
		_count: { _all: true },
	});
	return rows.map((row) => ({
		yearLevel: row.yearLevel,
		studentCount: row._count._all,
	}));
}

/**
 * Assessment items per type across the caller's unit. `AssessmentItem` hangs
 * off a class section, so the unit filter is the section filter.
 */
export async function listAssessmentTypeCounts(unit: UnitScope) {
	const rows = await prisma.assessmentItem.groupBy({
		by: ["type"],
		where: { classSection: classSectionUnitWhere(unit) },
		_count: { _all: true },
	});
	return rows.map((row) => ({ type: row.type, itemCount: row._count._all }));
}

export async function listClassSections(
	unit: UnitScope,
	programId?: string,
	termId?: string,
) {
	// NOTE: a foreign `?programId=` is refused outright (403) rather than
	// silently intersected to an empty list — the caller is told it is not
	// theirs, and no unit filter below can ever be widened by it.
	if (programId) await assertProgramInScope(unit, programId);

	return prisma.classSection.findMany({
		where: {
			AND: [
				classSectionUnitWhere(unit),
				programId ? { course: { programId } } : {},
				termId ? { termId } : {},
			],
		},
		select: {
			id: true,
			sectionCode: true,
			// NOTE: programId rides on the course so the client can back-fill the
			// global program context from a picked section.
			course: {
				select: { id: true, code: true, title: true, programId: true },
			},
			term: { select: { id: true, schoolYear: true, semester: true } },
			faculty: { select: { id: true, name: true } },
		},
		orderBy: [{ sectionCode: "asc" }],
	});
}

// --- Reference-data writes (system admin) ----------------------------------

/**
 * Create a department. Codes are globally unique (`Department.code`), so a
 * duplicate is a 409; the controller has already gated the caller's role.
 */
export async function createDepartment(input: CreateDepartment) {
	const code = input.code.trim();
	const name = input.name.trim();
	if (!code || !name) {
		throw new ReferenceDataError("Department code and name are required.", 400);
	}

	const existing = await prisma.department.findUnique({
		where: { code },
		select: { id: true },
	});
	if (existing) {
		throw new ReferenceDataError(
			`Department code '${code}' already exists.`,
			409,
		);
	}

	return prisma.department.create({
		data: { id: crypto.randomUUID(), code, name },
		select: { id: true, code: true, name: true },
	});
}

/**
 * Create a program under a department. The department must exist (404) and the
 * program code is globally unique (409).
 */
export async function createProgram(input: CreateProgram) {
	const code = input.code.trim();
	const name = input.name.trim();
	if (!code || !name) {
		throw new ReferenceDataError("Program code and name are required.", 400);
	}

	const department = await prisma.department.findUnique({
		where: { id: input.departmentId },
		select: { id: true },
	});
	if (!department) {
		throw new ReferenceDataError(
			`Department '${input.departmentId}' not found.`,
			404,
		);
	}

	const existing = await prisma.program.findUnique({
		where: { code },
		select: { id: true },
	});
	if (existing) {
		throw new ReferenceDataError(`Program code '${code}' already exists.`, 409);
	}

	return prisma.program.create({
		data: {
			id: crypto.randomUUID(),
			code,
			name,
			departmentId: input.departmentId,
		},
		select: { id: true, code: true, name: true, departmentId: true },
	});
}

// --- Class sections (capture roles, own program) -----------------------------

const CLASS_SECTION_SELECT = {
	id: true,
	sectionCode: true,
	course: { select: { id: true, code: true, title: true, programId: true } },
	term: { select: { id: true, schoolYear: true, semester: true } },
	faculty: { select: { id: true, name: true } },
} as const;

const TERM_SELECT = { id: true, schoolYear: true, semester: true } as const;

/** The term an explicit `termId` names, or 404. */
async function resolveTerm(termId: string) {
	const term = await prisma.academicTerm.findUnique({
		where: { id: termId },
		select: TERM_SELECT,
	});
	if (!term) throw new ReferenceDataError(`Term '${termId}' not found.`, 404);
	return term;
}

/**
 * The term new sections attach to. Mirrors `scripts/db-inject.ts`: use the
 * active term; on a brand-new DB (none active) create/activate the current
 * school year's first semester so the first faculty can upload.
 */
async function resolveActiveTerm() {
	const active = await prisma.academicTerm.findFirst({
		where: { isActive: true },
		select: TERM_SELECT,
	});
	if (active) return active;

	const currentYear = new Date().getFullYear();
	const schoolYear = `${currentYear}-${currentYear + 1}`;
	const semester = "1st Semester";
	// NOTE: upsert is race-safe on the (schoolYear, semester) unique when two
	// first-run creates land at once.
	return prisma.academicTerm.upsert({
		where: { schoolYear_semester: { schoolYear, semester } },
		create: { id: crypto.randomUUID(), schoolYear, semester, isActive: true },
		update: { isActive: true },
		select: TERM_SELECT,
	});
}

/**
 * Create a class section, creating its course/CLOs when they don't exist yet.
 *
 * Unit scope: a faculty/chair can only name its own program (a foreign
 * `programId` is refused with 403 by `assertProgramInScope`); a system_admin
 * must name one. Writes run in one transaction so a duplicate section never
 * leaves an orphan course/CLOs behind. A faculty member is recorded as the
 * section's faculty; a chair/admin leaves it unassigned (program scope governs
 * visibility — same as the inject script).
 */
export async function createClassSection(
	unit: UnitScope,
	input: CreateClassSection,
	actor: { id: string; role: string },
) {
	const programId = input.programId ?? unit.programId;
	if (!programId) {
		throw new ReferenceDataError(
			"A program is required to create a section.",
			400,
		);
	}
	await assertProgramInScope(unit, programId);

	const sectionCode = input.sectionCode.trim();
	const courseCode = input.courseCode.trim();
	if (!sectionCode || !courseCode) {
		throw new ReferenceDataError(
			"Section code and course code are required.",
			400,
		);
	}

	const term = input.termId
		? await resolveTerm(input.termId)
		: await resolveActiveTerm();

	// NOTE: normalized up front so blank rows are rejected before any write.
	const clos = (input.clos ?? []).map((clo) => ({
		code: clo.code.trim(),
		description: clo.description.trim(),
	}));
	if (clos.some((clo) => !clo.code || !clo.description)) {
		throw new ReferenceDataError(
			"Every CLO needs a code and a description.",
			400,
		);
	}

	return prisma.$transaction(async (tx) => {
		let course = await tx.course.findUnique({
			where: { programId_code: { programId, code: courseCode } },
			select: { id: true, code: true },
		});
		if (!course) {
			const title = input.courseTitle?.trim();
			if (!title) {
				throw new ReferenceDataError(
					`Course '${courseCode}' does not exist — add a title to create it.`,
					400,
				);
			}
			course = await tx.course.create({
				data: {
					id: crypto.randomUUID(),
					programId,
					code: courseCode,
					title,
				},
				select: { id: true, code: true },
			});
		}

		// NOTE: an upload can only produce attainment for CLOs the course
		// defines, so a CLO-less course is refused here (no silent empty upload).
		const existingClos = await tx.clo.count({ where: { courseId: course.id } });
		if (existingClos === 0 && clos.length === 0) {
			throw new ReferenceDataError(
				`Course '${courseCode}' has no CLOs — add at least one.`,
				400,
			);
		}
		for (const clo of clos) {
			const exists = await tx.clo.findFirst({
				where: { courseId: course.id, code: clo.code },
				select: { id: true },
			});
			if (!exists) {
				await tx.clo.create({
					data: {
						id: crypto.randomUUID(),
						courseId: course.id,
						code: clo.code,
						description: clo.description,
					},
				});
			}
		}

		const duplicate = await tx.classSection.findUnique({
			where: {
				courseId_termId_sectionCode: {
					courseId: course.id,
					termId: term.id,
					sectionCode,
				},
			},
			select: { id: true },
		});
		if (duplicate) {
			throw new ReferenceDataError(
				`Section '${sectionCode}' already exists for ${courseCode} in ${term.schoolYear} ${term.semester}.`,
				409,
			);
		}

		return tx.classSection.create({
			data: {
				id: crypto.randomUUID(),
				courseId: course.id,
				termId: term.id,
				sectionCode,
				facultyId: actor.role === "faculty" ? actor.id : null,
			},
			select: CLASS_SECTION_SELECT,
		});
	});
}
