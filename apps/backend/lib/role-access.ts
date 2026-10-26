import type { UserRole } from "@prisma/generated/prisma/enums";

/**
 * Role-access vocabulary — the single source of truth for *which roles may
 * reach which feature* on the backend.
 *
 * Cross-cutting feature gates live here; per-form approval routing (preparer
 * roles + approver chains) stays in `lib/forms/approval-routes.ts`, which
 * sources its `ARCHIVE_ROLES` from this module. Controllers and services
 * assert against these lists — the frontend mirror (`frontend/lib/role-access.ts`)
 * only hides/navigates and is kept honest by `test/unit/role-access-sync.test.ts`.
 *
 * Every list is the **effective** allow-list: `system_admin` is included where
 * it holds a bypass. `managePlos` deliberately has **no** admin bypass — PLO
 * entity mutations are dean-only by institutional rule (SYSTEM-DESIGN §3).
 */
export const FEATURE_ACCESS = {
	/** Class-record capture: upload, roster edit/re-import, history, job status. */
	captureClassRecords: ["faculty", "program_chair", "system_admin"],
	/** Archive an approved submission (`POST /forms/:id/archive`). */
	archive: ["vpaa", "system_admin"],
	/** Open the graduation-cluster archive browse screens (read-only). */
	viewArchives: ["aqau", "vpaa", "system_admin"],
	/** Sit on the approval inbox / decide an approval step. */
	approveForms: ["program_chair", "dean", "aqau", "vpaa", "system_admin"],
	/** Create/update/delete PLO entities — dean only, no admin bypass. */
	managePlos: ["dean"],
	/** List/approve/deny role requests. */
	manageRoleRequests: ["system_admin"],
	/** Create the institution's reference data — departments and programs. */
	manageReferenceData: ["system_admin"],
	/**
	 * Create class sections (and their course/CLOs) — faculty/chair only for
	 * their own program, system_admin for any. Uploads bind to a section, so
	 * capture roles must be able to bring their own section into existence.
	 */
	manageClassSections: ["faculty", "program_chair", "system_admin"],
	/** Create a user account and grant it a role (admin-provisioned accounts). */
	manageUsers: ["system_admin"],
	/** Confirm a graduation cluster for compile. */
	confirmClusterCompile: ["aqau", "system_admin"],
	/**
	 * Trigger an AI CQI recommendation (`POST /ai/recommendation/generate` →
	 * python-server `/analytics/institutional-summary`, which runs an LLM
	 * call — INTEGRATION.md mandates the webapp enforce VPAA here).
	 * Viewing the latest persisted recommendation stays open to every role.
	 */
	generateAiInsights: ["vpaa", "system_admin"],
	/**
	 * Open the dashboard AI suggestions drawer and read its at-risk-by-program
	 * table (`GET /atrisk/flags`). UI gate — the recommendation read endpoint
	 * stays open and unit-scoped; dean and below are out because the table
	 * names students.
	 */
	viewAiInsights: ["aqau", "vpaa", "system_admin"],
	/**
	 * Read every user's audit trail (`GET /audit/logs` full waterfall).
	 * Self-scoped reads (own entries only) stay open to every role.
	 */
	viewAllAuditLogs: ["vpaa", "system_admin"],
	/**
	 * Read platform-wide data that is scoped to no unit — the platform user
	 * list (`GET /auth/users`), the user role distribution
	 * (`GET /auth/users/role-counts`), and the report-export format counts
	 * (`GET /reports/exports`). These are institution-level data (an
	 * institution's accounts, its role headcount, its export volume), so they
	 * are admin-only rather than open to every role like a unit-scoped read.
	 */
	viewPlatformStats: ["system_admin"],
} as const satisfies Record<string, readonly UserRole[]>;

export type FeatureKey = keyof typeof FEATURE_ACCESS;

/** Roles that may capture class records (the `/ingest/*` module). */
export const CLASS_RECORD_ROLES: readonly string[] =
	FEATURE_ACCESS.captureClassRecords;
/** Roles allowed to archive an approved submission. */
export const ARCHIVE_ROLES: readonly string[] = FEATURE_ACCESS.archive;
/** Roles that may create/edit/delete PLO entities. */
export const PLO_MANAGEMENT_ROLES: readonly string[] =
	FEATURE_ACCESS.managePlos;
/** Roles that may list/approve/deny role requests. */
export const ROLE_REQUEST_ROLES: readonly string[] =
	FEATURE_ACCESS.manageRoleRequests;
/** Roles that may create reference data (departments, programs). */
export const REFERENCE_DATA_ROLES: readonly string[] =
	FEATURE_ACCESS.manageReferenceData;
/** Roles that may create class sections (scoped to their own program). */
export const CLASS_SECTION_ROLES: readonly string[] =
	FEATURE_ACCESS.manageClassSections;
/** Roles that may create user accounts and grant them a role. */
export const USER_MANAGEMENT_ROLES: readonly string[] =
	FEATURE_ACCESS.manageUsers;
/** Roles that may confirm graduation-cluster compile. */
export const CLUSTER_CONFIRM_ROLES: readonly string[] =
	FEATURE_ACCESS.confirmClusterCompile;

/** Does `role` appear in the allow-list? */
export function hasRole(
	role: string | undefined,
	allowed: readonly string[],
): boolean {
	return role != null && allowed.includes(role);
}

/** 403 — caller's role does not permit this feature. */
export class RoleAccessForbiddenError extends Error {
	readonly status = 403;
	constructor(message: string) {
		super(message);
		this.name = "RoleAccessForbiddenError";
	}
}

/** May `role` capture class records (upload/edit/re-import/read history)? */
export function assertCanCaptureClassRecords(role: string | undefined): void {
	if (!hasRole(role, CLASS_RECORD_ROLES)) {
		throw new RoleAccessForbiddenError(
			`Your role (${role ?? "unauthenticated"}) may not capture class records — expected one of: ${CLASS_RECORD_ROLES.join(", ")}`,
		);
	}
}

/** Roles allowed to trigger an AI CQI recommendation (LLM call). */
export const AI_INSIGHT_GENERATION_ROLES: readonly string[] =
	FEATURE_ACCESS.generateAiInsights;

/** Roles that may read every user's audit-log entries (full waterfall). */
export const VIEW_ALL_AUDIT_ROLES: readonly string[] =
	FEATURE_ACCESS.viewAllAuditLogs;

/** Roles that may read platform-wide (non-unit-scoped) aggregates. */
export const PLATFORM_STATS_ROLES: readonly string[] =
	FEATURE_ACCESS.viewPlatformStats;

/** May `role` read platform-wide aggregates? */
export function assertCanViewPlatformStats(role: string | undefined): void {
	if (!hasRole(role, PLATFORM_STATS_ROLES)) {
		throw new RoleAccessForbiddenError(
			`Your role (${role ?? "unauthenticated"}) may not read platform-wide statistics — expected one of: ${PLATFORM_STATS_ROLES.join(", ")}`,
		);
	}
}

/** May `role` create reference data (departments, programs)? */
export function assertCanManageReferenceData(role: string | undefined): void {
	if (!hasRole(role, REFERENCE_DATA_ROLES)) {
		throw new RoleAccessForbiddenError(
			`Your role (${role ?? "unauthenticated"}) may not manage reference data — expected one of: ${REFERENCE_DATA_ROLES.join(", ")}`,
		);
	}
}

/** May `role` create class sections? (program scope is enforced separately) */
export function assertCanManageClassSections(role: string | undefined): void {
	if (!hasRole(role, CLASS_SECTION_ROLES)) {
		throw new RoleAccessForbiddenError(
			`Your role (${role ?? "unauthenticated"}) may not create class sections — expected one of: ${CLASS_SECTION_ROLES.join(", ")}`,
		);
	}
}

/** May `role` create user accounts and grant them a role? */
export function assertCanManageUsers(role: string | undefined): void {
	if (!hasRole(role, USER_MANAGEMENT_ROLES)) {
		throw new RoleAccessForbiddenError(
			`Your role (${role ?? "unauthenticated"}) may not manage users — expected one of: ${USER_MANAGEMENT_ROLES.join(", ")}`,
		);
	}
}

/** May `role` trigger an AI recommendation generation? */
export function assertCanGenerateAiInsights(role: string | undefined): void {
	if (!hasRole(role, AI_INSIGHT_GENERATION_ROLES)) {
		throw new RoleAccessForbiddenError(
			`Your role (${role ?? "unauthenticated"}) may not generate AI insights — expected one of: ${AI_INSIGHT_GENERATION_ROLES.join(", ")}`,
		);
	}
}

/**
 * May `role` read `GET /atrisk/flags` — class-record capture roles (the
 * action-taken watchlist picker) ∪ the AI-drawer roles (its by-program table).
 */
export const AT_RISK_READ_ROLES: readonly string[] = [
	...new Set([
		...FEATURE_ACCESS.captureClassRecords,
		...FEATURE_ACCESS.viewAiInsights,
	]),
];

/** 403 — caller's role may not read the at-risk watchlist. */
export function assertCanReadAtRiskFlags(role: string | undefined): void {
	if (!hasRole(role, AT_RISK_READ_ROLES)) {
		throw new RoleAccessForbiddenError(
			`Your role (${role ?? "unauthenticated"}) may not read the at-risk watchlist — expected one of: ${AT_RISK_READ_ROLES.join(", ")}`,
		);
	}
}
