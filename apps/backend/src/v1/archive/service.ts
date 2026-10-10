import { prisma } from "@lib/prisma";
import {
	assertProgramInScope,
	clusterEntryUnitWhere,
	clusterUnitWhere,
	type UnitScope,
} from "@lib/unit-scope";
import type { Prisma } from "@prisma/generated/prisma/client";

import type { ClusterConfirm, ClusterListQuery } from "./model";

// --- Errors -------------------------------------------------------------------

/** 404 — no such cluster in the caller's unit. */
export class ClusterNotFoundError extends Error {
	readonly status = 404;
	constructor(id: string) {
		super(`Graduation cluster '${id}' not found`);
		this.name = "ClusterNotFoundError";
	}
}

/** 403 — the caller's role may not confirm a cluster for compile. */
export class ClusterConfirmForbiddenError extends Error {
	readonly status = 403;
	constructor() {
		super("Your role may not confirm a graduation cluster");
		this.name = "ClusterConfirmForbiddenError";
	}
}

/**
 * Graduation-cluster archive — the **read side only**.
 *
 * The cluster is a compiled, permanent record: once a term's departures have
 * been confirmed and compiled, the rows behind it are purged (see
 * `10-archive.prisma`) and the cluster + its `GraduationClusterEntry` rows are
 * all that survive. So this service lists and reads, and the only mutation it
 * performs is the PEO-attainment capture that a compile requires.
 *
 * The full write pipeline (open → confirm → capture → compile → export →
 * purge) is **not** implemented: it destroys source rows (`StudentScore`,
 * `CloAttainment`, `AtRiskFlag`), which is exactly the kind of irreversible
 * operation that needs its own design pass rather than being bolted on while
 * wiring charts. This class therefore opens no clusters — an operator does
 * that when the term closes — and only confirms/reads once one exists.
 */
export class ArchiveService {
	/**
	 * `GET /archives` — the cluster list for the caller's unit.
	 *
	 * `?programId=` is intersected with (never trusted over) the caller's
	 * scope: a foreign program throws `UnitScopeError` (403) upstream, so a
	 * scoped account cannot enumerate another unit's clusters.
	 */
	async list(unit: UnitScope, query: ClusterListQuery = {}) {
		if (query.programId) {
			await assertProgramInScope(unit, query.programId);
		}

		const clusters = await prisma.graduationCluster.findMany({
			where: {
				AND: [
					clusterUnitWhere(unit),
					query.programId ? { programId: query.programId } : {},
					query.status ? { status: query.status } : {},
				],
			},
			select: {
				id: true,
				label: true,
				status: true,
				stats: true,
				peoAttainmentCapturedAt: true,
				confirmedAt: true,
				compiledAt: true,
				archivedAt: true,
				createdAt: true,
				program: {
					select: { id: true, code: true, name: true, departmentId: true },
				},
				graduationTerm: {
					select: { id: true, schoolYear: true, semester: true },
				},
				confirmedBy: { select: { id: true, name: true } },
			},
			orderBy: [{ graduationTerm: { schoolYear: "desc" } }, { label: "asc" }],
		});

		return this.withStudentCounts(clusters);
	}

	/**
	 * Attach each cluster's live student count in one `groupBy`, rather than
	 * a `_count` per row (this Prisma version rejects `_count` inside a
	 * relation select). One extra query for the whole list beats N.
	 *
	 * NOTE: counts **live** `Student` rows pointing at the cluster. Compiling
	 * purges those rows, so a fully-compiled cluster legitimately reports 0
	 * here — the compiled headcount lives on the cluster's `stats` and its
	 * `GraduationClusterEntry` rows instead.
	 */
	private async withStudentCounts<T extends { id: string }>(
		clusters: T[],
	): Promise<(T & { studentCount: number })[]> {
		const counts = await prisma.student.groupBy({
			by: ["graduationClusterId"],
			where: {
				graduationClusterId: {
					in: clusters.map((cluster) => cluster.id),
				},
			},
			_count: { _all: true },
		});
		const countById = new Map(
			counts.map((row) => [row.graduationClusterId, row._count._all]),
		);
		return clusters.map((cluster) => ({
			...cluster,
			studentCount: countById.get(cluster.id) ?? 0,
		}));
	}

	/**
	 * `GET /archives/:clusterId` — one cluster with its per-student compile
	 * entries. `405` is not a thing here: an `open` (not-yet-compiled) cluster
	 * simply has no entries, which the client renders as "not yet compiled".
	 */
	async get(clusterId: string, unit: UnitScope) {
		const cluster = await prisma.graduationCluster.findFirst({
			where: { AND: [{ id: clusterId }, clusterUnitWhere(unit)] },
			select: {
				id: true,
				label: true,
				status: true,
				stats: true,
				confirmedAt: true,
				compiledAt: true,
				archivedAt: true,
				program: {
					select: { id: true, code: true, name: true, departmentId: true },
				},
				graduationTerm: {
					select: { id: true, schoolYear: true, semester: true },
				},
				entries: {
					select: {
						id: true,
						anonymizedId: true,
						studentStatusAtArchive: true,
						isGraduationEntry: true,
						graduatedAt: true,
						compiledData: true,
						peoAttainment: true,
						detailArtifactUrl: true,
					},
					orderBy: { anonymizedId: "asc" },
				},
			},
		});
		if (!cluster) throw new ClusterNotFoundError(clusterId);

		const studentCount = await prisma.student.count({
			where: { graduationClusterId: clusterId },
		});
		return { ...cluster, studentCount };
	}

	/**
	 * `GET /archives/composition` — the archived-student status distribution
	 * behind the composition donut.
	 *
	 * Counts `GraduationClusterEntry` rows (what was actually compiled), NOT
	 * the still-live `Student` rows a cluster points at — the source rows are
	 * purged on compile, so the entry is the record that survives. Scoped
	 * through the entry's cluster.
	 */
	async composition(unit: UnitScope) {
		const rows = await prisma.graduationClusterEntry.groupBy({
			by: ["studentStatusAtArchive"],
			where: clusterEntryUnitWhere(unit),
			_count: { _all: true },
		});
		return rows.map((row) => ({
			status: row.studentStatusAtArchive,
			studentCount: row._count._all,
		}));
	}

	/**
	 * `GET /archives/status-counts` — the cluster lifecycle distribution
	 * behind the status donut (open / compiling / archived).
	 */
	async statusCounts(unit: UnitScope) {
		const rows = await prisma.graduationCluster.groupBy({
			by: ["status"],
			where: clusterUnitWhere(unit),
			_count: { _all: true },
		});
		return rows.map((row) => ({
			status: row.status,
			clusterCount: row._count._all,
		}));
	}

	/**
	 * `POST /archives/:clusterId/confirm` — stamp the captured PEO attainment
	 * onto the cluster, which is the precondition a compile checks.
	 *
	 * Gates: `confirmClusterCompile` (aqau/system_admin) asserted by the
	 * controller, and the cluster must be `open` — confirming an already
	 * compiling/archived cluster would rewrite a permanent record. PEO
	 * attainment is stored as given (the caller supplies the captured
	 * snapshot); the ≥70% benchmarks it is measured against live on `Plo`,
	 * not here.
	 */
	async confirm(
		clusterId: string,
		userId: string,
		unit: UnitScope,
		body: ClusterConfirm,
	) {
		// NOTE: the unit filter rides on the UPDATE, not a pre-check. A foreign
		// cluster and a nonexistent one must be indistinguishable (both 404), or
		// the endpoint becomes a unit-existence oracle.
		const result = await prisma.graduationCluster.updateMany({
			where: {
				AND: [{ id: clusterId, status: "open" }, clusterUnitWhere(unit)],
			},
			data: {
				peoAttainmentCapturedAt: new Date(),
				confirmedByUserId: userId,
				confirmedAt: new Date(),
				// NOTE: the PEO snapshot is stored on the cluster's `stats` JSON —
				// `GraduationCluster` has no `peoAttainment` column of its own,
				// only the captured-at timestamp marking it ready to compile.
				stats: { peoAttainment: body.peoAttainment } as Prisma.InputJsonValue,
			},
		});
		// An empty count means no `open` cluster in the caller's unit matched —
		// it is either gone or already moved past `open`, and telling those two
		// apart (or either apart from "another unit's") would leak more than a
		// caller needs, so it is one 404.
		if (result.count === 0) throw new ClusterNotFoundError(clusterId);
		return { confirmed: true as const };
	}
}

export const archiveService = new ArchiveService();
