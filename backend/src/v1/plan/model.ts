import type { IpdStage } from "@prisma/generated/prisma/client";
import { t } from "elysia";

// --- Shared request schemas --------------------------------------------------

export const PlanListQuerySchema = t.Object({
	programId: t.Optional(t.String()),
});

export type PlanListQuery = typeof PlanListQuerySchema.static;

export const PlanInitSchema = t.Object({
	programId: t.String({ description: "Program the setup form belongs to" }),
	termId: t.String({
		description:
			"AcademicTerm anchoring the submission (FormSubmission.termId)",
	}),
});

export type PlanInit = typeof PlanInitSchema.static;

// --- curriculum_map (F01) ----------------------------------------------------

export const CurriculumHeaderSchema = t.Object({
	programTitle: t.Optional(t.String()),
	departmentChair: t.Optional(t.String()),
	academicYear: t.Optional(t.String()),
	curriculumCommitteeChair: t.Optional(t.String()),
	reviewDate: t.Optional(t.String()),
	dateFiledWithAqau: t.Optional(t.String()),
	revisionNumber: t.Optional(t.String()),
});

export type CurriculumHeader = typeof CurriculumHeaderSchema.static;

const EvidenceSourceSchema = t.Union([
	t.Literal("exam"),
	t.Literal("rubric"),
	t.Literal("portfolio"),
	t.Literal("capstone"),
	t.Literal("ojt"),
]);

export const PloDirectoryRowInputSchema = t.Object({
	ploCode: t.String(),
	statement: t.String(),
	evidenceSources: t.Array(EvidenceSourceSchema, { default: [] }),
	dStageCourse: t.Optional(t.String()),
	validationStatus: t.Optional(
		t.Union([
			t.Literal("confirmed"),
			t.Literal("pending_review"),
			t.Literal("needs_update"),
		]),
	),
});

export type PloDirectoryRowInput = typeof PloDirectoryRowInputSchema.static;

export const CurriculumCellInputSchema = t.Object({
	ploCode: t.String(),
	stage: t.Optional(t.Union([t.Literal("i"), t.Literal("p"), t.Literal("d")])),
	cloCodes: t.Optional(t.String()),
});

export type CurriculumCellInput = typeof CurriculumCellInputSchema.static;

export const CurriculumCourseRowInputSchema = t.Object({
	yearLevel: t.Integer({ minimum: 1, maximum: 4 }),
	courseCode: t.String(),
	courseTitle: t.String(),
	cells: t.Array(CurriculumCellInputSchema, { default: [] }),
});

export type CurriculumCourseRowInput =
	typeof CurriculumCourseRowInputSchema.static;

export const SaveCurriculumMapSchema = t.Object({
	header: t.Optional(CurriculumHeaderSchema),
	plos: t.Array(PloDirectoryRowInputSchema, {
		description: "Section B PLO directory — full replacement on save",
	}),
	courses: t.Array(CurriculumCourseRowInputSchema, {
		description:
			"Section C course rows with I-P-D cells — full replacement on save",
	}),
});

export type SaveCurriculumMap = typeof SaveCurriculumMapSchema.static;

// --- assessment_calendar (F03) ------------------------------------------------

export const CalendarHeaderSchema = t.Object({
	program: t.Optional(t.String()),
	programChair: t.Optional(t.String()),
	academicYear: t.Optional(t.String()),
	dateApprovedByDean: t.Optional(t.String()),
	dateFiledWithAqau: t.Optional(t.String()),
	dateDistributed: t.Optional(t.String()),
});

export type CalendarHeader = typeof CalendarHeaderSchema.static;

export const CalendarEventInputSchema = t.Object({
	id: t.Optional(
		t.String({ description: "Existing CalendarEventRow id to update" }),
	),
	section: t.Union([
		t.Literal("semester1"),
		t.Literal("annual_and_semester2"),
		t.Literal("program_specific"),
	]),
	templateKey: t.Optional(t.String()),
	periodWeeks: t.Optional(t.String()),
	activity: t.Optional(t.String()),
	cohortYears: t.Optional(t.Array(t.Integer({ minimum: 1, maximum: 4 }))),
	responsibleParty: t.Optional(t.String()),
	outputForms: t.Optional(t.Array(t.String())),
});

export type CalendarEventInput = typeof CalendarEventInputSchema.static;

export const SaveAssessmentCalendarSchema = t.Object({
	header: t.Optional(CalendarHeaderSchema),
	events: t.Array(CalendarEventInputSchema, {
		description: "Row updates (by id) and new program-specific rows",
	}),
	removeEventIds: t.Optional(
		t.Array(t.String(), {
			description:
				"Program-specific row ids to delete; template rows are protected",
		}),
	),
});

export type SaveAssessmentCalendar = typeof SaveAssessmentCalendarSchema.static;

// --- target_setting_matrix (F04) ----------------------------------------------

export const TargetHeaderSchema = t.Object({
	program: t.Optional(t.String()),
	programChair: t.Optional(t.String()),
	academicYear: t.Optional(t.String()),
	priorYearProgramPloAvg: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	priorYearY4PloAttainment: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	pacReviewDate: t.Optional(t.String()),
});

export type TargetHeader = typeof TargetHeaderSchema.static;

const TargetPctSchema = t.Number({ minimum: 0, maximum: 100 });

export const PloTargetRowInputSchema = t.Object({
	ploCode: t.String(),
	statement: t.Optional(t.String()),
	y1TargetPct: TargetPctSchema,
	y2TargetPct: TargetPctSchema,
	y3TargetPct: TargetPctSchema,
	y4TargetPct: TargetPctSchema,
	rationale: t.Optional(t.String()),
});

export type PloTargetRowInput = typeof PloTargetRowInputSchema.static;

export const CourseCloTargetRowInputSchema = t.Object({
	courseCode: t.String(),
	courseTitle: t.Optional(t.String()),
	cloCode: t.String(),
	y1TargetPct: t.Optional(TargetPctSchema),
	y2TargetPct: t.Optional(TargetPctSchema),
	y3TargetPct: t.Optional(TargetPctSchema),
	y4TargetPct: t.Optional(TargetPctSchema),
	notes: t.Optional(t.String()),
});

export type CourseCloTargetRowInput =
	typeof CourseCloTargetRowInputSchema.static;

export const SaveTargetSettingMatrixSchema = t.Object({
	header: t.Optional(TargetHeaderSchema),
	ploRows: t.Array(PloTargetRowInputSchema, {
		description: "Section 2 per-PLO targets — full replacement on save",
	}),
	courseRows: t.Array(CourseCloTargetRowInputSchema, {
		description: "Section 3 priority-course CLO targets — full replacement",
	}),
});

export type SaveTargetSettingMatrix =
	typeof SaveTargetSettingMatrixSchema.static;

// --- assessment_budget (F06) ---------------------------------------------------

export const BudgetHeaderSchema = t.Object({
	program: t.Optional(t.String()),
	dean: t.Optional(t.String()),
	academicYear: t.Optional(t.String()),
	totalBudgetRequested: t.Optional(t.Number({ minimum: 0 })),
	dateDeanApproved: t.Optional(t.String()),
	dateVpaaApproved: t.Optional(t.String()),
	vpaaName: t.Optional(t.String()),
});

export type BudgetHeader = typeof BudgetHeaderSchema.static;

export const BudgetLineItemInputSchema = t.Object({
	id: t.Optional(
		t.String({ description: "Existing BudgetLineItem id to update" }),
	),
	phase: t.Optional(
		t.Union([
			t.Literal("plan"),
			t.Literal("do"),
			t.Literal("check"),
			t.Literal("act"),
		]),
	),
	name: t.Optional(t.String()),
	estimatedCost: t.Optional(t.Number({ minimum: 0 })),
	approvedCost: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
	source: t.Optional(
		t.Union([
			t.Literal("aqau"),
			t.Literal("dean"),
			t.Literal("vpaa"),
			t.Null(),
		]),
	),
	notes: t.Optional(t.Union([t.String(), t.Null()])),
});

export type BudgetLineItemInput = typeof BudgetLineItemInputSchema.static;

export const SaveAssessmentBudgetSchema = t.Object({
	header: t.Optional(BudgetHeaderSchema),
	lineItems: t.Array(BudgetLineItemInputSchema, {
		description: "Line-item updates (by id) and new program-specific items",
	}),
	removeLineItemIds: t.Optional(
		t.Array(t.String(), {
			description: "Extra item ids to delete; fixed items are protected",
		}),
	),
});

export type SaveAssessmentBudget = typeof SaveAssessmentBudgetSchema.static;

// --- Assembled payload types ---------------------------------------------------

export type PlanSubmissionListItem = {
	id: string;
	status: string;
	currentApproverRole: string | null;
	createdAt: Date;
	updatedAt: Date;
	program: { code: string; name: string } | null;
};

export type PloDirectoryRowDto = {
	id: string;
	ploId: string | null;
	code: string;
	statement: string;
	evidenceSources: string[];
	dStageCourse: string | null;
	validationStatus: string;
};

export type CurriculumMapCellDto = {
	id: string;
	ploCode: string;
	stage: IpdStage | null;
	cloCodes: string | null;
};

export type CurriculumCourseRowDto = {
	id: string;
	yearLevel: number;
	courseCode: string;
	courseTitle: string;
	cells: CurriculumMapCellDto[];
};

export type CurriculumMapPayload = {
	formSubmissionId: string;
	generatedAt: string;
	header: Record<string, unknown>;
	directoryRows: PloDirectoryRowDto[];
	courseRows: CurriculumCourseRowDto[];
	coverageCheck: Record<string, boolean>;
};

export type CalendarEventRowDto = {
	id: string;
	section: string;
	templateKey: string | null;
	isTemplate: boolean;
	periodWeeks: string | null;
	activity: string;
	cohortYears: number[];
	responsibleParty: string | null;
	outputForms: string[];
};

export type AssessmentCalendarPayload = {
	formSubmissionId: string;
	generatedAt: string;
	header: Record<string, unknown>;
	events: CalendarEventRowDto[];
};

export type PloTargetRowDto = {
	id: string;
	ploId: string | null;
	ploCode: string;
	statement: string | null;
	targets: [number, number, number, number];
	rationale: string | null;
};

export type CourseCloTargetRowDto = {
	id: string;
	courseCode: string;
	courseTitle: string | null;
	cloCode: string;
	targets: (number | null)[];
	notes: string | null;
};

export type TargetSettingMatrixPayload = {
	formSubmissionId: string;
	generatedAt: string;
	header: Record<string, unknown>;
	ploRows: PloTargetRowDto[];
	programPloAvg: number[];
	courseRows: CourseCloTargetRowDto[];
};

export type BudgetLineItemDto = {
	id: string;
	phase: string;
	name: string;
	isFixed: boolean;
	estimatedCost: number;
	approvedCost: number | null;
	source: string | null;
	notes: string | null;
};

export type AssessmentBudgetPayload = {
	formSubmissionId: string;
	generatedAt: string;
	header: Record<string, unknown>;
	lineItems: BudgetLineItemDto[];
	totals: { estimatedTotal: number; approvedTotal: number };
};
