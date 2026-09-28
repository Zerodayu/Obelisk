import { t } from "elysia";

// --- Shared request schemas --------------------------------------------------

export const PeriodicListQuerySchema = t.Object({
	programId: t.Optional(t.String()),
	termId: t.Optional(t.String()),
});

export type PeriodicListQuery = typeof PeriodicListQuerySchema.static;

export const PeriodicInitSchema = t.Object({
	programId: t.String({ description: "Program the form belongs to" }),
	termId: t.String({ description: "AcademicTerm anchoring the submission" }),
});

export type PeriodicInit = typeof PeriodicInitSchema.static;

// --- F09 resource_monitoring --------------------------------------------------

export const ResourceMonitorHeaderSchema = t.Object({
	program: t.Optional(t.String()),
	dean: t.Optional(t.String()),
	academicYear: t.Optional(t.String()),
	reportCovers: t.Optional(t.String()),
	dateSubmitted: t.Optional(t.String()),
});

export type ResourceMonitorHeader = typeof ResourceMonitorHeaderSchema.static;

export const ResourceItemInputSchema = t.Object({
	id: t.Optional(t.String({ description: "Existing row id to update" })),
	budgetLineItemId: t.Optional(
		t.String({ description: "FK to BudgetLineItem (F06)" }),
	),
	name: t.String(),
	phase: t.Optional(
		t.Union([
			t.Literal("plan"),
			t.Literal("do"),
			t.Literal("check"),
			t.Literal("act"),
		]),
	),
	acquisitionStatus: t.Optional(t.String()),
	remarks: t.Optional(t.String()),
});

export type ResourceItemInput = typeof ResourceItemInputSchema.static;

export const CqiImplementInputSchema = t.Object({
	id: t.Optional(t.String({ description: "Existing row id to update" })),
	cqiEntryId: t.Optional(t.String({ description: "FK to CqiEntry (F23)" })),
	interventionDescription: t.String(),
	implementationStatus: t.Optional(t.String()),
	evidenceNotes: t.Optional(t.String()),
});

export type CqiImplementInput = typeof CqiImplementInputSchema.static;

export const SaveResourceMonitoringSchema = t.Object({
	header: t.Optional(ResourceMonitorHeaderSchema),
	resourceItems: t.Array(ResourceItemInputSchema, {
		description: "Resource acquisition rows — full replacement on save",
	}),
	cqiImplementRows: t.Array(CqiImplementInputSchema, {
		description: "CQI implementation tracking rows — full replacement",
	}),
});

export type SaveResourceMonitoring = typeof SaveResourceMonitoringSchema.static;

// --- F20 alumni_tracer --------------------------------------------------------

export const AlumniTracerHeaderSchema = t.Object({
	program: t.Optional(t.String()),
	researchAlumniOfficer: t.Optional(t.String()),
	academicYear: t.Optional(t.String()),
	surveyPeriod: t.Optional(t.String()),
	targetGradBatches: t.Optional(t.String()),
	totalGraduatesTargeted: t.Optional(t.Number({ minimum: 0 })),
	totalRespondents: t.Optional(t.Number({ minimum: 0 })),
	responseRatePct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	surveyMode: t.Optional(t.String()),
});

export type AlumniTracerHeader = typeof AlumniTracerHeaderSchema.static;

export const AlumniTracerPloRowSchema = t.Object({
	ploCode: t.String(),
	description: t.Optional(t.String()),
	pctSufficient: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	pctInsufficient: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	alumniAvgRating: t.Optional(t.Number({ minimum: 0, maximum: 4 })),
	cqiAction: t.Optional(t.String()),
});

export type AlumniTracerPloRow = typeof AlumniTracerPloRowSchema.static;

export const SaveAlumniTracerSchema = t.Object({
	header: t.Optional(AlumniTracerHeaderSchema),
	ploRows: t.Array(AlumniTracerPloRowSchema, {
		description: "Per-PLO attainment rows",
	}),
	employmentIndicators: t.Optional(
		t.Array(
			t.Object({
				indicator: t.String(),
				respondents: t.Optional(t.Number({ minimum: 0 })),
				pct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
				benchmark: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
				aqauNotes: t.Optional(t.String()),
			}),
		),
	),
});

export type SaveAlumniTracer = typeof SaveAlumniTracerSchema.static;

// --- F21 employer_satisfaction_survey -----------------------------------------

export const EmployerSurveyHeaderSchema = t.Object({
	program: t.Optional(t.String()),
	industryLiaison: t.Optional(t.String()),
	academicYear: t.Optional(t.String()),
	surveyPeriod: t.Optional(t.String()),
	employerOrgsSurveyed: t.Optional(t.Number({ minimum: 0 })),
	totalResponses: t.Optional(t.Number({ minimum: 0 })),
	responseRatePct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
});

export type EmployerSurveyHeader = typeof EmployerSurveyHeaderSchema.static;

export const EmployerProfileRowSchema = t.Object({
	organizationName: t.String(),
	industrySector: t.Optional(t.String()),
	graduatesEmployed: t.Optional(t.Number({ minimum: 0 })),
});

export type EmployerProfileRow = typeof EmployerProfileRowSchema.static;

export const EmployerSurveyPloRowSchema = t.Object({
	ploCode: t.String(),
	competency: t.Optional(t.String()),
	avgRating: t.Optional(t.Number({ minimum: 0, maximum: 4 })),
	pctSatisfactory: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	benchmarkStatus: t.Optional(t.String()),
	programFlag: t.Optional(t.String()),
});

export type EmployerSurveyPloRow = typeof EmployerSurveyPloRowSchema.static;

export const SaveEmployerSurveySchema = t.Object({
	header: t.Optional(EmployerSurveyHeaderSchema),
	employerProfiles: t.Array(EmployerProfileRowSchema, {
		description: "Employer profile rows — full replacement",
	}),
	ploRows: t.Array(EmployerSurveyPloRowSchema, {
		description: "Per-PLO competency rating rows",
	}),
});

export type SaveEmployerSurvey = typeof SaveEmployerSurveySchema.static;

// --- F26 systemic_gap_report --------------------------------------------------

export const SystemicGapHeaderSchema = t.Object({
	program: t.Optional(t.String()),
	dean: t.Optional(t.String()),
	programChair: t.Optional(t.String()),
	ploCodesWithGap: t.Optional(t.Array(t.String())),
	yearLevelCohorts: t.Optional(t.Array(t.String())),
	cycleCountBelowBenchmark: t.Optional(t.Number({ minimum: 0 })),
	ayFirstFailure: t.Optional(t.String()),
	aySecondFailure: t.Optional(t.String()),
	ayThirdFailure: t.Optional(t.String()),
	dateTriggerIdentified: t.Optional(t.String()),
	dueDate: t.Optional(t.String()),
});

export type SystemicGapHeader = typeof SystemicGapHeaderSchema.static;

export const SystemicGapCycleRowSchema = t.Object({
	ayCycle: t.String(),
	ploAttainmentPct: t.Number({ minimum: 0, maximum: 100 }),
	cohort: t.Optional(t.String()),
	benchmarkPct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	status: t.Optional(t.String()),
	interventionsImplemented: t.Optional(t.String()),
});

export type SystemicGapCycleRow = typeof SystemicGapCycleRowSchema.static;

export const SaveSystemicGapReportSchema = t.Object({
	header: t.Optional(SystemicGapHeaderSchema),
	cycleRows: t.Array(SystemicGapCycleRowSchema, {
		description: "3-cycle evidence rows",
	}),
	evidenceNarrative: t.Optional(t.String()),
	rootCauseCategory: t.Optional(t.String()),
	rootCauseAnalysis: t.Optional(t.String()),
	recommendedStructuralResponse: t.Optional(t.String()),
	capaPlanOutline: t.Optional(t.String()),
	signatures: t.Optional(
		t.Object({
			dean: t.Optional(t.String()),
			pacChair: t.Optional(t.String()),
			vpaa: t.Optional(t.String()),
		}),
	),
});

export type SaveSystemicGapReport = typeof SaveSystemicGapReportSchema.static;

// --- F27 capa_plan -----------------------------------------------------------

export const CapaPlanHeaderSchema = t.Object({
	program: t.Optional(t.String()),
	ploCodes: t.Optional(t.Array(t.String())),
	cohortCodes: t.Optional(t.Array(t.String())),
	systemicGapReportId: t.Optional(t.String()),
	startDate: t.Optional(t.String()),
	seniorLeaderOwner: t.Optional(t.String()),
	dean: t.Optional(t.String()),
	expectedResolutionAy: t.Optional(t.String()),
	aqauMonitoringFrequency: t.Optional(t.String()),
});

export type CapaPlanHeader = typeof CapaPlanHeaderSchema.static;

export const CapaActionInputSchema = t.Object({
	actionId: t.Optional(t.String({ description: "Existing action id" })),
	description: t.String(),
	interventionType: t.Optional(t.String()),
	owner: t.Optional(t.String()),
	targetCompletionDate: t.Optional(t.String()),
	progressPct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	evidenceUrl: t.Optional(t.String()),
});

export type CapaActionInput = typeof CapaActionInputSchema.static;

export const CapaProgressReviewSchema = t.Object({
	reviewDate: t.String(),
	ploAttainmentAtReview: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	status: t.Optional(t.String()),
	actionsCompletedPct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	aqauNotes: t.Optional(t.String()),
});

export type CapaProgressReview = typeof CapaProgressReviewSchema.static;

export const SaveCapaPlanSchema = t.Object({
	header: t.Optional(CapaPlanHeaderSchema),
	actions: t.Array(CapaActionInputSchema, {
		description: "CAPA action rows — max 8",
	}),
	progressReviews: t.Optional(t.Array(CapaProgressReviewSchema)),
	closureDeclaration: t.Optional(t.String()),
	benchmarkSustainedCycles: t.Optional(t.Number({ minimum: 0 })),
});

export type SaveCapaPlan = typeof SaveCapaPlanSchema.static;

// --- F28 institutional_review ------------------------------------------------

export const InstitutionalReviewHeaderSchema = t.Object({
	meetingDate: t.Optional(t.String()),
	venueMode: t.Optional(t.String()),
	presidedBy: t.Optional(t.String()),
	qaDirector: t.Optional(t.String()),
	deansPresent: t.Optional(t.Array(t.String())),
	deansAbsent: t.Optional(t.Array(t.String())),
});

export type InstitutionalReviewHeader =
	typeof InstitutionalReviewHeaderSchema.static;

export const ProgramReviewRowSchema = t.Object({
	programCode: t.String(),
	programName: t.Optional(t.String()),
	overallPloAttainmentPct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	ctlSubmitted: t.Optional(t.Boolean()),
	aparComplete: t.Optional(t.Boolean()),
	systemicGapReported: t.Optional(t.Boolean()),
	priorityNotes: t.Optional(t.String()),
});

export type ProgramReviewRow = typeof ProgramReviewRowSchema.static;

export const InstitutionalCqiCompletionSchema = t.Object({
	programCode: t.String(),
	programName: t.Optional(t.String()),
	totalPlanned: t.Optional(t.Number({ minimum: 0 })),
	completed: t.Optional(t.Number({ minimum: 0 })),
	completionRatePct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	notes: t.Optional(t.String()),
});

export type InstitutionalCqiCompletion =
	typeof InstitutionalCqiCompletionSchema.static;

export const SaveInstitutionalReviewSchema = t.Object({
	header: t.Optional(InstitutionalReviewHeaderSchema),
	programReviews: t.Array(ProgramReviewRowSchema, {
		description: "Per-program review rows",
	}),
	cqiCompletions: t.Array(InstitutionalCqiCompletionSchema, {
		description: "Per-program CQI completion rows",
	}),
	decisions: t.Optional(
		t.Object({
			institutionalPriorities: t.Optional(t.String()),
			capaStatusUpdates: t.Optional(t.String()),
			resourceAllocations: t.Optional(t.String()),
			policyUpdates: t.Optional(t.String()),
			nonCompliantPrograms: t.Optional(t.String()),
		}),
	),
	signatures: t.Optional(
		t.Object({
			qaDirector: t.Optional(t.String()),
			president: t.Optional(t.String()),
		}),
	),
});

export type SaveInstitutionalReview =
	typeof SaveInstitutionalReviewSchema.static;

// --- F02 portfolio_roadmap ----------------------------------------------------

export const PortfolioRoadmapHeaderSchema = t.Object({
	program: t.Optional(t.String()),
	departmentChair: t.Optional(t.String()),
	academicYear: t.Optional(t.String()),
	dateApproved: t.Optional(t.String()),
	dateFiledWithAqau: t.Optional(t.String()),
	revisionNumber: t.Optional(t.String()),
});

export type PortfolioRoadmapHeader = typeof PortfolioRoadmapHeaderSchema.static;

export const PortfolioRoadmapRowInputSchema = t.Object({
	id: t.Optional(t.String({ description: "Existing row id to update" })),
	yearLevel: t.Integer({ minimum: 1, maximum: 4 }),
	milestone: t.String(),
	description: t.String(),
	ploAlignment: t.Optional(t.String()),
	sortOrder: t.Optional(t.Number({ minimum: 0 })),
});

export type PortfolioRoadmapRowInput =
	typeof PortfolioRoadmapRowInputSchema.static;

export const PortfolioRubricRowInputSchema = t.Object({
	id: t.Optional(t.String({ description: "Existing row id to update" })),
	criterionName: t.String(),
	description: t.String(),
	weightPct: t.Number({ minimum: 0, maximum: 100 }),
	rubricLevels: t.Array(
		t.Object({
			level: t.String(),
			descriptor: t.String(),
		}),
	),
	sortOrder: t.Optional(t.Number({ minimum: 0 })),
});

export type PortfolioRubricRowInput =
	typeof PortfolioRubricRowInputSchema.static;

export const SavePortfolioRoadmapSchema = t.Object({
	header: t.Optional(PortfolioRoadmapHeaderSchema),
	roadmapRows: t.Array(PortfolioRoadmapRowInputSchema, {
		description: "4-year roadmap milestone rows",
	}),
	rubricRows: t.Array(PortfolioRubricRowInputSchema, {
		description: "Rubric standards rows (weight total must equal 100%)",
	}),
	complianceChecklist: t.Optional(t.Array(t.String())),
});

export type SavePortfolioRoadmap = typeof SavePortfolioRoadmapSchema.static;

// --- Assembled payload types ---------------------------------------------------

export type PeriodicSubmissionListItem = {
	id: string;
	formTypeCode: string;
	status: string;
	currentApproverRole: string | null;
	createdAt: Date;
	updatedAt: Date;
	program: { code: string; name: string } | null;
};
