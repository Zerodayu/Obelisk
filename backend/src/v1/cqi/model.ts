import type {
	InterventionStatus,
	LoopStatus,
} from "@prisma/generated/prisma/client";
import { t } from "elysia";
import type { PloCohortSummary } from "./compute";

// --- Request schemas ------------------------------------------------------

/** Shared filter for listing CQI submissions. */
export const CqiListQuerySchema = t.Object({
	programId: t.Optional(t.String()),
});

export type CqiListQuery = typeof CqiListQuerySchema.static;

export const PloGapParamsSchema = t.Object({
	programId: t.String({
		description: "Program whose PLO-by-cohort attainment gap matrix to build",
	}),
	termId: t.String({
		description: "AcademicTerm the gap analysis consolidates",
	}),
});

export type PloGapParams = typeof PloGapParamsSchema.static;

export const GapRowEditSchema = t.Object({
	id: t.String({ description: "GapRow id on this gap analysis submission" }),
	rootCauseCategory: t.Optional(
		t.String({
			description:
				"One of the six canonical root-cause categories (lib/validators/root-cause).",
		}),
	),
	rootCauseAnalysis: t.Optional(t.String()),
	namedOwner: t.Optional(t.String()),
});

export const SaveGapAnalysisSchema = t.Object({
	gapRows: t.Array(GapRowEditSchema, {
		description: "Edits applied to the derived gap matrix rows",
	}),
	programChairSummary: t.Optional(t.String()),
});

export type SaveGapAnalysis = typeof SaveGapAnalysisSchema.static;

export const CqiPlanParamsSchema = t.Object({
	programId: t.String({
		description: "Program whose gaps feed this CQI action plan",
	}),
	termId: t.String({
		description: "AcademicTerm (cycle) this action plan targets",
	}),
});

export type CqiPlanParams = typeof CqiPlanParamsSchema.static;

export const CqiEntryEditSchema = t.Object({
	id: t.String({ description: "CqiEntry id on this action plan submission" }),
	evidenceSource: t.Optional(t.String()),
	rootCauseCategory: t.Optional(t.String()),
	intervention: t.Optional(t.String()),
	owner: t.Optional(t.String()),
	ownerRole: t.Optional(t.String()),
	timelineAndKpi: t.Optional(t.String()),
});

export const SaveCqiPlanSchema = t.Object({
	entries: t.Array(CqiEntryEditSchema, {
		description:
			"Edits to the planned CQI entries (specific intervention, owner, timeline/KPI)",
	}),
});

export type SaveCqiPlan = typeof SaveCqiPlanSchema.static;

export const TrackCqiEntriesSchema = t.Object({
	entries: t.Array(
		t.Object({
			id: t.String({ description: "CqiEntry id to mark tracked" }),
			interventionImplemented: t.Enum({
				yes: "yes",
				partial: "partial",
				no: "no",
			}),
			currentAttainmentPct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
		}),
		{
			description:
				"End-of-cycle completion results that flip entries to the tracked phase",
		},
	),
});

export type TrackCqiEntries = typeof TrackCqiEntriesSchema.static;

export const CtlParamsSchema = t.Object({
	programId: t.String({
		description: "Program whose CQI loops close in this CTL report",
	}),
	termId: t.String({
		description: "AcademicTerm (cycle) the CTL report re-assesses",
	}),
});

export type CtlParams = typeof CtlParamsSchema.static;

export const CtlRowEditSchema = t.Object({
	id: t.String({ description: "CtlRow id on this CTL submission" }),
	gapFindingAndEvidence: t.Optional(t.String()),
	interventionImplementedText: t.Optional(t.String()),
	priorAttainmentPct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	currentAttainmentPct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	conditions12Met: t.Optional(t.Boolean()),
	condition3Met: t.Optional(t.Boolean()),
	condition4Met: t.Optional(t.Boolean()),
	condition5Met: t.Optional(t.Boolean()),
});

export const IdentifyStepSchema = t.Object({
	c1PriorCycleKpisAchieved: t.Optional(t.String()),
	c2PreviouslyMetDeclining: t.Optional(t.String()),
	c3ExternalShifts: t.Optional(t.String()),
	c4ProactiveImprovements: t.Optional(t.String()),
});

export const SaveCtlSchema = t.Object({
	rows: t.Array(CtlRowEditSchema, {
		description: "Edits to the CTL rows; loop status is recomputed server-side",
	}),
	identify: t.Optional(IdentifyStepSchema),
});

export type SaveCtl = typeof SaveCtlSchema.static;

export const AparParamsSchema = t.Object({
	programId: t.String({
		description: "Program whose annual assessment report to generate",
	}),
	termId: t.Optional(
		t.String({
			description:
				"Optional term to pin the report; defaults to the program's latest term with stored attainment",
		}),
	),
});

export type AparParams = typeof AparParamsSchema.static;

export const SaveAparSchema = t.Object({
	attachments: t.Optional(
		t.Object(
			{
				cohort_tracking: t.Optional(t.Boolean()),
				clo_attainment_summary_s1: t.Optional(t.Boolean()),
				clo_attainment_summary_s2: t.Optional(t.Boolean()),
				plo_attainment_summary: t.Optional(t.Boolean()),
				cqi_action_plan_current: t.Optional(t.Boolean()),
				cqi_action_plan_prior: t.Optional(t.Boolean()),
				course_assessment_report_s1: t.Optional(t.Boolean()),
				course_assessment_report_s2: t.Optional(t.Boolean()),
				closing_the_loop: t.Optional(t.Boolean()),
			},
			{ description: "The 9 fixed Section B attachment checkboxes" },
		),
	),
	narratives: t.Optional(
		t.Object({
			c1FullYearPloSummary: t.Optional(t.String()),
			c2CohortIpdProgression: t.Optional(t.String()),
			c3IndirectEvidence: t.Optional(t.String()),
			c4CqiInterventions: t.Optional(t.String()),
			c5Recommendations: t.Optional(t.String()),
		}),
	),
	dashboard: t.Optional(
		t.Array(
			t.Object({
				kpiCode: t.String(),
				value: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
			}),
		),
	),
});

export type SaveApar = typeof SaveAparSchema.static;

// --- Assembled payload types ----------------------------------------------

export type GapRowDto = {
	id: string;
	ploCode: string;
	ploDescription: string;
	cohortYearLevel: number | null;
	attainmentPct: number;
	rootCauseCategory: string | null;
	rootCauseAnalysis: string | null;
	namedOwner: string | null;
	cqiActionPlanEntryId: string | null;
};

export type PloGapPayload = {
	programId: string;
	termId: string;
	formSubmissionId: string | null;
	generatedAt: string;
	program: { code: string; name: string };
	term: { schoolYear: string; semester: string };
	plos: PloCohortSummary[];
	gapRows: GapRowDto[];
	programChairSummary: string | null;
};

export type CqiEntryDto = {
	id: string;
	ploCode: string;
	ploDescription: string;
	cohortYearLevel: number | null;
	evidenceSource: string;
	priorAttainmentPct: number;
	rootCauseCategory: string;
	intervention: string;
	owner: string;
	ownerRole: string;
	timelineAndKpi: string;
	status: "planned" | "tracked";
	interventionImplemented: InterventionStatus | null;
	currentAttainmentPct: number | null;
};

export type CqiPlanPayload = {
	programId: string;
	termId: string;
	formSubmissionId: string | null;
	generatedAt: string;
	program: { code: string; name: string };
	term: { schoolYear: string; semester: string };
	entries: CqiEntryDto[];
};

export type CtlRowDto = {
	id: string;
	cqiEntryId: string;
	ploCode: string;
	ploDescription: string;
	cohortYearLevel: number | null;
	gapFindingAndEvidence: string | null;
	interventionImplementedText: string | null;
	priorAttainmentPct: number | null;
	currentAttainmentPct: number | null;
	conditions12Met: boolean;
	condition3Met: boolean;
	condition4Met: boolean;
	condition5Met: boolean;
	loopStatus: LoopStatus;
};

export type CtlPayload = {
	programId: string;
	termId: string;
	formSubmissionId: string | null;
	generatedAt: string;
	program: { code: string; name: string };
	term: { schoolYear: string; semester: string };
	rows: CtlRowDto[];
	identify: {
		c1PriorCycleKpisAchieved: string | null;
		c2PreviouslyMetDeclining: string | null;
		c3ExternalShifts: string | null;
		c4ProactiveImprovements: string | null;
	};
};

export type AparKpiRow = {
	code: string;
	label: string;
	value: number | null;
	benchmark: number;
	status: "MET" | "NOT MET" | null;
	computed: boolean;
	required: boolean;
};

export type AparPayload = {
	programId: string;
	formSubmissionId: string | null;
	termId: string | null;
	generatedAt: string;
	program: { code: string; name: string };
	term: { schoolYear: string; semester: string } | null;
	kpis: AparKpiRow[];
	attachments: Record<string, boolean>;
	narratives: Record<string, string | null>;
	dueDate: string;
};

export type CqiSubmissionListItem = {
	id: string;
	status: string;
	currentApproverRole: string | null;
	createdAt: Date;
	updatedAt: Date;
	program: { code: string; name: string } | null;
	term: { schoolYear: string; semester: string };
};
