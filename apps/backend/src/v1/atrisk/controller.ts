import { NotOwnerError } from "@lib/forms/approval-routes";
import { InvalidTransitionError } from "@lib/forms/state-machine";
import { SubmitGateError } from "@lib/forms/submit-gates";
import {
	assertCanCaptureClassRecords,
	RoleAccessForbiddenError,
} from "@lib/role-access";
import { assertSubmissionInScope, unitScopeOf } from "@lib/unit-scope";
import { authPlugin } from "@v1/auth/controller";
import { Elysia } from "elysia";

import {
	ActionTakenInitSchema,
	AtRiskFlagsQuerySchema,
	SaveActionTakenSchema,
} from "./model";
import {
	ActionTakenInvalidEditError,
	ActionTakenSubmissionNotFoundError,
	AtRiskSectionNotFoundError,
	atRiskService,
} from "./service";

const SECURITY = {
	security: [{ bearerAuth: [] as string[], apiKeyCookie: [] as string[] }],
};

/** The authenticated caller's role (better-auth additional field). */
function callerRole(user: unknown): string {
	return (user as { role?: string } | undefined)?.role ?? "user";
}

/** Map the service layer's typed errors onto HTTP statuses. */
function mapAtRiskErrors(
	error: unknown,
	set: { status?: string | number },
): unknown {
	if (
		error instanceof AtRiskSectionNotFoundError ||
		error instanceof ActionTakenSubmissionNotFoundError
	) {
		set.status = 404;
		return { error: error.message };
	}
	if (
		error instanceof RoleAccessForbiddenError ||
		error instanceof NotOwnerError
	) {
		set.status = 403;
		return { error: error.message };
	}
	if (
		error instanceof ActionTakenInvalidEditError ||
		error instanceof InvalidTransitionError ||
		error instanceof SubmitGateError
	) {
		set.status = 409;
		return { error: error.message };
	}
	throw error;
}

export const atRiskPlugin = new Elysia({
	prefix: "/atrisk",
	name: "atrisk",
	tags: ["At-Risk"],
})
	.use(authPlugin)
	// --- At-risk watchlist -------------------------------------------------------
	.get(
		"/flags",
		async ({ query, user, set }) => {
			try {
				assertCanCaptureClassRecords(callerRole(user));
				// NOTE: deliberately NOT wrapped in `cached()` — the watchlist has
				// to reflect flag clears the moment a final approval lands, and
				// `cached` keys are opaque URL hashes with no invalidation hook
				// (see lib/cache.ts). One indexed count per call is cheap.
				return await atRiskService.listFlags(
					unitScopeOf(user),
					query.classSectionId,
				);
			} catch (error) {
				return mapAtRiskErrors(error, set);
			}
		},
		{
			auth: true,
			query: AtRiskFlagsQuerySchema,
			detail: {
				summary: "List at-risk flags (student watchlist)",
				description:
					"One row per AtRiskFlag with the student and the flagged CLO; optional `classSectionId` scopes to a section via cloAttainment.",
				...SECURITY,
				responses: {
					200: { description: "List of at-risk flags" },
					401: { description: "Unauthorized" },
					403: { description: "Caller's role may not capture class records" },
				},
			},
		},
	)
	// --- Action-taken form -------------------------------------------------------
	.post(
		"/action/init",
		async ({ body, user, set }) => {
			try {
				return await atRiskService.init(body.classSectionId, user.id);
			} catch (error) {
				return mapAtRiskErrors(error, set);
			}
		},
		{
			auth: true,
			body: ActionTakenInitSchema,
			detail: {
				summary: "Open (or reuse) an action-taken draft for a class section",
				description:
					"Resolves term and program from the section server-side; reuses the newest draft/returned/submitted submission.",
				...SECURITY,
				responses: {
					201: { description: "Draft id" },
					401: { description: "Unauthorized" },
					404: { description: "Class section not found" },
				},
			},
		},
	)
	.get(
		"/action/:id",
		async ({ params, user, set }) => {
			// NOTE: unit gate — an action-taken draft from another
			// program/department is refused (403) before it is read.
			await assertSubmissionInScope(unitScopeOf(user), params.id);
			try {
				return await atRiskService.get(params.id);
			} catch (error) {
				return mapAtRiskErrors(error, set);
			}
		},
		{
			auth: true,
			detail: {
				summary: "Get an action-taken submission by id",
				description:
					"Includes the ordered approval steps, the form type, and the submitter.",
				...SECURITY,
				responses: {
					200: { description: "Action-taken submission" },
					401: { description: "Unauthorized" },
					404: { description: "Not found" },
				},
			},
		},
	)
	.put(
		"/action/:id",
		async ({ params, body, user, set }) => {
			try {
				return await atRiskService.save(
					params.id,
					user.id,
					callerRole(user),
					body,
				);
			} catch (error) {
				return mapAtRiskErrors(error, set);
			}
		},
		{
			auth: true,
			body: SaveActionTakenSchema,
			detail: {
				summary: "Save the student selection + intervention note",
				description: "Owner (or system_admin) only; draft/returned only.",
				...SECURITY,
				responses: {
					200: { description: "Updated submission" },
					401: { description: "Unauthorized" },
					403: { description: "Caller is not the submission owner" },
					404: { description: "Not found" },
					409: { description: "Submission not editable" },
				},
			},
		},
	);
