import { cached } from "@lib/cache";
import { authPlugin } from "@v1/auth/controller";
import { Elysia } from "elysia";
import {
	CheckInitSchema,
	CheckListQuerySchema,
	SaveCapstonePanelEvaluationSchema,
	SaveCloPerceptionSurveySchema,
	SaveExhibitionFeedbackSchema,
	SaveMidCycleAttainmentSchema,
	SavePeerObservationSchema,
	SavePortfolioAssessmentSchema,
	SaveStudentExitSurveySchema,
} from "./model";
import {
	CheckInvalidEditError,
	CheckSubmissionNotFoundError,
	capstonePanelEvaluationService,
	cloPerceptionSurveyService,
	exhibitionFeedbackService,
	listCheckSubmissions,
	midCycleAttainmentService,
	peerObservationService,
	portfolioAssessmentService,
	studentExitSurveyService,
} from "./service";

const SECURITY = {
	security: [{ bearerAuth: [] as string[], apiKeyCookie: [] as string[] }],
};

function mapCheckErrors(
	error: unknown,
	set: { status?: string | number },
): unknown {
	if (error instanceof CheckSubmissionNotFoundError) {
		set.status = 404;
		return { error: error.message };
	}
	if (error instanceof CheckInvalidEditError) {
		set.status = 409;
		return { error: error.message };
	}
	throw error;
}

export const checkPlugin = new Elysia({
	prefix: "/check",
	name: "check",
	tags: ["CHECK / Supporting Instruments"],
})
	.use(authPlugin)
	// --- F08 mid_cycle_attainment -----------------------------------------------
	.get(
		"/mid-cycle-attainment",
		cached(60, async ({ query }) =>
			listCheckSubmissions("mid_cycle_attainment", {
				programId: query.programId,
				termId: query.termId,
			}),
		),
		{
			auth: true,
			query: CheckListQuerySchema,
			detail: {
				summary: "List mid-cycle attainment submissions",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/mid-cycle-attainment/init",
		async ({ body, user, set }) => {
			try {
				return await midCycleAttainmentService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		},
		{
			auth: true,
			body: CheckInitSchema,
			detail: {
				summary: "Open (or reuse) a mid-cycle attainment draft",
				...SECURITY,
				responses: {
					200: { description: "Draft id" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/mid-cycle-attainment/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await midCycleAttainmentService.get(params.id);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get mid-cycle attainment by submission id",
				...SECURITY,
				responses: {
					200: { description: "Submission payload" },
					401: { description: "Unauthorized" },
					404: { description: "Not found" },
				},
			},
		},
	)
	.put(
		"/mid-cycle-attainment/:id",
		async ({ params, body, user, set }) => {
			try {
				return await midCycleAttainmentService.save(params.id, user.id, body);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		},
		{
			auth: true,
			body: SaveMidCycleAttainmentSchema,
			detail: {
				summary: "Save mid-cycle attainment header + cohort rows",
				...SECURITY,
				responses: {
					200: { description: "Updated submission" },
					401: { description: "Unauthorized" },
					404: { description: "Not found" },
					409: { description: "Submission not editable" },
				},
			},
		},
	)
	// --- F10 peer_observation ---------------------------------------------------
	.get(
		"/peer-observation",
		cached(60, async ({ query }) =>
			listCheckSubmissions("peer_observation", {
				programId: query.programId,
				termId: query.termId,
			}),
		),
		{
			auth: true,
			query: CheckListQuerySchema,
			detail: {
				summary: "List peer observation submissions",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/peer-observation/init",
		async ({ body, user, set }) => {
			try {
				return await peerObservationService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		},
		{
			auth: true,
			body: CheckInitSchema,
			detail: {
				summary: "Open (or reuse) a peer observation draft",
				...SECURITY,
				responses: {
					200: { description: "Draft id" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/peer-observation/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await peerObservationService.get(params.id);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get peer observation by submission id",
				...SECURITY,
				responses: {
					200: { description: "Submission payload" },
					401: { description: "Unauthorized" },
					404: { description: "Not found" },
				},
			},
		},
	)
	.put(
		"/peer-observation/:id",
		async ({ params, body, user, set }) => {
			try {
				return await peerObservationService.save(params.id, user.id, body);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		},
		{
			auth: true,
			body: SavePeerObservationSchema,
			detail: {
				summary: "Save peer observation header + criteria",
				...SECURITY,
				responses: {
					200: { description: "Updated submission" },
					401: { description: "Unauthorized" },
					404: { description: "Not found" },
					409: { description: "Submission not editable" },
				},
			},
		},
	)
	// --- F11 exhibition_feedback ------------------------------------------------
	.get(
		"/exhibition-feedback",
		cached(60, async ({ query }) =>
			listCheckSubmissions("exhibition_feedback", {
				programId: query.programId,
				termId: query.termId,
			}),
		),
		{
			auth: true,
			query: CheckListQuerySchema,
			detail: {
				summary: "List exhibition feedback submissions",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/exhibition-feedback/init",
		async ({ body, user, set }) => {
			try {
				return await exhibitionFeedbackService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		},
		{
			auth: true,
			body: CheckInitSchema,
			detail: {
				summary: "Open (or reuse) an exhibition feedback draft",
				...SECURITY,
				responses: {
					200: { description: "Draft id" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/exhibition-feedback/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await exhibitionFeedbackService.get(params.id);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get exhibition feedback by submission id",
				...SECURITY,
				responses: {
					200: { description: "Submission payload" },
					401: { description: "Unauthorized" },
					404: { description: "Not found" },
				},
			},
		},
	)
	.put(
		"/exhibition-feedback/:id",
		async ({ params, body, user, set }) => {
			try {
				return await exhibitionFeedbackService.save(params.id, user.id, body);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		},
		{
			auth: true,
			body: SaveExhibitionFeedbackSchema,
			detail: {
				summary: "Save exhibition feedback header + guest rows",
				...SECURITY,
				responses: {
					200: { description: "Updated submission" },
					401: { description: "Unauthorized" },
					404: { description: "Not found" },
					409: { description: "Submission not editable" },
				},
			},
		},
	)
	// --- F12 clo_perception_survey ----------------------------------------------
	.get(
		"/clo-perception-survey",
		cached(60, async ({ query }) =>
			listCheckSubmissions("clo_perception_survey", {
				programId: query.programId,
				termId: query.termId,
			}),
		),
		{
			auth: true,
			query: CheckListQuerySchema,
			detail: {
				summary: "List CLO perception survey submissions",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/clo-perception-survey/init",
		async ({ body, user, set }) => {
			try {
				return await cloPerceptionSurveyService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		},
		{
			auth: true,
			body: CheckInitSchema,
			detail: {
				summary: "Open (or reuse) a CLO perception survey draft",
				...SECURITY,
				responses: {
					200: { description: "Draft id" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/clo-perception-survey/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await cloPerceptionSurveyService.get(params.id);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get CLO perception survey by submission id",
				...SECURITY,
				responses: {
					200: { description: "Submission payload" },
					401: { description: "Unauthorized" },
					404: { description: "Not found" },
				},
			},
		},
	)
	.put(
		"/clo-perception-survey/:id",
		async ({ params, body, user, set }) => {
			try {
				return await cloPerceptionSurveyService.save(params.id, user.id, body);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		},
		{
			auth: true,
			body: SaveCloPerceptionSurveySchema,
			detail: {
				summary: "Save CLO perception survey header + CLO rows",
				...SECURITY,
				responses: {
					200: { description: "Updated submission" },
					401: { description: "Unauthorized" },
					404: { description: "Not found" },
					409: { description: "Submission not editable" },
				},
			},
		},
	)
	// --- F17 student_exit_survey ------------------------------------------------
	.get(
		"/student-exit-survey",
		cached(60, async ({ query }) =>
			listCheckSubmissions("student_exit_survey", {
				programId: query.programId,
				termId: query.termId,
			}),
		),
		{
			auth: true,
			query: CheckListQuerySchema,
			detail: {
				summary: "List student exit survey submissions",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/student-exit-survey/init",
		async ({ body, user, set }) => {
			try {
				return await studentExitSurveyService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		},
		{
			auth: true,
			body: CheckInitSchema,
			detail: {
				summary: "Open (or reuse) a student exit survey draft",
				...SECURITY,
				responses: {
					200: { description: "Draft id" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/student-exit-survey/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await studentExitSurveyService.get(params.id);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get student exit survey by submission id",
				...SECURITY,
				responses: {
					200: { description: "Submission payload" },
					401: { description: "Unauthorized" },
					404: { description: "Not found" },
				},
			},
		},
	)
	.put(
		"/student-exit-survey/:id",
		async ({ params, body, user, set }) => {
			try {
				return await studentExitSurveyService.save(params.id, user.id, body);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		},
		{
			auth: true,
			body: SaveStudentExitSurveySchema,
			detail: {
				summary: "Save student exit survey header + PLO rows",
				...SECURITY,
				responses: {
					200: { description: "Updated submission" },
					401: { description: "Unauthorized" },
					404: { description: "Not found" },
					409: { description: "Submission not editable" },
				},
			},
		},
	)
	// --- F18 portfolio_assessment_record ----------------------------------------
	.get(
		"/portfolio-assessment",
		cached(60, async ({ query }) =>
			listCheckSubmissions("portfolio_assessment_record", {
				programId: query.programId,
				termId: query.termId,
			}),
		),
		{
			auth: true,
			query: CheckListQuerySchema,
			detail: {
				summary: "List portfolio assessment submissions",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/portfolio-assessment/init",
		async ({ body, user, set }) => {
			try {
				return await portfolioAssessmentService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		},
		{
			auth: true,
			body: CheckInitSchema,
			detail: {
				summary: "Open (or reuse) a portfolio assessment draft",
				...SECURITY,
				responses: {
					200: { description: "Draft id" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/portfolio-assessment/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await portfolioAssessmentService.get(params.id);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get portfolio assessment by submission id",
				...SECURITY,
				responses: {
					200: { description: "Submission payload" },
					401: { description: "Unauthorized" },
					404: { description: "Not found" },
				},
			},
		},
	)
	.put(
		"/portfolio-assessment/:id",
		async ({ params, body, user, set }) => {
			try {
				return await portfolioAssessmentService.save(params.id, user.id, body);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		},
		{
			auth: true,
			body: SavePortfolioAssessmentSchema,
			detail: {
				summary: "Save portfolio assessment header + criterion rows",
				...SECURITY,
				responses: {
					200: { description: "Updated submission" },
					401: { description: "Unauthorized" },
					404: { description: "Not found" },
					409: { description: "Submission not editable" },
				},
			},
		},
	)
	// --- F19 capstone_panel_evaluation ------------------------------------------
	.get(
		"/capstone-panel",
		cached(60, async ({ query }) =>
			listCheckSubmissions("capstone_panel_evaluation", {
				programId: query.programId,
				termId: query.termId,
			}),
		),
		{
			auth: true,
			query: CheckListQuerySchema,
			detail: {
				summary: "List capstone panel evaluation submissions",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/capstone-panel/init",
		async ({ body, user, set }) => {
			try {
				return await capstonePanelEvaluationService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		},
		{
			auth: true,
			body: CheckInitSchema,
			detail: {
				summary: "Open (or reuse) a capstone panel evaluation draft",
				...SECURITY,
				responses: {
					200: { description: "Draft id" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/capstone-panel/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await capstonePanelEvaluationService.get(params.id);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get capstone panel evaluation by submission id",
				...SECURITY,
				responses: {
					200: { description: "Submission payload" },
					401: { description: "Unauthorized" },
					404: { description: "Not found" },
				},
			},
		},
	)
	.put(
		"/capstone-panel/:id",
		async ({ params, body, user, set }) => {
			try {
				return await capstonePanelEvaluationService.save(
					params.id,
					user.id,
					body,
				);
			} catch (error) {
				return mapCheckErrors(error, set);
			}
		},
		{
			auth: true,
			body: SaveCapstonePanelEvaluationSchema,
			detail: {
				summary: "Save capstone panel evaluation header + panelist rows",
				...SECURITY,
				responses: {
					200: { description: "Updated submission" },
					401: { description: "Unauthorized" },
					404: { description: "Not found" },
					409: { description: "Submission not editable" },
				},
			},
		},
	);
