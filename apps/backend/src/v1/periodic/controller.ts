import { cached } from "@lib/cache";
import { authPlugin } from "@v1/auth/controller";
import { Elysia } from "elysia";
import {
	PeriodicInitSchema,
	PeriodicListQuerySchema,
	SaveAlumniTracerSchema,
	SaveCapaPlanSchema,
	SaveEmployerSurveySchema,
	SaveInstitutionalReviewSchema,
	SavePortfolioRoadmapSchema,
	SaveResourceMonitoringSchema,
	SaveSystemicGapReportSchema,
} from "./model";
import {
	alumniTracerService,
	capaPlanService,
	employerSurveyService,
	institutionalReviewService,
	listPeriodicSubmissions,
	PeriodicInvalidEditError,
	PeriodicSubmissionNotFoundError,
	PeriodicValidationError,
	portfolioRoadmapService,
	resourceMonitoringService,
	systemicGapReportService,
} from "./service";

const SECURITY = {
	security: [{ bearerAuth: [] as string[], apiKeyCookie: [] as string[] }],
};

function mapPeriodicErrors(
	error: unknown,
	set: { status?: string | number },
): unknown {
	if (error instanceof PeriodicSubmissionNotFoundError) {
		set.status = 404;
		return { error: error.message };
	}
	if (
		error instanceof PeriodicInvalidEditError ||
		error instanceof PeriodicValidationError
	) {
		set.status = 409;
		return { error: error.message };
	}
	throw error;
}

export const periodicPlugin = new Elysia({
	prefix: "/periodic",
	name: "periodic",
	tags: ["Periodic / Institutional Forms"],
})
	.use(authPlugin)
	// --- F09 resource_monitoring ------------------------------------------------
	.get(
		"/resource-monitoring",
		cached(60, async ({ query }) =>
			listPeriodicSubmissions("resource_monitoring", {
				programId: query.programId,
				termId: query.termId,
			}),
		),
		{
			auth: true,
			query: PeriodicListQuerySchema,
			detail: {
				summary: "List resource monitoring submissions",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/resource-monitoring/init",
		async ({ body, user, set }) => {
			try {
				return await resourceMonitoringService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		},
		{
			auth: true,
			body: PeriodicInitSchema,
			detail: {
				summary: "Open (or reuse) a resource monitoring draft",
				...SECURITY,
				responses: {
					200: { description: "Draft id" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/resource-monitoring/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await resourceMonitoringService.get(params.id);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get resource monitoring by submission id",
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
		"/resource-monitoring/:id",
		async ({ params, body, user, set }) => {
			try {
				return await resourceMonitoringService.save(params.id, user.id, body);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		},
		{
			auth: true,
			body: SaveResourceMonitoringSchema,
			detail: {
				summary: "Save resource monitoring header + resource items + CQI rows",
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
	// --- F20 alumni_tracer ------------------------------------------------------
	.get(
		"/alumni-tracer",
		cached(60, async ({ query }) =>
			listPeriodicSubmissions("alumni_tracer", {
				programId: query.programId,
				termId: query.termId,
			}),
		),
		{
			auth: true,
			query: PeriodicListQuerySchema,
			detail: {
				summary: "List alumni tracer submissions",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/alumni-tracer/init",
		async ({ body, user, set }) => {
			try {
				return await alumniTracerService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		},
		{
			auth: true,
			body: PeriodicInitSchema,
			detail: {
				summary: "Open (or reuse) an alumni tracer draft",
				...SECURITY,
				responses: {
					200: { description: "Draft id" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/alumni-tracer/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await alumniTracerService.get(params.id);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get alumni tracer by submission id",
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
		"/alumni-tracer/:id",
		async ({ params, body, user, set }) => {
			try {
				return await alumniTracerService.save(params.id, user.id, body);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		},
		{
			auth: true,
			body: SaveAlumniTracerSchema,
			detail: {
				summary: "Save alumni tracer header + employment indicators + PLO rows",
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
	// --- F21 employer_satisfaction_survey ---------------------------------------
	.get(
		"/employer-survey",
		cached(60, async ({ query }) =>
			listPeriodicSubmissions("employer_satisfaction_survey", {
				programId: query.programId,
				termId: query.termId,
			}),
		),
		{
			auth: true,
			query: PeriodicListQuerySchema,
			detail: {
				summary: "List employer satisfaction survey submissions",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/employer-survey/init",
		async ({ body, user, set }) => {
			try {
				return await employerSurveyService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		},
		{
			auth: true,
			body: PeriodicInitSchema,
			detail: {
				summary: "Open (or reuse) an employer satisfaction survey draft",
				...SECURITY,
				responses: {
					200: { description: "Draft id" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/employer-survey/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await employerSurveyService.get(params.id);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get employer satisfaction survey by submission id",
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
		"/employer-survey/:id",
		async ({ params, body, user, set }) => {
			try {
				return await employerSurveyService.save(params.id, user.id, body);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		},
		{
			auth: true,
			body: SaveEmployerSurveySchema,
			detail: {
				summary: "Save employer survey header + employer profiles + PLO rows",
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
	// --- F26 systemic_gap_report ------------------------------------------------
	.get(
		"/systemic-gap-report",
		cached(60, async ({ query }) =>
			listPeriodicSubmissions("systemic_gap_report", {
				programId: query.programId,
				termId: query.termId,
			}),
		),
		{
			auth: true,
			query: PeriodicListQuerySchema,
			detail: {
				summary: "List systemic gap report submissions",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/systemic-gap-report/init",
		async ({ body, user, set }) => {
			try {
				return await systemicGapReportService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		},
		{
			auth: true,
			body: PeriodicInitSchema,
			detail: {
				summary: "Open (or reuse) a systemic gap report draft",
				...SECURITY,
				responses: {
					200: { description: "Draft id" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/systemic-gap-report/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await systemicGapReportService.get(params.id);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get systemic gap report by submission id",
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
		"/systemic-gap-report/:id",
		async ({ params, body, user, set }) => {
			try {
				return await systemicGapReportService.save(params.id, user.id, body);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		},
		{
			auth: true,
			body: SaveSystemicGapReportSchema,
			detail: {
				summary:
					"Save systemic gap report header + cycle evidence + root cause",
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
	// --- F27 capa_plan ---------------------------------------------------------
	.get(
		"/capa-plan",
		cached(60, async ({ query }) =>
			listPeriodicSubmissions("capa_plan", {
				programId: query.programId,
				termId: query.termId,
			}),
		),
		{
			auth: true,
			query: PeriodicListQuerySchema,
			detail: {
				summary: "List CAPA plan submissions",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/capa-plan/init",
		async ({ body, user, set }) => {
			try {
				return await capaPlanService.init(body.programId, body.termId, user.id);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		},
		{
			auth: true,
			body: PeriodicInitSchema,
			detail: {
				summary: "Open (or reuse) a CAPA plan draft",
				...SECURITY,
				responses: {
					200: { description: "Draft id" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/capa-plan/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await capaPlanService.get(params.id);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get CAPA plan by submission id",
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
		"/capa-plan/:id",
		async ({ params, body, user, set }) => {
			try {
				return await capaPlanService.save(params.id, user.id, body);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		},
		{
			auth: true,
			body: SaveCapaPlanSchema,
			detail: {
				summary: "Save CAPA plan header + actions + progress reviews",
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
	// --- F28 institutional_review ----------------------------------------------
	.get(
		"/institutional-review",
		cached(60, async ({ query }) =>
			listPeriodicSubmissions("institutional_review", {
				programId: query.programId,
				termId: query.termId,
			}),
		),
		{
			auth: true,
			query: PeriodicListQuerySchema,
			detail: {
				summary: "List institutional review submissions",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/institutional-review/init",
		async ({ body, user, set }) => {
			try {
				return await institutionalReviewService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		},
		{
			auth: true,
			body: PeriodicInitSchema,
			detail: {
				summary: "Open (or reuse) an institutional review draft",
				...SECURITY,
				responses: {
					200: { description: "Draft id" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/institutional-review/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await institutionalReviewService.get(params.id);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get institutional review by submission id",
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
		"/institutional-review/:id",
		async ({ params, body, user, set }) => {
			try {
				return await institutionalReviewService.save(params.id, user.id, body);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		},
		{
			auth: true,
			body: SaveInstitutionalReviewSchema,
			detail: {
				summary:
					"Save institutional review header + program reviews + CQI completions",
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
	// --- F02 portfolio_roadmap --------------------------------------------------
	.get(
		"/portfolio-roadmap",
		cached(60, async ({ query }) =>
			listPeriodicSubmissions("portfolio_roadmap", {
				programId: query.programId,
				termId: query.termId,
			}),
		),
		{
			auth: true,
			query: PeriodicListQuerySchema,
			detail: {
				summary: "List portfolio roadmap submissions",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/portfolio-roadmap/init",
		async ({ body, user, set }) => {
			try {
				return await portfolioRoadmapService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		},
		{
			auth: true,
			body: PeriodicInitSchema,
			detail: {
				summary: "Open (or reuse) a portfolio roadmap draft",
				...SECURITY,
				responses: {
					200: { description: "Draft id" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/portfolio-roadmap/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await portfolioRoadmapService.get(params.id);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get portfolio roadmap by submission id",
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
		"/portfolio-roadmap/:id",
		async ({ params, body, user, set }) => {
			try {
				return await portfolioRoadmapService.save(params.id, user.id, body);
			} catch (error) {
				return mapPeriodicErrors(error, set);
			}
		},
		{
			auth: true,
			body: SavePortfolioRoadmapSchema,
			detail: {
				summary: "Save portfolio roadmap header + roadmap rows + rubric rows",
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
