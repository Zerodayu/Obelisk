import { prisma } from "@lib/prisma";
import {
	assertProgramInScope,
	classSectionUnitWhere,
	departmentUnitWhere,
	programUnitWhere,
	studentUnitWhere,
	type UnitScope,
} from "@lib/unit-scope";

/**
 * Reference lists are unit-scoped too (`lib/unit-scope.ts`): a faculty/chair
 * only gets its own program, a dean only the programs of its department, so a
 * scoped account cannot even enumerate another unit's offering. `terms` stay
 * institution-wide — the calendar is shared by every unit.
 */
export async function listPrograms(unit: UnitScope) {
	return prisma.program.findMany({
		where: programUnitWhere(unit),
		select: { id: true, code: true, name: true },
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
