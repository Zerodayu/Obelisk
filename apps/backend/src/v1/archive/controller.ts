import { cached } from "@lib/cache";
import {
	RoleAccessForbiddenError,
	CLUSTER_CONFIRM_ROLES,
	hasRole,
} from "@lib/role-access";
import { UnitScopeError, unitScopeOf } from "@lib/unit-scope";
import { authPlugin } from "@v1/auth/controller";
import { Elysia } from "elysia";

import { ClusterConfirmSchema, ClusterListQuerySchema } from "./model";
import {
	archiveService,
	ClusterConfirmForbiddenError,
	ClusterNotFoundError,
} from "./service";

const SECURITY = {
	security: [{ bearerAuth: [] as string[], apiKeyCookie: [] as string[] }],
};

/** The authenticated caller's role (better-auth additional field). */
function callerRole(user: unknown): string {
	return (user as { role?: string } | undefined)?.role ?? "user";
}

/** 403 — the caller's role is not in `confirmClusterCompile`. */
function assertCanConfirmCluster(role: string | undefined): void {
	if (!hasRole(role, CLUSTER_CONFIRM_ROLES)) {
		throw new ClusterConfirmForbiddenError();
	}
}

/** Map the service layer's typed errors onto HTTP statuses. */
function mapArchiveErrors(
	error: unknown,
	set: { status?: string | number },
): unknown {
	if (error instanceof ClusterConfirmForbiddenError) {
		set.status = 403;
		return { error: error.message };
	}
	if (error instanceof ClusterNotFoundError) {
		set.status = 404;
		return { error: error.message };
	}
	if (error instanceof UnitScopeError) {
		set.status = 403;
		return { error: error.message };
	}
	if (error instanceof RoleAccessForbiddenError) {
		set.status = 403;
		return { error: error.message };
	}
	throw error;
}

export const archivePlugin = new Elysia({
	prefix: "/archives",
	name: "archive",
	tags: ["Archive"],
})
	.use(authPlugin)
	.get(
		"/",
		cached(300, async ({ query, user, set }) => {
			try {
				return await archiveService.list(unitScopeOf(user), query);
			} catch (error) {
				return mapArchiveErrors(error, set);
			}
		}),
		{
			auth: true,
			query: ClusterListQuerySchema,
			detail: {
				summary: "List graduation-cluster archives",
				description:
					"Every compiled cluster in the caller's unit with its program, graduation term, lifecycle status, student count, and the confirm/compile/archive timestamps. `?programId=` is intersected with the caller's scope (403 for a foreign program); `?status=` filters by lifecycle.",
				...SECURITY,
				responses: {
					200: { description: "List of clusters" },
					401: { description: "Unauthorized" },
					403: { description: "programId is outside the caller's unit" },
				},
			},
		},
	)
	.get(
		"/composition",
		cached(300, async ({ user, set }) => {
			try {
				return await archiveService.composition(unitScopeOf(user));
			} catch (error) {
				return mapArchiveErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Archived students by status",
				description:
					"The student-status distribution across compiled `GraduationClusterEntry` rows — what actually survived the compile-time purge, not the live `Student` rows a cluster points at.",
				...SECURITY,
				responses: {
					200: { description: "Status -> archived student count" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/status-counts",
		cached(300, async ({ user, set }) => {
			try {
				return await archiveService.statusCounts(unitScopeOf(user));
			} catch (error) {
				return mapArchiveErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Graduation clusters by lifecycle status",
				description:
					"The open/compiling/archived distribution of clusters in the caller's unit.",
				...SECURITY,
				responses: {
					200: { description: "Status -> cluster count" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/:clusterId",
		cached(120, async ({ params, user, set }) => {
			try {
				return await archiveService.get(params.clusterId, unitScopeOf(user));
			} catch (error) {
				return mapArchiveErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get one graduation cluster with its compiled entries",
				description:
					'Read-only. An `open` cluster has no entries yet (it has not been compiled), which the client renders as "not yet compiled" rather than an error.',
				...SECURITY,
				responses: {
					200: { description: "Cluster with entries" },
					401: { description: "Unauthorized" },
					404: { description: "Cluster not found in the caller's unit" },
				},
			},
		},
	)
	.post(
		"/:clusterId/confirm",
		async ({ params, body, user, set }) => {
			// NOTE: role assert before the service call — a foreign unit's cluster
			// must not be distinguishable from a nonexistent one, so the unit
			// check inside the service answers 404 while this gate answers 403.
			assertCanConfirmCluster(callerRole(user));
			try {
				return await archiveService.confirm(
					params.clusterId,
					user.id,
					unitScopeOf(user),
					body,
				);
			} catch (error) {
				return mapArchiveErrors(error, set);
			}
		},
		{
			auth: true,
			body: ClusterConfirmSchema,
			detail: {
				summary: "Capture PEO attainment for a cluster",
				description:
					"Stamps the captured PEO attainment snapshot onto an `open` cluster (aqau/system_admin only) — the precondition a compile checks. A cluster that is missing, outside the caller's unit, or no longer `open` all answer the same 404: confirming a compiled cluster would rewrite a permanent record, and a more specific error would leak its lifecycle state.",
				...SECURITY,
				responses: {
					200: { description: "{ confirmed: true }" },
					401: { description: "Unauthorized" },
					403: { description: "Role may not confirm, or unit mismatch" },
					404: { description: "Cluster not found" },
					
				},
			},
		},
	);
