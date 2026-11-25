/* NOTE: additive dummy-account seed for the deployed DB — only creates missing
 * users, never updates or deletes existing rows, and never touches programs,
 * departments, PLOs or any other content. Re-runnable: existing emails are
 * skipped and existing scoped accounts count toward the five-per-role cap. */

import { prisma } from "@lib/prisma";
import type { UserRole } from "@prisma/generated/prisma/enums";
import { auth } from "@v1/auth/service";

const DOMAIN = "jmc.edu.test";
const PASSWORD = "password123";
const PER_PROGRAM = 5;

type ScopedRole = "faculty" | "program_chair" | "dean";

interface ProgramRef {
	id: string;
	code: string;
	departmentId: string;
}

interface DepartmentRef {
	id: string;
	code: string;
}

interface ExistingUser {
	email: string;
	role: string;
	programId: string | null;
	departmentId: string | null;
}

export interface AccountPlan {
	email: string;
	name: string;
	password: string;
	role: ScopedRole;
	programId: string | null;
	departmentId: string | null;
}

/** Pure planner so the fill/skip rules are testable without a database. */
export function planAccounts(
	programs: ProgramRef[],
	departments: DepartmentRef[],
	existing: ExistingUser[],
): AccountPlan[] {
	const emails = new Set(existing.map((user) => user.email));
	const plans: AccountPlan[] = [];
	const seen = new Set<string>();

	const add = (plan: AccountPlan): boolean => {
		if (emails.has(plan.email) || seen.has(plan.email)) return false;
		seen.add(plan.email);
		plans.push(plan);
		return true;
	};

	for (const program of programs) {
		const code = program.code.toLowerCase();
		for (const role of ["faculty", "program_chair"] as const) {
			const localPart = role === "faculty" ? "faculty" : "progchair";
			const label = role === "faculty" ? "Faculty" : "Program Chair";
			// NOTE: older dummy accounts use irregular names (e.g. `cte-faculty1`
			// for BEED) — they still count toward five, exact email matches skip.
			let filled = 0;
			for (const user of existing) {
				if (user.role === role && user.programId === program.id) filled++;
			}
			for (const plan of plans) {
				if (plan.role === role && plan.programId === program.id) filled++;
			}
			for (let i = 1; filled < PER_PROGRAM && i <= PER_PROGRAM; i++) {
				const created = add({
					email: `${code}-${localPart}${i}@${DOMAIN}`,
					name: `${program.code} ${label} ${i}`,
					password: PASSWORD,
					role,
					programId: program.id,
					departmentId: program.departmentId,
				});
				if (created) filled++;
			}
		}
	}

	for (const department of departments) {
		const hasDean =
			existing.some(
				(user) => user.role === "dean" && user.departmentId === department.id,
			) ||
			plans.some(
				(plan) => plan.role === "dean" && plan.departmentId === department.id,
			);
		if (hasDean) continue;
		add({
			email: `${department.code.toLowerCase()}-dean@${DOMAIN}`,
			name: `${department.code} Dean`,
			password: PASSWORD,
			role: "dean",
			programId: null,
			departmentId: department.id,
		});
	}

	return plans;
}

async function main() {
	const programs = await prisma.program.findMany({
		select: { id: true, code: true, departmentId: true },
		orderBy: { code: "asc" },
	});
	const departments = await prisma.department.findMany({
		select: { id: true, code: true },
		orderBy: { code: "asc" },
	});
	if (!programs.length || !departments.length) {
		console.error(
			"FATAL: no programs or departments found — check DATABASE_URL",
		);
		process.exit(1);
	}

	const existing = await prisma.user.findMany({
		select: { email: true, role: true, programId: true, departmentId: true },
	});
	const plans = planAccounts(programs, departments, existing);

	let created = 0;
	for (const account of plans) {
		// NOTE: the create hook forces role=user — grant the scope after sign-up.
		await auth.api.signUpEmail({
			body: {
				email: account.email,
				password: account.password,
				name: account.name,
			},
		});
		await prisma.user.update({
			where: { email: account.email },
			data: {
				role: account.role as UserRole,
				programId: account.programId,
				departmentId: account.departmentId,
			},
		});
		created++;
		console.log(`Created ${account.email} (${account.role})`);
	}

	const kept = existing.filter((user) =>
		user.email.endsWith(`@${DOMAIN}`),
	).length;
	console.log(
		`done: ${created} created, ${kept} existing dummy accounts kept, ` +
			`${programs.length} programs, ${departments.length} departments`,
	);
	console.log(`credentials: <account email> / ${PASSWORD}`);
}

// NOTE: import.meta.main keeps planAccounts importable by unit tests.
if (import.meta.main) {
	await main();
	await prisma.$disconnect();
}
