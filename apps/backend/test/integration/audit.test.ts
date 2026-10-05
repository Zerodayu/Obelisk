import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { prisma } from "@lib/prisma";
import { RoleAccessForbiddenError } from "@lib/role-access";
import { isDbReachable } from "@test/helpers/db-gate";
import {
	type AuditLogEntry,
	AuditQueryError,
	auditService,
} from "@v1/audit/service";

const db = await isDbReachable();

/**
 * `GET /audit/logs` scoping: vpaa/system_admin read every role's rows (the
 * full waterfall), every other role reads only its own — never another
 * user's, even when a `userId` is requested explicitly (403, not a silent
 * ignore). Plus keyset paging (`limit`/`before`) basics.
 */
const IDS = {
	faculty: "it-audit-faculty",
	dean: "it-audit-dean",
	vpaa: "it-audit-vpaa",
	admin: "it-audit-admin",
	// Rows this file owns — cleanup is scoped to this prefix.
	rowF1: "it-audit-row-f1",
	rowF2: "it-audit-row-f2",
	rowF3: "it-audit-row-f3",
	rowD1: "it-audit-row-d1",
	rowD2: "it-audit-row-d2",
	rowV1: "it-audit-row-v1",
	rowOrphan: "it-audit-row-orphan",
};

const USER_IDS = [IDS.faculty, IDS.dean, IDS.vpaa, IDS.admin];

/** Newest → oldest, so cursor paging has a deterministic order. */
const ROW_ORDER = [
	IDS.rowF1,
	IDS.rowF2,
	IDS.rowF3,
	IDS.rowD1,
	IDS.rowD2,
	IDS.rowV1,
	IDS.rowOrphan,
];

const FACULTY_CALLER = { id: IDS.faculty, role: "faculty" };
const DEAN_CALLER = { id: IDS.dean, role: "dean" };
const VPAA_CALLER = { id: IDS.vpaa, role: "vpaa" };
const ADMIN_CALLER = { id: IDS.admin, role: "system_admin" };

/**
 * Ids of THIS file's rows within a page, in response order. The dev DB may
 * already carry other users' audit rows, so full-view assertions must be
 * relative to our prefix (also what `reset()` cleans up).
 */
function ownedIds(entries: AuditLogEntry[]): string[] {
	return entries.map((e) => e.id).filter((id) => id.startsWith("it-audit-"));
}

async function reset(): Promise<void> {
	await prisma.auditLog.deleteMany({
		where: { id: { startsWith: "it-audit-" } },
	});
	await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } });
}

async function seed(): Promise<void> {
	await prisma.user.createMany({
		data: [
			{
				id: IDS.faculty,
				name: "Audit Faculty",
				email: "it-audit-f@jmcfi.edu.ph",
				role: "faculty",
			},
			{
				id: IDS.dean,
				name: "Audit Dean",
				email: "it-audit-d@jmcfi.edu.ph",
				role: "dean",
			},
			{
				id: IDS.vpaa,
				name: "Audit VPAA",
				email: "it-audit-v@jmcfi.edu.ph",
				role: "vpaa",
			},
			{
				id: IDS.admin,
				name: "Audit Admin",
				email: "it-audit-a@jmcfi.edu.ph",
				role: "system_admin",
			},
		],
	});
	// NOTE: explicit createdAt keeps the keyset cursor order deterministic.
	const base = Date.UTC(2026, 0, 1);
	const rows = [
		{ id: IDS.rowF1, userId: IDS.faculty, offset: 6 },
		{ id: IDS.rowF2, userId: IDS.faculty, offset: 5 },
		{ id: IDS.rowF3, userId: IDS.faculty, offset: 4 },
		{ id: IDS.rowD1, userId: IDS.dean, offset: 3 },
		{ id: IDS.rowD2, userId: IDS.dean, offset: 2 },
		{ id: IDS.rowV1, userId: IDS.vpaa, offset: 1 },
		// NOTE: userId SET NULL after a user delete — full view only, no actor.
		{ id: IDS.rowOrphan, userId: null, offset: 0 },
	];
	for (const row of rows) {
		await prisma.auditLog.create({
			data: {
				id: row.id,
				userId: row.userId,
				action: "form_submission.approved",
				moduleAffected: "forms",
				targetRecordId: "it-audit-target",
				details: { test: true },
				createdAt: new Date(base + row.offset * 1000),
			},
		});
	}
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

describe.skipIf(!db)("audit log scoping (integration)", () => {
	it("returns only the caller's own rows to a non-privileged role", async () => {
		const page = await auditService.list(FACULTY_CALLER, {});
		expect(page.viewer.scope).toBe("self");
		expect(page.entries.map((e) => e.id)).toEqual([
			IDS.rowF1,
			IDS.rowF2,
			IDS.rowF3,
		]);
		// Actor join resolves the current user record.
		expect(page.entries[0]?.actor?.id).toBe(IDS.faculty);
	});

	it("403s a non-privileged role asking for another user's rows", async () => {
		await expect(
			auditService.list(FACULTY_CALLER, { userId: IDS.dean }),
		).rejects.toBeInstanceOf(RoleAccessForbiddenError);
		// Its own userId stays allowed (self-targeting is not a foreign read).
		const own = await auditService.list(FACULTY_CALLER, {
			userId: IDS.faculty,
		});
		expect(own.entries).toHaveLength(3);
	});

	it("gives vpaa every role's rows including orphans (scope=all)", async () => {
		const page = await auditService.list(VPAA_CALLER, {});
		expect(page.viewer.scope).toBe("all");
		// Foreign rows (faculty/dean/orphan) must all be present, in order.
		expect(ownedIds(page.entries)).toEqual(ROW_ORDER);
		expect(page.entries.find((e) => e.id === IDS.rowOrphan)?.actor).toBeNull();
	});

	it("gives system_admin the full view without a userId filter", async () => {
		const page = await auditService.list(ADMIN_CALLER, {});
		expect(page.viewer.scope).toBe("all");
		expect(ownedIds(page.entries)).toEqual(ROW_ORDER);
	});

	it("lets a full-view role filter down to one user's rows", async () => {
		const page = await auditService.list(VPAA_CALLER, { userId: IDS.dean });
		expect(page.viewer.scope).toBe("all");
		expect(page.entries.map((e) => e.id)).toEqual([IDS.rowD1, IDS.rowD2]);
	});

	it("pages with limit/hasMore and the before keyset cursor", async () => {
		const first = await auditService.list(FACULTY_CALLER, { limit: "2" });
		expect(first.entries.map((e) => e.id)).toEqual([IDS.rowF1, IDS.rowF2]);
		expect(first.hasMore).toBe(true);

		const second = await auditService.list(FACULTY_CALLER, {
			limit: "2",
			before: first.entries[1]?.createdAt,
		});
		expect(second.entries.map((e) => e.id)).toEqual([IDS.rowF3]);
		expect(second.hasMore).toBe(false);
	});

	it("rejects an unparseable before cursor with a 400-typed error", async () => {
		await expect(
			auditService.list(FACULTY_CALLER, { before: "not-a-date" }),
		).rejects.toBeInstanceOf(AuditQueryError);
	});

	it("keeps a dean inside their own rows (no cascade below)", async () => {
		const page = await auditService.list(DEAN_CALLER, {});
		expect(page.viewer.scope).toBe("self");
		expect(page.entries.map((e) => e.id)).toEqual([IDS.rowD1, IDS.rowD2]);
	});
});
