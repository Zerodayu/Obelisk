import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { prisma } from "@lib/prisma";
import { isDbReachable } from "@test/helpers/db-gate";
import { RoleRequestError } from "@v1/auth/model";
import { userService } from "@v1/auth/service";

const db = await isDbReachable();

/**
 * `GET /auth/users` / `POST /auth/users` backing service (`userService`):
 * every account newest-first with the projection the users table renders, and
 * admin-provisioned account creation with its role/scope rules.
 *
 * The admin-only gate itself is covered by `test/unit/platform-stats.test.ts`;
 * this exercises the query + create behaviour.
 */
const IDS = {
	dept: "it-users-dept",
	program: "it-users-prog",
	scoped: "it-users-scoped",
	unscoped: "it-users-unscoped",
};

const EMAILS = [
	"it-users-scoped@jmcfi.edu.ph",
	"it-users-unscoped@jmcfi.edu.ph",
];

/** Emails of accounts `createUser` makes — cleaned up by email. */
const CREATED_EMAILS = [
	"it-users-created@jmcfi.edu.ph",
	"it-users-created2@jmcfi.edu.ph",
];

async function reset(): Promise<void> {
	await prisma.user.deleteMany({
		where: { email: { in: [...EMAILS, ...CREATED_EMAILS] } },
	});
	await prisma.program.deleteMany({ where: { id: IDS.program } });
	await prisma.department.deleteMany({ where: { id: IDS.dept } });
}

async function seed(): Promise<void> {
	const base = Date.UTC(2026, 0, 1);
	await prisma.department.create({
		data: { id: IDS.dept, name: "Users Test Dept", code: "IT-USERS" },
	});
	await prisma.program.create({
		data: {
			id: IDS.program,
			departmentId: IDS.dept,
			name: "Users Test Program",
			code: "IT-USERS-PROG",
		},
	});
	await prisma.user.create({
		data: {
			id: IDS.scoped,
			name: "Scoped User",
			email: EMAILS[0],
			role: "faculty",
			programId: IDS.program,
			// A scoped role request sets both (the department is derived from
			// the program), so mirror that in the seed.
			departmentId: IDS.dept,
			// Older, so it must sort after the unscoped user.
			createdAt: new Date(base),
		},
	});
	await prisma.user.create({
		data: {
			id: IDS.unscoped,
			name: "Unscoped User",
			email: EMAILS[1],
			role: "system_admin",
			createdAt: new Date(base + 1000),
		},
	});
}

beforeAll(async () => {
	if (!db) return;
	await reset();
	await seed();
});

afterAll(async () => {
	if (!db) return;
	await reset();
});

describe.skipIf(!db)("platform users listing (integration)", () => {
	it("returns every account newest-first with its scope", async () => {
		const rows = await userService.listUsers();
		const ours = rows.filter((row) => EMAILS.includes(row.email));

		expect(ours.map((row) => row.id)).toEqual([IDS.unscoped, IDS.scoped]);

		const scoped = ours.find((row) => row.id === IDS.scoped);
		expect(scoped?.role).toBe("faculty");
		expect(scoped?.isActive).toBe(true);
		expect(scoped?.program?.code).toBe("IT-USERS-PROG");
		expect(scoped?.department?.name).toBe("Users Test Dept");

		const unscoped = ours.find((row) => row.id === IDS.unscoped);
		expect(unscoped?.role).toBe("system_admin");
		expect(unscoped?.program).toBeNull();
		expect(unscoped?.department).toBeNull();
	});
});

describe.skipIf(!db)("admin-provisioned account creation (integration)", () => {
	it("creates a scoped account, deriving its department from the program", async () => {
		const created = await userService.createUser({
			name: "Created Faculty",
			email: CREATED_EMAILS[0],
			password: "password123",
			role: "faculty",
			programId: IDS.program,
		});

		expect(created.email).toBe(CREATED_EMAILS[0]);
		expect(created.role).toBe("faculty");
		expect(created.isActive).toBe(true);
		expect(created.program?.code).toBe("IT-USERS-PROG");
		expect(created.department?.name).toBe("Users Test Dept");
	});

	it("rejects a duplicate email with a 409", async () => {
		await expect(
			userService.createUser({
				name: "Created Faculty",
				email: CREATED_EMAILS[0],
				password: "password123",
				role: "faculty",
				programId: IDS.program,
			}),
		).rejects.toThrow("already exists");
	});

	it("rejects a program-scoped role with no program (400)", async () => {
		await expect(
			userService.createUser({
				name: "No Scope",
				email: CREATED_EMAILS[1],
				password: "password123",
				role: "faculty",
			}),
		).rejects.toThrow(RoleRequestError);
	});

	it("rejects an invalid role (400)", async () => {
		await expect(
			userService.createUser({
				name: "Bad Role",
				email: CREATED_EMAILS[1],
				password: "password123",
				role: "system_admin",
			}),
		).rejects.toThrow(RoleRequestError);
	});
});
