/**
 * Additive program-PLO seed — departments (colleges), programs, and their
 * PLOs, from `program-plos.json` next to this file.
 *
 * Upsert-only and scoped to these three entities: departments/programs are
 * matched by `code`, PLOs by `(program, code)`, and the existing row is
 * UPDATE'd in place — the `id` is preserved, so any `user.departmentId` /
 * `user.programId` references stay valid. Never deletes and never touches
 * accounts, terms, sections, or CLOs (the destructive demo `seed.ts` and the
 * class-section `scripts/db-inject.ts` stay separate).
 *
 * Run locally with `just db-seed-program-plos` (dev DB) or on the deploy with
 * `just db-seed-program-plos-prod`.
 */

import { prisma } from "@lib/prisma";
import { z } from "zod";

// NOTE: mirrors the plan service's ≥70% institutional hard floor (MIN_ATTAINMENT_PCT)
const MIN_ATTAINMENT_PCT = 70;

const Schema = z.object({
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
	plos: z
		.array(
			z.object({
				program: z.string().min(1),
				code: z.string().min(1),
				description: z.string().min(1),
				target: z.number().min(MIN_ATTAINMENT_PCT).max(100).optional(),
			}),
		)
		.default([]),
});

const raw = JSON.parse(
	await Bun.file(`${import.meta.dir}/program-plos.json`).text(),
);
const parsed = Schema.safeParse(raw);
if (!parsed.success) {
	console.error("FATAL: invalid program-plos.json:");
	for (const issue of parsed.error.issues) {
		console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
	}
	process.exit(1);
}
const data = parsed.data;

const counts: Record<string, { created: number; updated: number }> = {};
function count(entity: string, created: boolean) {
	counts[entity] ??= { created: 0, updated: 0 };
	counts[entity][created ? "created" : "updated"]++;
}

function fail(msg: string): never {
	console.error(`FATAL: ${msg}`);
	process.exit(1);
}

const departmentIds = new Map<string, string>();
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
		departmentIds.set(dept.code, existing.id);
	} else {
		const created = await prisma.department.create({
			data: { id: crypto.randomUUID(), code: dept.code, name: dept.name },
		});
		count("department", true);
		departmentIds.set(dept.code, created.id);
	}
}

const programIds = new Map<string, string>();
for (const prog of data.programs) {
	const departmentId = departmentIds.get(prog.department);
	if (!departmentId) {
		fail(`program ${prog.code}: department ${prog.department} not found`);
	}
	const existing = await prisma.program.findUnique({
		where: { code: prog.code },
	});
	if (existing) {
		await prisma.program.update({
			where: { id: existing.id },
			data: { name: prog.name, departmentId },
		});
		count("program", false);
		programIds.set(prog.code, existing.id);
	} else {
		const created = await prisma.program.create({
			data: {
				id: crypto.randomUUID(),
				code: prog.code,
				name: prog.name,
				departmentId,
			},
		});
		count("program", true);
		programIds.set(prog.code, created.id);
	}
}

// NOTE: PLOs have no unique constraint on (programId, code), so upsert via findFirst.
for (const plo of data.plos) {
	const programId = programIds.get(plo.program);
	if (!programId) {
		fail(`plo ${plo.code}: program ${plo.program} not found`);
	}
	const target = plo.target ?? MIN_ATTAINMENT_PCT;
	const existing = await prisma.plo.findFirst({
		where: { programId, code: plo.code },
	});
	if (existing) {
		await prisma.plo.update({
			where: { id: existing.id },
			data: { description: plo.description, targetAttainmentPct: target },
		});
		count("plo", false);
	} else {
		await prisma.plo.create({
			data: {
				id: crypto.randomUUID(),
				programId,
				code: plo.code,
				description: plo.description,
				targetAttainmentPct: target,
			},
		});
		count("plo", true);
	}
}

for (const [entity, c] of Object.entries(counts)) {
	console.log(`${entity}: ${c.created} created, ${c.updated} updated`);
}

await prisma.$disconnect();
