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
	viewArchives: ["vpaa", "system_admin"],
	/** Sit on the approval inbox / decide an approval step. */
	approveForms: ["program_chair", "dean", "aqau", "vpaa", "system_admin"],
	/** Create/update/delete PLO entities — dean only, no admin bypass. */
	managePlos: ["dean"],
	/** List/approve/deny role requests. */
	manageRoleRequests: ["system_admin"],
	/** Confirm a graduation cluster for compile. */
	confirmClusterCompile: ["aqau", "system_admin"],
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
