import { t } from "elysia";

/** Generation request: which class section (and optionally which run). */
export const GenerateCarParamsSchema = t.Object({
	classSectionId: t.String({
		description: "ClassSection whose stored attainment the CAR consolidates",
	}),
	computationRunId: t.Optional(
		t.String({
			description:
				"Specific ComputationRun to roll up (defaults to the section's latest)",
		}),
	),
});

export type GenerateCarParams = typeof GenerateCarParamsSchema.static;

/**
 * Editable CAR parts saved into the submission's `formData`. Computed parts
 * (2/3/4) are never accepted here — they derive live from stored attainment.
 */
export const SaveCarPartsSchema = t.Object({
	part1: t.Optional(
		t.Object({
			term: t.Optional(
				t.Union([
					t.Literal("Prelim"),
					t.Literal("Midterm"),
					t.Literal("Finals"),
				]),
			),
			yearLevel: t.Optional(
				t.Union([t.Literal(1), t.Literal(2), t.Literal(3), t.Literal(4)]),
			),
			dateSubmitted: t.Optional(t.String()),
			facultyName: t.Optional(t.String()),
			designation: t.Optional(t.String()),
			cloPloMapping: t.Optional(
				t.Array(
					t.Object({
						cloCode: t.String(),
						bloomsLevel: t.Optional(t.String()),
						ipdStage: t.Optional(t.String()),
						assessmentTypes: t.Optional(
							t.Array(
								t.Union([
									t.Literal("Exam"),
									t.Literal("Rubric"),
									t.Literal("Perf.Task"),
									t.Literal("Portfolio"),
								]),
							),
						),
						weightInGradePct: t.Optional(t.Number()),
					}),
				),
			),
		}),
	),
	part5: t.Optional(
		t.Array(
			t.Object({
				cloCode: t.String(),
				rootCauseCategory: t.String({
					description:
						"One of the six canonical root-cause categories (lib/validators/root-cause).",
				}),
				intervention: t.String(),
				owner: t.String(),
				timelineAndKpi: t.String(),
			}),
		),
	),
	part6: t.Optional(
		t.Object({
			studentExitCrossReferences: t.Optional(
				t.Array(
					t.Object({
						cloPloCode: t.String(),
						studentAvgPerceived: t.Optional(t.Number()),
						facultyNote: t.Optional(t.String()),
					}),
				),
			),
			teachingStrategies: t.Optional(t.Array(t.String(), { maxItems: 11 })),
			facultyReflection: t.Optional(t.String()),
		}),
	),
	part7: t.Optional(
		t.Object({
			programChairDisposition: t.Optional(
				t.Object({
					accepted: t.Optional(t.Boolean()),
					returnReason: t.Optional(t.String()),
					returnByDate: t.Optional(t.String()),
					cqiEntriesReviewed: t.Optional(t.Boolean()),
					escalationRequired: t.Optional(t.Boolean()),
					atRiskListReceived: t.Optional(t.Boolean()),
				}),
			),
		}),
	),
});

export type SaveCarParts = typeof SaveCarPartsSchema.static;

export const ListCarsQuerySchema = t.Object({
	classSectionId: t.Optional(t.String()),
});

export type ListCarsQuery = typeof ListCarsQuerySchema.static;

// --- Assembled CAR payload types (returned by generate/get) ---------------

export type CloPloMappingRow = {
	cloCode: string;
	cloDescription: string;
	ploCode: string | null;
	ploDescription: string | null;
	bloomsLevel?: string | null;
	ipdStage?: string | null;
	assessmentTypes?: string[] | null;
	weightInGradePct?: number | null;
};

export type CarPart1 = {
	courseCode: string;
	courseTitle: string;
	schoolYear: string;
	semester: string;
	sectionCode: string;
	programCode: string;
	programName: string;
	term: "Prelim" | "Midterm" | "Finals" | null;
	yearLevel: 1 | 2 | 3 | 4 | null;
	noEnrolled: number;
	noCompleted: number;
	dateSubmitted: string | null;
	facultyName: string | null;
	designation: string | null;
	cloPloMapping: CloPloMappingRow[];
};

export type AssessmentTypeRow = {
	cloCode: string;
	cloDescription: string;
	attainmentPct: number | null;
	belowBenchmark: boolean | null;
};

export type CarPart2 = {
	exams: AssessmentTypeRow[];
	rubric: AssessmentTypeRow[];
	perfTasks: AssessmentTypeRow[];
	portfolio: AssessmentTypeRow[];
};

export type Part3Row = {
	cloCode: string;
	cloDescription: string;
	examPct: number | null;
	atPct: number | null;
	tlaPct: number | null;
	outputPct: number | null;
	weightedAvgPct: number;
	level: "Exceptional" | "Proficient" | "Basic" | "Below Basic";
	status: "MET" | "NOT MET";
};

export type CohortSummary = {
	yearLevel: number | null;
	rows: Part3Row[];
	cohortAvg: {
		weightedAvgPct: number | null;
		level: "Exceptional" | "Proficient" | "Basic" | "Below Basic" | null;
	};
};

export type CarPart3 = CohortSummary[];

export type AtRiskRow = {
	studentId: string;
	studentName: string;
	studentNumber: string;
	yearLevel: number | null;
	atRiskClos: {
		cloCode: string;
		attainmentPct: number;
		assessmentType: string | null;
	}[];
	intervention: string | null;
};

export type CarPart4 = {
	count: number;
	dateReportedToProgramChair: string | null;
	rows: AtRiskRow[];
};

export type CqiEntry = {
	cloCode: string;
	cloDescription: string;
	attainmentPct: number;
	rootCauseCategory: string;
	intervention: string;
	owner: string;
	timelineAndKpi: string;
};

export type CarPart5 = CqiEntry[];

export type CarPart6 = {
	studentExitCrossReferences: {
		cloPloCode: string;
		studentAvgPerceived: number | null;
		directAttainmentPct: number | null;
		facultyNote: string | null;
	}[];
	teachingStrategies: string[];
	facultyReflection: string | null;
};

export type CarPart7 = {
	facultyCertification: boolean;
	submittedBy: string | null;
	receivedBy: string | null;
	programChairDisposition: {
		accepted: boolean | null;
		returnReason: string | null;
		returnByDate: string | null;
		cqiEntriesReviewed: boolean | null;
		escalationRequired: boolean | null;
		atRiskListReceived: boolean | null;
	} | null;
};

export type CarPayload = {
	classSectionId: string;
	computationRunId: string;
	formSubmissionId: string | null;
	generatedAt: string;
	part1: CarPart1;
	part2: CarPart2;
	part3: CarPart3;
	part4: CarPart4;
	part5: CarPart5;
	part6: CarPart6;
	part7: CarPart7;
};

export type CarSubmissionListItem = {
	id: string;
	status: string;
	currentApproverRole: string | null;
	createdAt: Date;
	updatedAt: Date;
	classSection: {
		sectionCode: string;
		course: { code: string; title: string };
	};
	term: { schoolYear: string; semester: string };
};
