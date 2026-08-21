import { authPlugin } from "@v1/auth/controller";
import { Elysia } from "elysia";
import {
	AparParamsSchema,
	CqiListQuerySchema,
	CqiPlanParamsSchema,
	CtlParamsSchema,
	PloGapParamsSchema,
	SaveAparSchema,
	SaveCqiPlanSchema,
	SaveCtlSchema,
	SaveGapAnalysisSchema,
	TrackCqiEntriesSchema,
} from "./model";
import {
	annualProgramReportService,
	CqiInvalidEditError,
	CqiSourceNotFoundError,
	CqiSubmissionNotFoundError,
	closingTheLoopService,
	cqiActionPlanService,
	listCqiSubmissions,
	ploGapAnalysisService,
} from "./service";

export const cqiPlugin = new Elysia({
	prefix: "/cqi",
	name: "cqi",
	tags: ["CQI / ACT Loop"],
})
	.use(authPlugin)
	// --- plo_gap_analysis (F22) ---------------------------------------------
	.post(
		"/plo-gap-analysis/generate",
		async ({ body, user }) => {
			const draft = await ploGapAnalysisService.ensureDraft(
				body.programId,
				body.termId,
				user.id,
			);
			const payload = await ploGapAnalysisService.generate(
				body.programId,
				body.termId,
				user.id,
			);
			return { draft, payload };
		},
		{
			auth: true,
			body: PloGapParamsSchema,
			detail: {
				summary: "Generate the PLO gap analysis matrix",
				description:
					"Derives per-PLO per-cohort attainment from stored CLO attainment and maintains one gap row for every NOT-MET PLO-cohort combination.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Gap analysis draft id + assembled payload" },
					401: { description: "Unauthorized" },
					404: { description: "Program or term not found" },
				},
			},
		},
	)
	.get(
		"/plo-gap-analysis",
		async ({ query }) =>
			listCqiSubmissions("plo_gap_analysis", {
				programId: query.programId,
			}),
		{
			auth: true,
			query: CqiListQuerySchema,
			detail: {
				summary: "List PLO gap analysis submissions",
				description: "Optionally filtered by program; newest first.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "List of gap analysis submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/plo-gap-analysis/:id",
		async ({ params, user, set }) => {
			try {
				return await ploGapAnalysisService.generateFromSubmission(
					params.id,
					user?.id,
				);
			} catch (error) {
				if (
					error instanceof CqiSubmissionNotFoundError ||
					error instanceof CqiSourceNotFoundError
				) {
					set.status = 404;
					return { error: error.message };
				}
				throw error;
			}
		},
		{
			auth: true,
			detail: {
				summary: "Get an assembled gap analysis by submission id",
				description:
					"Re-derives the gap matrix and returns the assembled payload.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Assembled gap analysis payload" },
					401: { description: "Unauthorized" },
					404: { description: "Submission or source data not found" },
				},
			},
		},
	)
	.put(
		"/plo-gap-analysis/:id",
		async ({ params, body, user, set }) => {
			try {
				return await ploGapAnalysisService.save(params.id, user.id, body);
			} catch (error) {
				if (error instanceof CqiSubmissionNotFoundError) {
					set.status = 404;
					return { error: error.message };
				}
				if (
					error instanceof CqiInvalidEditError ||
					error instanceof CqiSourceNotFoundError
				) {
					set.status = 409;
					return { error: error.message };
				}
				throw error;
			}
		},
		{
			auth: true,
			body: SaveGapAnalysisSchema,
			detail: {
				summary: "Save gap matrix root-cause analysis",
				description:
					"Writes root-cause category/analysis and CQI owner onto the NOT-MET gap rows. Only allowed while draft or returned.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Saved gap rows" },
					401: { description: "Unauthorized" },
					404: { description: "Submission not found" },
					409: { description: "Submission not editable or invalid category" },
				},
			},
		},
	)
	// --- cqi_action_plan (F23) ----------------------------------------------
	.post(
		"/cqi-action-plan/generate",
		async ({ body, user }) => {
			const draft = await cqiActionPlanService.ensureDraft(
				body.programId,
				body.termId,
				user.id,
			);
			const payload = await cqiActionPlanService.generate(
				body.programId,
				body.termId,
				user.id,
			);
			return { draft, payload };
		},
		{
			auth: true,
			body: CqiPlanParamsSchema,
			detail: {
				summary: "Generate the CQI action plan entries",
				description:
					"Creates one planned CQI entry per open gap (planned phase of the stateful two-phase lifecycle) and links the gap row to it.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "CQI action plan draft id + assembled payload" },
					401: { description: "Unauthorized" },
					404: { description: "Program or term not found" },
				},
			},
		},
	)
	.get(
		"/cqi-action-plan",
		async ({ query }) =>
			listCqiSubmissions("cqi_action_plan", {
				programId: query.programId,
			}),
		{
			auth: true,
			query: CqiListQuerySchema,
			detail: {
				summary: "List CQI action plan submissions",
				description: "Optionally filtered by program; newest first.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "List of CQI action plan submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/cqi-action-plan/:id",
		async ({ params, user, set }) => {
			try {
				return await cqiActionPlanService.generateFromSubmission(
					params.id,
					user?.id,
				);
			} catch (error) {
				if (
					error instanceof CqiSubmissionNotFoundError ||
					error instanceof CqiSourceNotFoundError
				) {
					set.status = 404;
					return { error: error.message };
				}
				throw error;
			}
		},
		{
			auth: true,
			detail: {
				summary: "Get an assembled CQI action plan by submission id",
				description:
					"Returns the planned/tracked entries for the plan's program+term.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Assembled CQI action plan payload" },
					401: { description: "Unauthorized" },
					404: { description: "Submission or source data not found" },
				},
			},
		},
	)
	.put(
		"/cqi-action-plan/:id",
		async ({ params, body, user, set }) => {
			try {
				return await cqiActionPlanService.save(params.id, user.id, body);
			} catch (error) {
				if (error instanceof CqiSubmissionNotFoundError) {
					set.status = 404;
					return { error: error.message };
				}
				if (
					error instanceof CqiInvalidEditError ||
					error instanceof CqiSourceNotFoundError
				) {
					set.status = 409;
					return { error: error.message };
				}
				throw error;
			}
		},
		{
			auth: true,
			body: SaveCqiPlanSchema,
			detail: {
				summary: "Save CQI action plan entries",
				description:
					"Writes the specific intervention, named owner, and timeline/KPI onto planned entries. Only allowed while draft or returned.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Saved entries" },
					401: { description: "Unauthorized" },
					404: { description: "Submission not found" },
					409: { description: "Submission not editable or invalid category" },
				},
			},
		},
	)
	.put(
		"/cqi-action-plan/:id/track",
		async ({ params, body, user, set }) => {
			try {
				return await cqiActionPlanService.track(params.id, user.id, body);
			} catch (error) {
				if (error instanceof CqiSubmissionNotFoundError) {
					set.status = 404;
					return { error: error.message };
				}
				if (error instanceof CqiInvalidEditError) {
					set.status = 409;
					return { error: error.message };
				}
				throw error;
			}
		},
		{
			auth: true,
			body: TrackCqiEntriesSchema,
			detail: {
				summary: "Track CQI entries to completion",
				description:
					"Flips planned entries into the tracked-to-completion phase with intervention result and current attainment (start of the following cycle).",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Updated entry count" },
					401: { description: "Unauthorized" },
					404: { description: "Submission not found" },
					409: { description: "Submission is not editable" },
				},
			},
		},
	)
	// --- closing_the_loop (F25) ---------------------------------------------
	.post(
		"/closing-the-loop/generate",
		async ({ body, user }) => {
			const draft = await closingTheLoopService.ensureDraft(
				body.programId,
				body.termId,
				user.id,
			);
			const payload = await closingTheLoopService.generate(
				body.programId,
				body.termId,
				user.id,
			);
			return { draft, payload };
		},
		{
			auth: true,
			body: CtlParamsSchema,
			detail: {
				summary: "Generate the Closing-the-Loop report rows",
				description:
					"Opens a CTL row for every tracked CQI entry not yet assigned one. Loop status is hard-computed from the five condition flags.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "CTL draft id + assembled payload" },
					401: { description: "Unauthorized" },
					404: { description: "Program or term not found" },
				},
			},
		},
	)
	.get(
		"/closing-the-loop",
		async ({ query }) =>
			listCqiSubmissions("closing_the_loop", {
				programId: query.programId,
			}),
		{
			auth: true,
			query: CqiListQuerySchema,
			detail: {
				summary: "List Closing-the-Loop submissions",
				description: "Optionally filtered by program; newest first.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "List of CTL submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/closing-the-loop/:id",
		async ({ params, user, set }) => {
			try {
				return await closingTheLoopService.generateFromSubmission(
					params.id,
					user?.id,
				);
			} catch (error) {
				if (
					error instanceof CqiSubmissionNotFoundError ||
					error instanceof CqiSourceNotFoundError
				) {
					set.status = 404;
					return { error: error.message };
				}
				throw error;
			}
		},
		{
			auth: true,
			detail: {
				summary: "Get an assembled CTL report by submission id",
				description:
					"Returns loop rows with hard-computed status plus the identify step.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Assembled CTL payload" },
					401: { description: "Unauthorized" },
					404: { description: "Submission or source data not found" },
				},
			},
		},
	)
	.put(
		"/closing-the-loop/:id",
		async ({ params, body, user, set }) => {
			try {
				return await closingTheLoopService.save(params.id, user.id, body);
			} catch (error) {
				if (error instanceof CqiSubmissionNotFoundError) {
					set.status = 404;
					return { error: error.message };
				}
				if (
					error instanceof CqiInvalidEditError ||
					error instanceof CqiSourceNotFoundError
				) {
					set.status = 409;
					return { error: error.message };
				}
				throw error;
			}
		},
		{
			auth: true,
			body: SaveCtlSchema,
			detail: {
				summary: "Save CTL rows and the identify step",
				description:
					"Writes the five condition flags and re-assessed attainment; loop status is recomputed server-side (CLOSED only if all five conditions are met).",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Saved rows" },
					401: { description: "Unauthorized" },
					404: { description: "Submission not found" },
					409: { description: "Submission not editable" },
				},
			},
		},
	)
	// --- annual_program_report (F24) ----------------------------------------
	.post(
		"/annual-program-report/generate",
		async ({ body, user }) => {
			const draft = await annualProgramReportService.ensureDraft(
				body.programId,
				user.id,
				body.termId,
			);
			const payload = await annualProgramReportService.generate(
				body.programId,
				body.termId,
				user.id,
			);
			return { draft, payload };
		},
		{
			auth: true,
			body: AparParamsSchema,
			detail: {
				summary: "Generate the Annual Program Assessment Report",
				description:
					"Computes the program performance dashboard KPIs and defaults the attachment checklist. Submission is gated on an approved cohort-tracking sheet.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "APAR draft id + assembled payload" },
					401: { description: "Unauthorized" },
					404: { description: "Program or stored attainment not found" },
				},
			},
		},
	)
	.get(
		"/annual-program-report",
		async ({ query }) =>
			listCqiSubmissions("annual_program_report", {
				programId: query.programId,
			}),
		{
			auth: true,
			query: CqiListQuerySchema,
			detail: {
				summary: "List Annual Program Assessment Report submissions",
				description: "Optionally filtered by program; newest first.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "List of APAR submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/annual-program-report/:id",
		async ({ params, user, set }) => {
			try {
				return await annualProgramReportService.generateFromSubmission(
					params.id,
					user?.id,
				);
			} catch (error) {
				if (
					error instanceof CqiSubmissionNotFoundError ||
					error instanceof CqiSourceNotFoundError
				) {
					set.status = 404;
					return { error: error.message };
				}
				throw error;
			}
		},
		{
			auth: true,
			detail: {
				summary: "Get an assembled APAR by submission id",
				description:
					"Recomputes the dashboard KPIs and returns the assembled payload.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Assembled APAR payload" },
					401: { description: "Unauthorized" },
					404: { description: "Submission or source data not found" },
				},
			},
		},
	)
	.put(
		"/annual-program-report/:id",
		async ({ params, body, user, set }) => {
			try {
				return await annualProgramReportService.save(params.id, user.id, body);
			} catch (error) {
				if (error instanceof CqiSubmissionNotFoundError) {
					set.status = 404;
					return { error: error.message };
				}
				if (error instanceof CqiInvalidEditError) {
					set.status = 409;
					return { error: error.message };
				}
				throw error;
			}
		},
		{
			auth: true,
			body: SaveAparSchema,
			detail: {
				summary: "Save APAR attachments, narratives and dashboard",
				description:
					"Writes the mandatory attachment checklist, PLO narrative, and KPI values. Submission remains gated on the cohort-tracking sheet.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Saved report" },
					401: { description: "Unauthorized" },
					404: { description: "Submission not found" },
					409: { description: "Submission not editable" },
				},
			},
		},
	);
