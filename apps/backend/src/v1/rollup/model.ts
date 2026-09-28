import type { CloLevel } from "@v1/car/compute";
import { t } from "elysia";
import type { CohortLine } from "./compute";

// --- Request schemas -------------------------------------------------------

export const CloSummaryParamsSchema = t.Object({
	classSectionId: t.String({
		description:
			"ClassSection whose stored attainment the CLO summary rolls up",
	}),
	computationRunId: t.Optional(
		t.String({
			description:
				"Specific ComputationRun to roll up (defaults to the section's latest)",
		}),
	),
});

export type CloSummaryParams = typeof CloSummaryParamsSchema.static;

export const PloSummaryParamsSchema = t.Object({
	programId: t.String({
		description: "Program whose PLO attainment to roll up",
	}),
	termId: t.String({
		description: "AcademicTerm (school year + semester) to consolidate",
	}),
});

export type PloSummaryParams = typeof PloSummaryParamsSchema.static;

export const CohortParamsSchema = t.Object({
	programId: t.String({
		description:
			"Program whose longitudinal cohort CLO/PLO attainment to track",
	}),
	termId: t.Optional(
		t.String({
			description:
				"Optional term filter; defaults to every term with stored attainment",
		}),
	),
});

export type CohortParams = typeof CohortParamsSchema.static;

/** Per-cohort-line CQI follow-up annotations saved onto the tracking sheet. */
export const CohortAnnotationsSchema = t.Object({
	annotations: t.Array(
		t.Object({
			yearLevel: t.Union([t.Number(), t.Null()], {
				description: "Year-level cohort this annotation targets",
			}),
			termId: t.String(),
			cloCode: t.String(),
			cqiFlag: t.Optional(t.Boolean()),
			followUp: t.String({ description: "CQI follow-up note (may be empty)" }),
		}),
	),
});

export type CohortAnnotations = typeof CohortAnnotationsSchema.static;

export const RollupListQuerySchema = t.Object({
	programId: t.Optional(t.String()),
	classSectionId: t.Optional(t.String()),
});

export type RollupListQuery = typeof RollupListQuerySchema.static;

// --- Assembled payload types (returned by generate/get) --------------------

export type CloSummaryRow = {
	cloCode: string;
	cloDescription: string;
	ploCode: string | null;
	ploDescription: string | null;
	count: number;
	belowCount: number;
	examPct: number | null;
	atPct: number | null;
	tlaPct: number | null;
	outputPct: number | null;
	weightedAvgPct: number;
	level: CloLevel;
	status: "MET" | "NOT MET";
};

export type CloSectionSummary = {
	averagePct: number | null;
	level: CloLevel | null;
	belowCount: number;
	totalCount: number;
};

export type CloSummaryPayload = {
	classSectionId: string;
	computationRunId: string;
	formSubmissionId: string | null;
	generatedAt: string;
	course: { code: string; title: string };
	sectionCode: string;
	program: { code: string; name: string };
	term: { schoolYear: string; semester: string };
	summary: CloSectionSummary;
	rows: CloSummaryRow[];
};

export type PloSummaryRow = {
	ploCode: string;
	ploDescription: string;
	targetAttainmentPct: number;
	attainedPct: number;
	achieved: boolean;
	studentsBelowTargetCount: number;
	completenessPct: number;
	rule3Met: boolean;
	mappedClos: {
		cloCode: string;
		meanAttainmentPct: number;
		rule1Met: boolean;
	}[];
};

export type PloSummaryPayload = {
	programId: string;
	termId: string;
	computationRunId: string;
	formSubmissionId: string | null;
	generatedAt: string;
	program: { code: string; name: string };
	term: { schoolYear: string; semester: string };
	feed: { sections: number; fed: number };
	summary: { averagePct: number | null; belowCount: number };
	plos: PloSummaryRow[];
};

export type CohortPayload = {
	programId: string;
	formSubmissionId: string | null;
	generatedAt: string;
	program: { code: string; name: string };
	lines: CohortLine[];
	annotations: CohortAnnotations["annotations"];
	plos: {
		termId: string;
		ploCode: string;
		ploDescription: string;
		attainmentPct: number;
		achieved: boolean;
	}[];
};

export type RollupSubmissionListItem = {
	id: string;
	status: string;
	currentApproverRole: string | null;
	createdAt: Date;
	updatedAt: Date;
	classSection: {
		sectionCode: string;
		course: { code: string; title: string };
	} | null;
	program: { code: string; name: string } | null;
	term: { schoolYear: string; semester: string };
};
