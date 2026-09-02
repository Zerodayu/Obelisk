import { cached } from "@lib/cache";
import { authPlugin } from "@v1/auth/controller";
import { Elysia, t } from "elysia";
import {
	CreateFormSubmissionSchema,
	SubmitFormSchema,
	UpdateFormSubmissionSchema,
} from "./model";
import { NoPendingApprovalError, submissionService } from "./service";

const APPROVER_ROLE_ENUM = {
	program_chair: "program_chair",
	dean: "dean",
	aqau: "aqau",
	vpaa: "vpaa",
} as const;

export const formsPlugin = new Elysia({
	prefix: "/forms",
	name: "forms",
	tags: ["Forms"],
})
	.use(authPlugin)
	.get(
		"/",
		cached(60, async ({ query }) =>
			submissionService.list({
				...(query.formTypeId ? { formTypeId: query.formTypeId } : {}),
				...(query.classSectionId
					? { classSectionId: query.classSectionId }
					: {}),
				...(query.status ? { status: query.status } : {}),
			}),
		),
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
			}),
			detail: {
				summary: "List form submissions",
				description: "Filtered by formTypeId/classSectionId/status",
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
		cached(120, async ({ params, set }) => {
			const submission = await submissionService.findById(params.id);
			if (!submission) {
				set.status = 404;
				return { error: "Submission not found" };
			}
			return submission;
		}),
		{
			auth: true,
			detail: {
				summary: "Get a form submission by id",
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
		async ({ params, body, user }) =>
			submissionService.update(params.id, user.id, body),
		{
			auth: true,
			body: UpdateFormSubmissionSchema,
			detail: {
				summary: "Update a draft/returned form submission",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Updated form submission" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/:id/submit",
		async ({ params, body, user }) =>
			submissionService.submit(params.id, user.id, body.steps),
		{
			auth: true,
			body: SubmitFormSchema,
			detail: {
				summary: "Submit a form for approval",
				description:
					"Creates the ordered ApprovalStep chain and moves the submission to submitted.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Submitted form with approval chain" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/:id/approve/:role",
		async ({ params, body, user, set }) => {
			try {
				return await submissionService.decide(params.id, params.role, user.id, {
					decision: "approved",
					comment: body.comment,
				});
			} catch (error) {
				if (error instanceof NoPendingApprovalError) set.status = 409;
				throw error;
			}
		},
		{
			auth: true,
			params: t.Object({ id: t.String(), role: t.Enum(APPROVER_ROLE_ENUM) }),
			body: t.Object({ comment: t.Optional(t.String()) }),
			detail: {
				summary: "Approve the current pending step for a role",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Approved form submission" },
					401: { description: "Unauthorized" },
					409: { description: "No pending step for role" },
				},
			},
		},
	)
	.post(
		"/:id/return",
		async ({ params, body, user, set }) => {
			try {
				return await submissionService.decide(params.id, body.role, user.id, {
					decision: "returned",
					comment: body.comment,
				});
			} catch (error) {
				if (error instanceof NoPendingApprovalError) set.status = 409;
				throw error;
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
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Returned form submission" },
					401: { description: "Unauthorized" },
					409: { description: "No pending step for role" },
				},
			},
		},
	)
	.post(
		"/:id/archive",
		async ({ params, user }) => submissionService.archive(params.id, user.id),
		{
			auth: true,
			detail: {
				summary: "Archive an approved form submission",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Archived form submission" },
					401: { description: "Unauthorized" },
				},
			},
		},
	);
