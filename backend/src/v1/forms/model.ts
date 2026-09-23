import { t } from "elysia";

export const CreateFormSubmissionSchema = t.Object({
	formTypeId: t.String(),
	classSectionId: t.Optional(t.String()),
	programId: t.Optional(t.String()),
	termId: t.String(),
	formData: t.Optional(t.Any()),
});

export const UpdateFormSubmissionSchema = t.Partial(
	t.Object({
		classSectionId: t.String(),
		programId: t.String(),
		formData: t.Any(),
	}),
);

export const CreateApprovalStepSchema = t.Object({
	approverRole: t.Enum({
		program_chair: "program_chair",
		dean: "dean",
		aqau: "aqau",
		vpaa: "vpaa",
	}),
	sequenceNo: t.Integer({ minimum: 1 }),
});

export const DecideApprovalStepSchema = t.Object({
	decision: t.Union([t.Literal("approved"), t.Literal("returned")]),
	comment: t.Optional(t.String()),
});

/**
 * `steps` is deprecated and ignored — the approval chain is derived
 * server-side from the form's registered route
 * (`lib/forms/approval-routes.ts`). Kept optional for backward compatibility.
 */
export const SubmitFormSchema = t.Object({
	steps: t.Optional(
		t.Array(CreateApprovalStepSchema, {
			description: "Deprecated — ignored; the server derives the chain",
		}),
	),
});

export type CreateFormSubmission = typeof CreateFormSubmissionSchema.static;
export type UpdateFormSubmission = typeof UpdateFormSubmissionSchema.static;
export type CreateApprovalStep = typeof CreateApprovalStepSchema.static;
export type DecideApprovalStep = typeof DecideApprovalStepSchema.static;
export type SubmitForm = typeof SubmitFormSchema.static;
