import { describe, expect, it } from "bun:test";

import { prisma } from "@lib/prisma";
import { unitScopeOf } from "@lib/unit-scope";
import { isDbReachable } from "@test/helpers/db-gate";
import { archiveService, ClusterNotFoundError } from "@v1/archive/service";

const db = await isDbReachable();

/**
 * Graduation-cluster archive reads.
 *
 * The archive is the permanent record behind `/archives`. What matters here is
 * containment: a college's clusters (and its per-student compiled entries) are
 * never readable through another college's scope, and an `own`-scoped caller
 * gets nothing at all. The write side (open/confirm/compile/export/purge) is
 * deliberately out of scope — it purges source rows and needs its own design.
 */

const IDS = {
	department: "it-arc-dept",
	otherDepartment: "it-arc-dept-2",
	program: "it-arc-prog",
	otherProgram: "it-arc-prog-2",
	term: "it-arc-term",
	cluster: "it-arc-cluster",
	otherCluster: "it-arc-cluster-2",
	student: "it-arc-student",
	otherStudent: "it-arc-student-2",
	entry: "it-arc-entry",
	otherEntry: "it-arc-entry-2",
	aqau: "it-arc-aqau",
	dean: "it-arc-dean",
	other: "it-arc-other",
};

const USER_IDS = [IDS.aqau, IDS.dean, IDS.other];
const CLUSTER_IDS = [IDS.cluster, IDS.otherCluster];
const ENTRY_IDS = [IDS.entry, IDS.otherEntry];
const STUDENT_IDS = [IDS.student, IDS.otherStudent];

function scopes() {
	return {
		institution: unitScopeOf({ id: IDS.aqau, role: "aqau" }),
		program: unitScopeOf({
			id: IDS.dean,
			role: "dean",
			departmentId: IDS.department,
		}),
		own: unitScopeOf({ id: IDS.other, role: "faculty" }),
	};
}

async function reset(): Promise<void> {
	await prisma.graduationClusterEntry.deleteMany({
		where: { id: { in: ENTRY_IDS } },
	});
	await prisma.student.deleteMany({ where: { id: { in: STUDENT_IDS } } });
	await prisma.graduationCluster.deleteMany({
		where: { id: { in: CLUSTER_IDS } },
	});
	await prisma.academicTerm.deleteMany({ where: { id: IDS.term } });
	await prisma.program.deleteMany({
		where: { id: { in: [IDS.program, IDS.otherProgram] } },
	});
	await prisma.department.deleteMany({
		where: { id: { in: [IDS.department, IDS.otherDepartment] } },
	});
	await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } });
}

async function seed(): Promise<void> {
	await prisma.department.create({
		data: {
			id: IDS.department,
			name: "Integration Archive Dept",
			code: "IT-ARC",
		},
	});
	await prisma.department.create({
		data: {
			id: IDS.otherDepartment,
			name: "Integration Archive Dept 2",
			code: "IT-ARC-2",
		},
	});
	await prisma.program.create({
		data: {
			id: IDS.program,
			name: "BS Information Technology",
			code: "BSIT-ARC",
			departmentId: IDS.department,
		},
	});
	await prisma.program.create({
		data: {
			id: IDS.otherProgram,
			name: "BS Computer Science",
			code: "BSCS-ARC",
			departmentId: IDS.otherDepartment,
		},
	});
	await prisma.academicTerm.create({
		data: {
			id: IDS.term,
			schoolYear: "2025-2026",
			semester: "1st Semester",
		},
	});

	// One cluster per program — cross-unit fixtures must never leak between them.
	await prisma.graduationCluster.create({
		data: {
			id: IDS.cluster,
			programId: IDS.program,
			graduationTermId: IDS.term,
			label: "CITE 2026 Graduate Cluster",
			status: "open",
		},
	});
	await prisma.graduationCluster.create({
		data: {
			id: IDS.otherCluster,
			programId: IDS.otherProgram,
			graduationTermId: IDS.term,
			label: "CCS 2026 Graduate Cluster",
			status: "open",
		},
	});

	for (const id of STUDENT_IDS) {
		await prisma.student.create({
			data: {
				id,
				studentNumber: `SN-${id}`,
				anonymizedId: `ANON-${id}`,
				firstName: "Test",
				lastName: "Student",
				programId: IDS.program,
				studentStatus: "graduated",
				graduationTermId: IDS.term,
				// The live `Student` row points at the cluster; a compile purges it,
				// which is why the count is 0 for a compiled cluster.
				graduationClusterId: id === IDS.student ? IDS.cluster : null,
			},
		});
	}

	// Only the first cluster has compiled entries, so the composition count is 1
	// and the second unit's donut stays empty even though it has a cluster.
	await prisma.graduationClusterEntry.create({
		data: {
			id: IDS.entry,
			clusterId: IDS.cluster,
			studentId: IDS.student,
			anonymizedId: `ANON-${IDS.student}`,
			studentStatusAtArchive: "graduated",
		},
	});

	const SEED_USERS = [
		{ id: IDS.aqau, role: "aqau" },
		{ id: IDS.dean, role: "dean" },
		{ id: IDS.other, role: "faculty" },
	] as const;

	for (const user of SEED_USERS) {
		await prisma.user.create({
			data: {
				id: user.id,
				name: user.id,
				email: `${user.id}@jmcfi.edu.ph`,
				emailVerified: true,
				role: user.role,
				...(user.role === "dean" ? { departmentId: IDS.department } : {}),
			},
		});
	}
}

/** Runs `fn` against the seeded fixtures only when the dev DB answers. */
async function withDb(fn: () => Promise<void>): Promise<void> {
	if (!db) return;
	await reset();
	await seed();
	try {
		await fn();
	} finally {
		await reset();
	}
}

describe("archive service (integration)", () => {
	it(
		"lists only the caller's department's clusters",
		() =>
			withDb(async () => {
				const { institution, program, own } = scopes();

				const rows = await archiveService.list(program);
				expect(rows.map((row) => row.id)).toEqual([IDS.cluster]);

				const all = await archiveService.list(institution);
				expect(all.map((row) => row.id).sort()).toEqual(CLUSTER_IDS.sort());

				// A scoped role with no unit on file sees nothing at all.
				await expect(archiveService.list(own)).resolves.toEqual([]);
			}),
		60000,
	);

	it(
		"reads a cluster with its entries only inside the caller's unit",
		() =>
			withDb(async () => {
				const { program, own } = scopes();

				const mine = await archiveService.get(IDS.cluster, program);
				expect(mine.id).toBe(IDS.cluster);
				expect(mine.entries).toHaveLength(1);
				expect(mine.studentCount).toBe(1);

				// The other department's cluster must be indistinguishable from a
				// missing one — 404 either way, so the route is not a unit oracle.
				await expect(
					archiveService.get(IDS.otherCluster, program),
				).rejects.toThrow(ClusterNotFoundError);
				await expect(archiveService.get(IDS.cluster, own)).rejects.toThrow(
					ClusterNotFoundError,
				);
			}),
		60000,
	);

	it(
		"counts compiled entries and clusters per unit",
		() =>
			withDb(async () => {
				const { institution, program } = scopes();

				const composition = await archiveService.composition(program);
				expect(composition).toEqual([{ status: "graduated", studentCount: 1 }]);

				const otherComposition = await archiveService.composition(
					unitScopeOf({
						id: IDS.other,
						role: "faculty",
						departmentId: IDS.otherDepartment,
					}),
				);
				expect(otherComposition).toEqual([]);

				const statuses = await archiveService.statusCounts(program);
				expect(statuses).toEqual([{ status: "open", clusterCount: 1 }]);

				const allStatuses = await archiveService.statusCounts(institution);
				expect(allStatuses).toEqual([{ status: "open", clusterCount: 2 }]);
			}),
		60000,
	);

	it(
		"confirm refuses a foreign unit's cluster without revealing its state",
		() =>
			withDb(async () => {
				const { program } = scopes();

				await expect(
					archiveService.confirm(IDS.otherCluster, IDS.aqau, program, {
						peoAttainment: { PEO1: 82 },
					}),
				).rejects.toThrow(ClusterNotFoundError);

				// And it wrote nothing.
				const untouched = await prisma.graduationCluster.findUnique({
					where: { id: IDS.otherCluster },
					select: { confirmedAt: true, peoAttainmentCapturedAt: true },
				});
				expect(untouched?.confirmedAt).toBeNull();
				expect(untouched?.peoAttainmentCapturedAt).toBeNull();
			}),
		60000,
	);

	it(
		"confirm stamp the captured PEO snapshot on an open cluster in-scope",
		() =>
			withDb(async () => {
				const { program } = scopes();

				const result = await archiveService.confirm(
					IDS.cluster,
					IDS.aqau,
					program,
					{
						peoAttainment: { PEO1: 82.5 },
					},
				);
				expect(result).toEqual({ confirmed: true });

				const updated = await prisma.graduationCluster.findUnique({
					where: { id: IDS.cluster },
					select: { stats: true, confirmedAt: true, confirmedByUserId: true },
				});
				expect(updated?.stats).toEqual({ peoAttainment: { PEO1: 82.5 } });
				expect(updated?.confirmedAt).toBeInstanceOf(Date);
				expect(updated?.confirmedByUserId).toBe(IDS.aqau);
			}),
		60000,
	);

	it(
		"confirm is a no-op once the cluster has left `open`",
		() =>
			withDb(async () => {
				const { program } = scopes();

				await prisma.graduationCluster.update({
					where: { id: IDS.cluster },
					data: { status: "compiling" },
				});

				await expect(
					archiveService.confirm(IDS.cluster, IDS.aqau, program, {
						peoAttainment: { PEO1: 82.5 },
					}),
				).rejects.toThrow(ClusterNotFoundError);

				const untouched = await prisma.graduationCluster.findUnique({
					where: { id: IDS.cluster },
					select: { confirmedAt: true },
				});
				expect(untouched?.confirmedAt).toBeNull();
			}),
		60000,
	);

	it(
		"program filter is refused when it falls outside the caller's unit",
		() =>
			withDb(async () => {
				const { program } = scopes();
				await expect(
					archiveService.list(program, { programId: IDS.otherProgram }),
				).rejects.toThrow();
				// Still fine inside the unit.
				await expect(
					archiveService.list(program, { programId: IDS.program }),
				).resolves.toHaveLength(1);
			}),
		60000,
	);
});

describe("archive service without a DB", () => {
	it("skips (integration gate)", () => {
		expect(db === true || db === false).toBe(true);
	});
});
