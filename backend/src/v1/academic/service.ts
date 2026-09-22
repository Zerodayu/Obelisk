import { prisma } from "@lib/prisma";

export async function listPrograms() {
	return prisma.program.findMany({
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

export async function listClassSections(programId?: string, termId?: string) {
	return prisma.classSection.findMany({
		where: {
			...(programId ? { course: { programId } } : {}),
			...(termId ? { termId } : {}),
		},
		select: {
			id: true,
			sectionCode: true,
			course: { select: { id: true, code: true, title: true } },
			term: { select: { id: true, schoolYear: true, semester: true } },
			faculty: { select: { id: true, name: true } },
		},
		orderBy: [{ sectionCode: "asc" }],
	});
}
