import { t } from "elysia";

export const UploadClassRecordSchema = t.Object({
	file: t.File({ description: "Class-record .xlsx workbook" }),
	classSectionId: t.String({
		description: "ID of the ClassSection to associate attainments with",
	}),
});

export type UploadClassRecord = typeof UploadClassRecordSchema.static;

export const ListAttainmentsSchema = t.Object({
	classSectionId: t.String({
		description: "ClassSection whose roster rows to list",
	}),
	computationRunId: t.Optional(
		t.String({
			description: "Specific ComputationRun (defaults to the section's latest)",
		}),
	),
});

export type ListAttainments = typeof ListAttainmentsSchema.static;

export const UpdateAttainmentsSchema = t.Object({
	classSectionId: t.String({
		description: "ClassSection owning the attainment rows",
	}),
	updates: t.Array(
		t.Object({
			attainmentId: t.String({
				description: "CloAttainment row id to edit",
			}),
			directScorePct: t.Number({
				description: "New direct CLO score, 0–100 scale",
				minimum: 0,
				maximum: 100,
			}),
		}),
		{
			minItems: 1,
			description: "Per-student CLO score edits",
		},
	),
});

export type UpdateAttainments = typeof UpdateAttainmentsSchema.static;

export const ReimportScoresSchema = t.Object({
	file: t.File({
		description:
			"Wide-format roster CSV/TSV (header: student_name, student_id?, CLO1, CLO2, …)",
	}),
	classSectionId: t.String({
		description: "ClassSection to re-import scores into",
	}),
	computationRunId: t.Optional(
		t.String({
			description: "Specific ComputationRun (defaults to the section's latest)",
		}),
	),
});

export type ReimportScores = typeof ReimportScoresSchema.static;
