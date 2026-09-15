import { t } from "elysia";

// --- Shared request schemas --------------------------------------------------

export const CheckListQuerySchema = t.Object({
	programId: t.Optional(t.String()),
	termId: t.Optional(t.String()),
});

export type CheckListQuery = typeof CheckListQuerySchema.static;

export const CheckInitSchema = t.Object({
	programId: t.String({ description: "Program the form belongs to" }),
	termId: t.String({ description: "AcademicTerm anchoring the submission" }),
});

export type CheckInit = typeof CheckInitSchema.static;

// --- F08 mid_cycle_attainment ------------------------------------------------

export const MidCycleHeaderSchema = t.Object({
	courseTitle: t.Optional(t.String()),
	courseCode: t.Optional(t.String()),
	academicYear: t.Optional(t.String()),
	semester: t.Optional(t.String()),
	section: t.Optional(t.String()),
	studentCountEnrolled: t.Optional(t.Number({ minimum: 0 })),
	program: t.Optional(t.String()),
	yearLevelCohort: t.Optional(t.String()),
	assessmentWeek: t.Optional(t.String()),
	periodCovered: t.Optional(t.String()),
	dateAdministered: t.Optional(t.String()),
	facultyName: t.Optional(t.String()),
	dateSubmittedToPc: t.Optional(t.String()),
});

export type MidCycleHeader = typeof MidCycleHeaderSchema.static;

export const MidCycleCohortRowInputSchema = t.Object({
	id: t.Optional(t.String({ description: "Existing row id to update" })),
	yearLevel: t.Integer({ minimum: 1, maximum: 4 }),
	cloCode: t.String(),
	cloDescription: t.Optional(t.String()),
	attainmentPct: t.Number({ minimum: 0, maximum: 100 }),
	benchmarkPct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	status: t.Optional(t.String()),
	studentCount: t.Optional(t.Number({ minimum: 0 })),
	belowTargetCount: t.Optional(t.Number({ minimum: 0 })),
});

export type MidCycleCohortRowInput = typeof MidCycleCohortRowInputSchema.static;

export const SaveMidCycleAttainmentSchema = t.Object({
	header: t.Optional(MidCycleHeaderSchema),
	cohortRows: t.Array(MidCycleCohortRowInputSchema, {
		description: "Per-CLO attainment rows — full replacement on save",
	}),
});

export type SaveMidCycleAttainment = typeof SaveMidCycleAttainmentSchema.static;

// --- F10 peer_observation ----------------------------------------------------

export const PeerObservationHeaderSchema = t.Object({
	facultyObserved: t.Optional(t.String()),
	course: t.Optional(t.String()),
	observer: t.Optional(t.String()),
	observationDate: t.Optional(t.String()),
	timeStart: t.Optional(t.String()),
	timeEnd: t.Optional(t.String()),
	sectionYear: t.Optional(t.String()),
	semesterAyu: t.Optional(t.String()),
	studentCountPresent: t.Optional(t.Number({ minimum: 0 })),
});

export type PeerObservationHeader = typeof PeerObservationHeaderSchema.static;

export const PeerObservationCriteriaSchema = t.Object({
	obeSyllabusAlignment: t.Optional(
		t.Union([
			t.Literal("fully_aligned"),
			t.Literal("partially_aligned"),
			t.Literal("not_aligned"),
		]),
	),
	bloomsLevel: t.Optional(
		t.Union([t.Literal("appropriate"), t.Literal("below"), t.Literal("above")]),
	),
	cloAssessmentMapping: t.Optional(
		t.Union([
			t.Literal("clearly_evident"),
			t.Literal("partially_evident"),
			t.Literal("not_evident"),
		]),
	),
	rubricUse: t.Optional(
		t.Union([
			t.Literal("used_aligned"),
			t.Literal("used_not_aligned"),
			t.Literal("no_rubric"),
		]),
	),
	formativeFeedback: t.Optional(
		t.Union([
			t.Literal("specific_clo_ref"),
			t.Literal("general_only"),
			t.Literal("not_observed"),
		]),
	),
	activeExperientialLearning: t.Optional(
		t.Union([t.Literal("yes"), t.Literal("partially"), t.Literal("no")]),
	),
	studentEngagement: t.Optional(
		t.Union([t.Literal("high"), t.Literal("moderate"), t.Literal("low")]),
	),
});

export type PeerObservationCriteria =
	typeof PeerObservationCriteriaSchema.static;

export const SavePeerObservationSchema = t.Object({
	header: t.Optional(PeerObservationHeaderSchema),
	criteria: t.Optional(PeerObservationCriteriaSchema),
	strengths: t.Optional(t.String()),
	areasForImprovement: t.Optional(t.String()),
	cqiImplications: t.Optional(t.String()),
});

export type SavePeerObservation = typeof SavePeerObservationSchema.static;

// --- F11 exhibition_feedback -------------------------------------------------

export const ExhibitionHeaderSchema = t.Object({
	exhibitionTitle: t.Optional(t.String()),
	exhibitionDate: t.Optional(t.String()),
	venueMode: t.Optional(t.String()),
	program: t.Optional(t.String()),
	studentExhibitorsCount: t.Optional(t.Number({ minimum: 0 })),
	guestsCount: t.Optional(t.Number({ minimum: 0 })),
});

export type ExhibitionHeader = typeof ExhibitionHeaderSchema.static;

export const ExhibitionGuestInputSchema = t.Object({
	id: t.Optional(t.String({ description: "Existing row id to update" })),
	guestName: t.String(),
	guestAffiliation: t.Optional(t.String()),
	emailContact: t.Optional(t.String()),
	ploRatings: t.Record(t.String(), t.Number({ minimum: 0, maximum: 10 })),
	overallComments: t.Optional(t.String()),
});

export type ExhibitionGuestInput = typeof ExhibitionGuestInputSchema.static;

export const SaveExhibitionFeedbackSchema = t.Object({
	header: t.Optional(ExhibitionHeaderSchema),
	guests: t.Array(ExhibitionGuestInputSchema, {
		description: "Guest rows — full replacement on save",
	}),
	qualitativeFeedback: t.Optional(t.String()),
});

export type SaveExhibitionFeedback = typeof SaveExhibitionFeedbackSchema.static;

// --- F12 clo_perception_survey -----------------------------------------------

export const CloPerceptionHeaderSchema = t.Object({
	courseTitle: t.Optional(t.String()),
	courseCode: t.Optional(t.String()),
	academicYear: t.Optional(t.String()),
	semester: t.Optional(t.String()),
	dateAdministered: t.Optional(t.String()),
	totalRespondents: t.Optional(t.Number({ minimum: 0 })),
	section: t.Optional(t.String()),
	responseRatePct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	yearLevelCohort: t.Optional(t.String()),
});

export type CloPerceptionHeader = typeof CloPerceptionHeaderSchema.static;

export const CloPerceptionRowSchema = t.Object({
	cloCode: t.String(),
	statement: t.Optional(t.String()),
	rating1Count: t.Optional(t.Number({ minimum: 0 })),
	rating2Count: t.Optional(t.Number({ minimum: 0 })),
	rating3Count: t.Optional(t.Number({ minimum: 0 })),
	rating4Count: t.Optional(t.Number({ minimum: 0 })),
	rating5Count: t.Optional(t.Number({ minimum: 0 })),
	directAttainmentPct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
});

export type CloPerceptionRow = typeof CloPerceptionRowSchema.static;

export const SaveCloPerceptionSurveySchema = t.Object({
	header: t.Optional(CloPerceptionHeaderSchema),
	cloRows: t.Array(CloPerceptionRowSchema, {
		description: "Per-CLO Likert tabulation rows",
	}),
	divergenceNotes: t.Optional(t.String()),
});

export type SaveCloPerceptionSurvey =
	typeof SaveCloPerceptionSurveySchema.static;

// --- F17 student_exit_survey -------------------------------------------------

export const StudentExitHeaderSchema = t.Object({
	program: t.Optional(t.String()),
	semesterAcademicYear: t.Optional(t.String()),
	dateAdministered: t.Optional(t.String()),
	totalEnrolled: t.Optional(t.Number({ minimum: 0 })),
	totalRespondents: t.Optional(t.Number({ minimum: 0 })),
	responseRatePct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
	year1Respondents: t.Optional(t.Number({ minimum: 0 })),
	year2Respondents: t.Optional(t.Number({ minimum: 0 })),
	year3Respondents: t.Optional(t.Number({ minimum: 0 })),
	year4Respondents: t.Optional(t.Number({ minimum: 0 })),
	surveyMode: t.Optional(t.String()),
});

export type StudentExitHeader = typeof StudentExitHeaderSchema.static;

export const StudentExitPloRowSchema = t.Object({
	ploCode: t.String(),
	description: t.Optional(t.String()),
	y1AvgRating: t.Optional(t.Number({ minimum: 0, maximum: 5 })),
	y2AvgRating: t.Optional(t.Number({ minimum: 0, maximum: 5 })),
	y3AvgRating: t.Optional(t.Number({ minimum: 0, maximum: 5 })),
	y4AvgRating: t.Optional(t.Number({ minimum: 0, maximum: 5 })),
});

export type StudentExitPloRow = typeof StudentExitPloRowSchema.static;

export const SaveStudentExitSurveySchema = t.Object({
	header: t.Optional(StudentExitHeaderSchema),
	ploRows: t.Array(StudentExitPloRowSchema, {
		description: "Per-PLO × year-level rating rows",
	}),
	divergenceInvestigationNotes: t.Optional(t.String()),
	qualitativeThemes: t.Optional(t.String()),
});

export type SaveStudentExitSurvey = typeof SaveStudentExitSurveySchema.static;

// --- F18 portfolio_assessment_record -----------------------------------------

export const PortfolioAssessmentHeaderSchema = t.Object({
	studentName: t.Optional(t.String()),
	studentId: t.Optional(t.String()),
	program: t.Optional(t.String()),
	yearLevelCohort: t.Optional(t.String()),
	portfolioEvent: t.Optional(t.String()),
	assessmentDate: t.Optional(t.String()),
	portfolioMilestone: t.Optional(t.String()),
	cloEvidence: t.Optional(t.String()),
	assessor1: t.Optional(t.String()),
	assessor2: t.Optional(t.String()),
	industryAssessor: t.Optional(t.String()),
	additionalPanelist: t.Optional(t.String()),
});

export type PortfolioAssessmentHeader =
	typeof PortfolioAssessmentHeaderSchema.static;

export const PortfolioCriterionInputSchema = t.Object({
	id: t.Optional(t.String({ description: "Existing row id to update" })),
	cloCode: t.String(),
	cloDescription: t.Optional(t.String()),
	criterionName: t.String(),
	maxScore: t.Optional(t.Number({ minimum: 1 })),
	assessor1Score: t.Optional(t.Number({ minimum: 0 })),
	assessor2Score: t.Optional(t.Number({ minimum: 0 })),
	industryScore: t.Optional(t.Number({ minimum: 0 })),
	consensusScore: t.Optional(t.Number({ minimum: 0 })),
	evidenceNotes: t.Optional(t.String()),
});

export type PortfolioCriterionInput =
	typeof PortfolioCriterionInputSchema.static;

export const SavePortfolioAssessmentSchema = t.Object({
	header: t.Optional(PortfolioAssessmentHeaderSchema),
	criteriaRows: t.Array(PortfolioCriterionInputSchema, {
		description: "Rubric criterion rows — full replacement on save",
	}),
});

export type SavePortfolioAssessment =
	typeof SavePortfolioAssessmentSchema.static;

// --- F19 capstone_panel_evaluation -------------------------------------------

export const CapstonePanelHeaderSchema = t.Object({
	studentName: t.Optional(t.String()),
	studentId: t.Optional(t.String()),
	program: t.Optional(t.String()),
	academicYear: t.Optional(t.String()),
	capstoneTitle: t.Optional(t.String()),
	panelDate: t.Optional(t.String()),
	venue: t.Optional(t.String()),
	sectionCohort: t.Optional(t.String()),
	type: t.Optional(t.String()),
	panelMemberCount: t.Optional(t.Number({ minimum: 0 })),
	chair: t.Optional(t.String()),
	member2: t.Optional(t.String()),
	industryAssessor: t.Optional(t.String()),
	additionalPanelist: t.Optional(t.String()),
});

export type CapstonePanelHeader = typeof CapstonePanelHeaderSchema.static;

export const CapstonePanelistInputSchema = t.Object({
	id: t.Optional(t.String({ description: "Existing row id to update" })),
	panelistName: t.String(),
	panelistRole: t.String(),
	ploRatings: t.Record(t.String(), t.Number({ minimum: 0, maximum: 10 })),
	overallComments: t.Optional(t.String()),
});

export type CapstonePanelistInput = typeof CapstonePanelistInputSchema.static;

export const SaveCapstonePanelEvaluationSchema = t.Object({
	header: t.Optional(CapstonePanelHeaderSchema),
	panelistRows: t.Array(CapstonePanelistInputSchema, {
		description: "Panelist scoring rows — full replacement on save",
	}),
	programReadinessDeclaration: t.Optional(t.String()),
	cqiActionRequired: t.Optional(t.Boolean()),
});

export type SaveCapstonePanelEvaluation =
	typeof SaveCapstonePanelEvaluationSchema.static;

// --- Assembled payload types ---------------------------------------------------

export type CheckSubmissionListItem = {
	id: string;
	formTypeCode: string;
	status: string;
	currentApproverRole: string | null;
	createdAt: Date;
	updatedAt: Date;
	program: { code: string; name: string } | null;
};
