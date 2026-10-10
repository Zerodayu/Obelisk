/**
 * Governance dataset atoms (institutional oversight / QA charts).
 *
 * `approvalFlowDataAtom`, `formStatusCountsAtom` and `atRiskDataAtom` are
 * derived from live backend reads (`GET /forms?scope=visible` and
 * `GET /atrisk/flags`), so they reflect real database counts for every
 * submission the session user's approval chain entitles them to — own + the
 * forms that must reach their role (faculty sees only its own, vpaa/
 * system_admin see everything), never another user's rows for a role that has
 * no claim on them. The audit trail reads the real `GET /audit/logs`
 * (scoped server-side to the caller), and `auditActivityDataAtom` is derived
 * from it. The remaining charts have no backend endpoint yet (graduation
 * clusters, report exports, platform-wide user/role counts, and the AI
 * recommendation list), so they are seeded with `[]` and render an empty
 * state instead of fabricated numbers.
 */

import { atom } from "jotai";

import type {
	ApprovalFlowDatum,
	AtRiskDatum,
	AuditActivityDatum,
	ClusterCompositionDatum,
	ClusterStatusDatum,
	ExportFormatDatum,
	FormTypeStageDatum,
	RecommendationStatusDatum,
	UserRoleDatum,
} from "@/components/charts/obe-sample-data";
import { api } from "@/lib/api-client";
import { atomWithAsyncData, atomWithMockData } from "@/lib/store/async-atom";
import {
	formStatusCountsAtom,
	formSubmissionsDataAtom,
	refreshFormSubmissionsAtom,
} from "@/lib/store/atoms/forms";

export { formStatusCountsAtom };

/**
 * Approval-chain decisions per role, aggregated from the `approvalSteps` of
 * every submission the caller's chain entitles them to (own + forms whose
 * server-derived chain contains their role). Shares the `GET /forms?scope=visible`
 * fetch with the status donut — so a role that sits in no chain (faculty)
 * counts only its own submissions, while vpaa/system_admin count everything.
 * The live step-by-step queue is `/approvals` (`scope=pending`).
 */
export const approvalFlowDataAtom = atom<ApprovalFlowDatum[]>((get) => {
	const counts = new Map<
		string,
		{ pending: number; approved: number; returned: number }
	>();
	for (const submission of get(formSubmissionsDataAtom)) {
		for (const step of submission.approvalSteps ?? []) {
			const bucket = counts.get(step.approverRole) ?? {
				pending: 0,
				approved: 0,
				returned: 0,
			};
			bucket[step.decision] += 1;
			counts.set(step.approverRole, bucket);
		}
	}
	return [...counts].map(([approverRole, bucket]) => ({
		approverRole,
		...bucket,
	}));
});

/** Refreshes the underlying `GET /forms` fetch that feeds the derivation. */
export const refreshApprovalFlowAtom = refreshFormSubmissionsAtom;

/** `AtRiskFlagRow` subset from `GET /atrisk/flags` (`server/actions/at-risk.ts`). */
interface AtRiskFlagDto {
	reason: string;
}

/**
 * At-risk watchlist grouped by `AtRiskFlag.reason`.
 *
 * `GET /atrisk/flags` returns one row per flag (a student can carry several,
 * one per below-threshold CLO), so the donut counts **flags**, not students.
 * The endpoint is not wrapped in `cached` server-side, so clearing a flag on
 * final approval moves the donut immediately — no refresh race.
 */
export const { dataAtom: atRiskDataAtom, refreshAtom: refreshAtRiskAtom } =
	atomWithAsyncData<AtRiskDatum[]>([], (_get, signal) =>
		api.get<AtRiskFlagDto[]>("/atrisk/flags", { signal }).then((flags) => {
			const counts = new Map<string, number>();
			for (const flag of flags) {
				counts.set(flag.reason, (counts.get(flag.reason) ?? 0) + 1);
			}
			return [...counts].map(([reason, count]) => ({
				reason,
				studentCount: count,
			}));
		}),
	);

/** Actor snapshot joined at read time from `user` (`GET /audit/logs`). */
export interface AuditActor {
	id: string;
	name: string;
	email: string;
	/** The user's CURRENT role — audit rows do not snapshot it at write time. */
	role: string | null;
}

/** One `AuditLog` row as served by `GET /audit/logs`. */
export interface AuditLogEntry {
	id: string;
	action: string;
	moduleAffected: string;
	targetRecordId: string | null;
	details: unknown;
	createdAt: string;
	/** `null` when the actor's user row was deleted (`userId` SET NULL). */
	actor: AuditActor | null;
}

/** Scoped page from `GET /audit/logs`: `all` for vpaa/system_admin, else `self`. */
export interface AuditLogPage {
	entries: AuditLogEntry[];
	viewer: { scope: "all" | "self" };
	hasMore: boolean;
}

const EMPTY_AUDIT_PAGE: AuditLogPage = {
	entries: [],
	viewer: { scope: "self" },
	hasMore: false,
};

/**
 * The caller's audit trail — server-scoped: vpaa/system_admin get every
 * role's rows (the full waterfall), everyone else gets only their own.
 * NOTE: deliberately uncached upstream (freshness + per-user scope).
 */
export const {
	dataAtom: auditLogsDataAtom,
	stateAtom: auditLogsStateAtom,
	refreshAtom: refreshAuditActivityAtom,
} = atomWithAsyncData<AuditLogPage>(EMPTY_AUDIT_PAGE, (_get, signal) =>
	api.get<AuditLogPage>("/audit/logs", { signal }),
);

/** Audit-trail activity grouped by module (`AuditLog.moduleAffected`). */
export const auditActivityDataAtom = atom<AuditActivityDatum[]>((get) => {
	const counts = new Map<string, number>();
	for (const entry of get(auditLogsDataAtom).entries) {
		counts.set(
			entry.moduleAffected,
			(counts.get(entry.moduleAffected) ?? 0) + 1,
		);
	}
	return [...counts].map(([module, count]) => ({ module, count }));
});

// TODO(ai-status): `GET /ai/recommendation/latest` returns a single record, not
// a status distribution — a list route is needed for this donut.
export const {
	dataAtom: recommendationsDataAtom,
	refreshAtom: refreshRecommendationsAtom,
} = atomWithMockData<RecommendationStatusDatum[]>([]);

// TODO(archives): the graduation-cluster archival pipeline has no routes yet.
/** Graduation-cluster composition by archived student status. */
export const {
	dataAtom: clusterCompositionDataAtom,
	refreshAtom: refreshClusterCompositionAtom,
} = atomWithMockData<ClusterCompositionDatum[]>([]);

// TODO(exports): `ReportExport` is never queried by a route.
/** Report exports by format (`ReportExport.format`). */
export const {
	dataAtom: exportFormatsDataAtom,
	refreshAtom: refreshExportFormatsAtom,
} = atomWithMockData<ExportFormatDatum[]>([]);

/** One `FormType` row from `GET /forms/types`. */
interface FormTypeDto {
	pdcaStage: string;
}

/** Form-type catalog by PDCA stage (`FormType.pdcaStage`). */
export const {
	dataAtom: formTypeStagesDataAtom,
	refreshAtom: refreshFormTypeStagesAtom,
} = atomWithAsyncData<FormTypeStageDatum[]>([], (_get, signal) =>
	api.get<FormTypeDto[]>("/forms/types", { signal }).then((types) => {
		const counts = new Map<string, number>();
		for (const type of types) {
			counts.set(type.pdcaStage, (counts.get(type.pdcaStage) ?? 0) + 1);
		}
		return [...counts].map(([stage, formTypeCount]) => ({
			stage: stage as FormTypeStageDatum["stage"],
			formTypeCount,
		}));
	}),
);

// TODO(user-roles): `GET /auth/role-requests` is admin-only and filtered by
// request status, so it cannot seed a platform-wide role distribution.
/** Platform users by role (`user.role`). */
export const {
	dataAtom: userRolesDataAtom,
	refreshAtom: refreshUserRolesAtom,
} = atomWithMockData<UserRoleDatum[]>([]);

/** Graduation-cluster lifecycle statuses (`GraduationCluster.status`). */
export const {
	dataAtom: clusterStatusesDataAtom,
	refreshAtom: refreshClusterStatusesAtom,
} = atomWithMockData<ClusterStatusDatum[]>([]);
