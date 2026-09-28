import {
	ApprovalForbiddenError,
	NotOwnerError,
} from "@lib/forms/approval-routes";
import { InvalidTransitionError } from "@lib/forms/state-machine";
import { SubmitGateError } from "@lib/forms/submit-gates";
import { authPlugin } from "@v1/auth/controller";
import { Elysia, t } from "elysia";
import {
	CreateFormSubmissionSchema,
	SubmitFormSchema,
	UpdateFormSubmissionSchema,
} from "./model";
import {
	NoPendingApprovalError,
	SubmissionNotFoundError,
	scopeWhere,
	submissionService,
} from "./service";

const APPROVER_ROLE_ENUM = {
	program_chair: "program_chair",
	dean: "dean",
	aqau: "aqau",
	vpaa: "vpaa",
} as const;

/** The authenticated caller's role (better-auth additional field). */
function callerRole(user: unknown): string {
	return (user as { role?: string } | undefined)?.role ?? "user";
}

/** Map the service layer's typed errors onto HTTP statuses. */
function mapFormsError(
	error: unknown,
	set: { status?: string | number },
): unknown {
	if (error instanceof SubmissionNotFoundError) {
		set.status = 404;
		return { error: error.message };
	}
	if (
		error instanceof ApprovalForbiddenError ||
		error instanceof NotOwnerError
	) {
		set.status = 403;
		return { error: error.message };
	}
	if (
		error instanceof InvalidTransitionError ||
		error instanceof NoPendingApprovalError ||
		error instanceof SubmitGateError
	) {
		set.status = 409;
		return { error: error.message };
	}
	throw error;
}

export const formsPlugin = new Elysia({
	prefix: "/forms",
	name: "forms",
	tags: ["Forms"],
})
	.use(authPlugin)
	.get(
		"/",
		async ({ query, user }) =>
			submissionService.list({
				...(query.formTypeId ? { formTypeId: query.formTypeId } : {}),
				...(query.classSectionId
					? { classSectionId: query.classSectionId }
					: {}),
				...(query.status ? { status: query.status } : {}),
				// Session-derived scoping — the caller cannot spoof whose inbox
				// or approval queue they are listing.
				...scopeWhere(query.scope, {
					id: user.id,
					role: callerRole(user),
				}),
			}),
		{
			auth: true,
			query: t.Object({
				formTypeId: t.Optional(t.String()),
				classSectionId: t.Optional(t.String()),
				status: t.Optional(
					t.Union([
						t.Literal("draft"),
						t.Literal("submitted"),
						t.Literal("returned"),
						t.Literal("approved"),
						t.Literal("archived"),
					]),
				),
				scope: t.Optional(
					t.Union([t.Literal("mine"), t.Literal("pending")], {
						description:
							"mine = caller's own submissions; pending = submitted records awaiting the caller's role (all pending for system_admin)",
					}),
				),
			}),
			detail: {
				summary: "List form submissions",
				description:
					"Filtered by formTypeId/classSectionId/status, or by session-derived `scope=mine|pending` for the submission inboxes.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "List of form submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/",
		async ({ body, user }) => submissionService.create(body, user.id),
		{
			auth: true,
			body: CreateFormSubmissionSchema,
			detail: {
				summary: "Create a form submission draft",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					201: { description: "Created form submission" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/:id",
		async ({ params, set }) => {
			// Uncached: the stepper must reflect the latest decision right after
			// an approve/return.
			const submission = await submissionService.findById(params.id);
			if (!submission) {
				set.status = 404;
				return { error: "Submission not found" };
			}
			return submission;
		},
		{
			auth: true,
			detail: {
				summary: "Get a form submission by id",
				description:
					"Includes the ordered approval steps, the form type (code/name/pdcaStage), and the submitter.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Form submission" },
					401: { description: "Unauthorized" },
					404: { description: "Not found" },
				},
			},
		},
	)
	.put(
		"/:id",
		async ({ params, body, user, set }) => {
			try {
				return await submissionService.update(
					params.id,
					user.id,
					callerRole(user),
					body,
				);
			} catch (error) {
				return mapFormsError(error, set);
			}
		},
		{
			auth: true,
			body: UpdateFormSubmissionSchema,
			detail: {
				summary: "Update a draft/returned form submission",
				description: "Owner (or system_admin) only.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Updated form submission" },
					401: { description: "Unauthorized" },
					403: { description: "Caller is not the submission owner" },
					404: { description: "Not found" },
					409: { description: "Submission is not editable" },
				},
			},
		},
	)
	.post(
		"/:id/submit",
		async ({ params, user, set }) => {
			try {
				// Body steps ignored — the chain comes from the form's registered
				// route (lib/forms/approval-routes.ts).
				return await submissionService.submit(
					params.id,
					user.id,
					callerRole(user),
				);
			} catch (error) {
				return mapFormsError(error, set);
			}
		},
		{
			auth: true,
			body: SubmitFormSchema,
			detail: {
				summary: "Submit a form for approval",
				description:
					"Derives the ordered ApprovalStep chain from the form's registered approval route (owner + preparer-role required) and moves the submission to submitted.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Submitted form with approval chain" },
					401: { description: "Unauthorized" },
					403: { description: "Not the owner or not a preparer role" },
					404: { description: "Not found" },
					409: { description: "Invalid transition or submit gate blocked" },
				},
			},
		},
	)
	.post(
		"/:id/approve/:role",
		async ({ params, body, user, set }) => {
			try {
				return await submissionService.decide(
					params.id,
					params.role,
					user.id,
					callerRole(user),
					{ decision: "approved", comment: body.comment },
				);
			} catch (error) {
				return mapFormsError(error, set);
			}
		},
		{
			auth: true,
			params: t.Object({ id: t.String(), role: t.Enum(APPROVER_ROLE_ENUM) }),
			body: t.Object({ comment: t.Optional(t.String()) }),
			detail: {
				summary: "Approve the current pending step for a role",
				description:
					"Caller must hold the step's role; system_admin may act on any step.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Approved form submission" },
					401: { description: "Unauthorized" },
					403: { description: "Caller's role may not decide this step" },
					404: { description: "Not found" },
					409: { description: "No pending step for role" },
				},
			},
		},
	)
	.post(
		"/:id/return",
		async ({ params, body, user, set }) => {
			try {
				return await submissionService.decide(
					params.id,
					body.role,
					user.id,
					callerRole(user),
					{ decision: "returned", comment: body.comment },
				);
			} catch (error) {
				return mapFormsError(error, set);
			}
		},
		{
			auth: true,
			body: t.Object({
				role: t.Enum(APPROVER_ROLE_ENUM),
				comment: t.Optional(t.String()),
			}),
			detail: {
				summary: "Return the current pending step for a role",
				description:
					"Caller must hold the step's role; system_admin may act on any step.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Returned form submission" },
					401: { description: "Unauthorized" },
					403: { description: "Caller's role may not decide this step" },
					404: { description: "Not found" },
					409: { description: "No pending step for role" },
				},
			},
		},
	)
	.post(
		"/:id/archive",
		async ({ params, user, set }) => {
			try {
				return await submissionService.archive(
					params.id,
					user.id,
					callerRole(user),
				);
			} catch (error) {
				return mapFormsError(error, set);
			}
		},
		{
			auth: true,
			detail: {
				summary: "Archive an approved form submission",
				description: "aqau/vpaa/system_admin only.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Archived form submission" },
					401: { description: "Unauthorized" },
					403: { description: "Caller may not archive" },
					404: { description: "Not found" },
					409: { description: "Submission is not approved" },
				},
			},
		},
	);
