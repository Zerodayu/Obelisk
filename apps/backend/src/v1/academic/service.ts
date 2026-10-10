import { prisma } from "@lib/prisma";
import {
	assertProgramInScope,
	classSectionUnitWhere,
	departmentUnitWhere,
	programUnitWhere,
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
