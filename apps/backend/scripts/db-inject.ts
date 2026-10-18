import { prisma } from "@lib/prisma";
import { z } from "zod";

/* NOTE: additive injection of departments / programs / sections from a JSON
 * file (`just db-inject <file>`). Upserts only — never deletes — so it is
 * safe against the deployed `obelisk` DB: onboarding users need real
 * departments/programs to pick. See scripts/inject.example.json for the shape.
 * NOTE: `just db-seed` wipes departments CITE/TEST-DEPT and their programs,
 * and `just test` truncates the whole dev DB — dev rows don't survive either. */

const Schema = z.object({
	term: z
		.object({
			schoolYear: z.string(),
			semester: z.string(),
		})
		.optional(),
	departments: z
		.array(z.object({ code: z.string().min(1), name: z.string().min(1) }))
		.default([]),
	programs: z
		.array(
			z.object({
				code: z.string().min(1),
				name: z.string().min(1),
				department: z.string().min(1),
			}),
		)
		.default([]),
	sections: z
		.array(
			z.object({
				code: z.string().min(1),
				program: z.string().min(1),
				course: z.object({ code: z.string().min(1), title: z.string().min(1) }),
			}),
		)
		.default([]),
});

const file = process.argv[2];
if (!file) {
	console.error("usage: bun scripts/db-inject.ts <inject.json>");
	process.exit(1);
}

let raw: unknown;
try {
	// NOTE: Bun.file resolves relative paths against cwd, so no node:path resolve needed
	raw = JSON.parse(await Bun.file(file).text());
} catch (e) {
	console.error(
		`FATAL: cannot read or parse ${file}: ${e instanceof Error ? e.message : e}`,
	);
	process.exit(1);
}

const parsed = Schema.safeParse(raw);
if (!parsed.success) {
	console.error(`FATAL: invalid inject file ${file}:`);
	for (const issue of parsed.error.issues) {
		console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
	}
	process.exit(1);
}
const data = parsed.data;

// created vs updated counters, keyed by entity
const counts: Record<string, { created: number; updated: number }> = {};
function count(entity: string, created: boolean) {
	counts[entity] ??= { created: 0, updated: 0 };
	counts[entity][created ? "created" : "updated"]++;
}

// NOTE: sections attach to the active term; with no active term the optional
// `term` block (default: current school year, 1st Semester) is created and activated
const currentYear = new Date().getFullYear();
const schoolYear = data.term?.schoolYear ?? `${currentYear}-${currentYear + 1}`;
const semester = data.term?.semester ?? "1st Semester";

let term = await prisma.academicTerm.findFirst({ where: { isActive: true } });
if (!term) {
	const existing = await prisma.academicTerm.findUnique({
		where: { schoolYear_semester: { schoolYear, semester } },
	});
	if (existing) {
		term = await prisma.academicTerm.update({
			where: { id: existing.id },
			data: { isActive: true },
		});
		count("term", false);
	} else {
		term = await prisma.academicTerm.create({
			data: { id: crypto.randomUUID(), schoolYear, semester, isActive: true },
		});
		count("term", true);
	}
}
console.log(`term: ${term.schoolYear} ${term.semester} (active)`);

function fail(msg: string): never {
	console.error(`FATAL: ${msg}`);
	process.exit(1);
}

for (const dept of data.departments) {
	const existing = await prisma.department.findUnique({
		where: { code: dept.code },
	});
	if (existing) {
		await prisma.department.update({
			where: { id: existing.id },
			data: { name: dept.name },
		});
		count("department", false);
	} else {
		await prisma.department.create({
			data: { id: crypto.randomUUID(), code: dept.code, name: dept.name },
		});
		count("department", true);
	}
}

for (const prog of data.programs) {
	const department = await prisma.department.findUnique({
		where: { code: prog.department },
	});
	if (!department)
		fail(`program ${prog.code}: department ${prog.department} not found`);
	const existing = await prisma.program.findUnique({
		where: { code: prog.code },
	});
	if (existing) {
		await prisma.program.update({
			where: { id: existing.id },
			data: { name: prog.name, departmentId: department.id },
		});
		count("program", false);
	} else {
		await prisma.program.create({
			data: {
				id: crypto.randomUUID(),
				code: prog.code,
				name: prog.name,
				departmentId: department.id,
			},
		});
		count("program", true);
	}
}

for (const section of data.sections) {
	const program = await prisma.program.findUnique({
		where: { code: section.program },
	});
	if (!program)
		fail(`section ${section.code}: program ${section.program} not found`);
	let course = await prisma.course.findUnique({
		where: {
			programId_code: { programId: program.id, code: section.course.code },
		},
	});
	if (course) {
		await prisma.course.update({
			where: { id: course.id },
			data: { title: section.course.title },
		});
		count("course", false);
	} else {
		course = await prisma.course.create({
			data: {
				id: crypto.randomUUID(),
				code: section.course.code,
				title: section.course.title,
				programId: program.id,
			},
		});
		count("course", true);
	}
	const existingSection = await prisma.classSection.findUnique({
		where: {
			courseId_termId_sectionCode: {
				courseId: course.id,
				termId: term.id,
				sectionCode: section.code,
			},
		},
	});
	if (existingSection) {
		count("section", false);
	} else {
		await prisma.classSection.create({
			data: {
				id: crypto.randomUUID(),
				courseId: course.id,
				termId: term.id,
				sectionCode: section.code,
			},
		});
		count("section", true);
	}
}

for (const [entity, c] of Object.entries(counts)) {
	console.log(`${entity}: ${c.created} created, ${c.updated} updated`);
}

await prisma.$disconnect();
