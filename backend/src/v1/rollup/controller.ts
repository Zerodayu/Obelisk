import { cached } from "@lib/cache";
import { authPlugin } from "@v1/auth/controller";
import { Elysia } from "elysia";
import {
	CloSummaryParamsSchema,
	CohortAnnotationsSchema,
	CohortParamsSchema,
	PloSummaryParamsSchema,
	RollupListQuerySchema,
} from "./model";
import {
	cloSummaryService,
	cohortTrackingService,
	listRollupSubmissions,
	ploSummaryService,
	RollupInvalidEditError,
	RollupSourceNotFoundError,
	RollupSubmissionNotFoundError,
} from "./service";

export const rollupPlugin = new Elysia({
	prefix: "/rollup",
	name: "rollup",
	tags: ["Roll-up"],
})
	.use(authPlugin)
	.post(
		"/clo-attainment-summary/generate",
		async ({ body, user }) => {
			const draft = await cloSummaryService.ensureDraft(
				body.classSectionId,
				user.id,
				body.computationRunId,
			);
			const payload = await cloSummaryService.generate(
				body.classSectionId,
				body.computationRunId,
				user.id,
			);
			return { draft, payload };
		},
		{
			auth: true,
			body: CloSummaryParamsSchema,
			detail: {
				summary: "Generate the per-section CLO attainment summary",
				description:
					"Assembles the full-term CLO attainment summary (F14) for a class section from its stored attainment and snapshots it into the section's CLO-summary submission.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "CLO summary draft id + assembled payload" },
					401: { description: "Unauthorized" },
					404: {
						description:
							"No class section or computation run found (upload a class record first)",
					},
				},
			},
		},
	)
	.get(
		"/clo-attainment-summary",
		cached(60, async ({ query }) =>
			listRollupSubmissions("clo_attainment_summary", {
				classSectionId: query.classSectionId,
				programId: query.programId,
			}),
		),
		{
			auth: true,
			query: RollupListQuerySchema,
			detail: {
				summary: "List CLO attainment summary submissions",
				description:
					"Optionally filtered by class section; newest first, without the assembled payload.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "List of CLO summary submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/clo-attainment-summary/:id",
		cached(300, async ({ params, user, set }) => {
			try {
				return await cloSummaryService.generateFromSubmission(
					params.id,
					user?.id,
				);
			} catch (error) {
				if (
					error instanceof RollupSubmissionNotFoundError ||
					error instanceof RollupSourceNotFoundError
				) {
					set.status = 404;
					return { error: error.message };
				}
				throw error;
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get an assembled CLO attainment summary by submission id",
				description:
					"Re-derives the CLO summary from stored attainment and returns the assembled payload.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Assembled CLO summary payload" },
					401: { description: "Unauthorized" },
					404: { description: "Submission or source data not found" },
				},
			},
		},
	)
	.post(
		"/plo-attainment-summary/generate",
		async ({ body, user }) => {
			const draft = await ploSummaryService.ensureDraft(
				body.programId,
				body.termId,
				user.id,
			);
			const payload = await ploSummaryService.generate(
				body.programId,
				body.termId,
				user.id,
			);
			return { draft, payload };
		},
		{
			auth: true,
			body: PloSummaryParamsSchema,
			detail: {
				summary: "Generate the program+term PLO attainment summary",
				description:
					"Feeds the program's section ETL snapshots to python-server /analytics/summary (Formula 7A/7C), then persists the PLO roll-ups into PloAttainment under a fresh ComputationRun.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "PLO summary draft id + assembled payload" },
					401: { description: "Unauthorized" },
					404: {
						description:
							"Program/term not found, or no persisted class records to feed",
					},
				},
			},
		},
	)
	.get(
		"/plo-attainment-summary",
		cached(60, async ({ query }) =>
			listRollupSubmissions("plo_attainment_summary", {
				classSectionId: query.classSectionId,
				programId: query.programId,
			}),
		),
		{
			auth: true,
			query: RollupListQuerySchema,
			detail: {
				summary: "List PLO attainment summary submissions",
				description: "Optionally filtered by program; newest first.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "List of PLO summary submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/plo-attainment-summary/:id",
		cached(300, async ({ params, user, set }) => {
			try {
				return await ploSummaryService.generateFromSubmission(
					params.id,
					user?.id,
				);
			} catch (error) {
				if (
					error instanceof RollupSubmissionNotFoundError ||
					error instanceof RollupSourceNotFoundError
				) {
					set.status = 404;
					return { error: error.message };
				}
				throw error;
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get an assembled PLO attainment summary by submission id",
				description:
					"Re-runs the PLO roll-up for the submission's program+term and returns the assembled payload.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Assembled PLO summary payload" },
					401: { description: "Unauthorized" },
					404: { description: "Submission or source data not found" },
				},
			},
		},
	)
	.post(
		"/cohort-tracking/generate",
		async ({ body, user }) => {
			const draft = await cohortTrackingService.ensureDraft(
				body.programId,
				user.id,
				body.termId,
			);
			const payload = await cohortTrackingService.generate(
				body.programId,
				body.termId,
				user.id,
			);
			return { draft, payload };
		},
		{
			auth: true,
			body: CohortParamsSchema,
			detail: {
				summary: "Generate the cohort CLO/PLO attainment tracking sheet",
				description:
					"Snapshots the longitudinal per-year-level CLO grid (F16) into the program's cohort-tracking submission and audits the write (Permanent retention).",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Cohort tracking draft id + assembled payload" },
					401: { description: "Unauthorized" },
					404: { description: "Program or stored attainment not found" },
				},
			},
		},
	)
	.get(
		"/cohort-tracking",
		cached(60, async ({ query }) =>
			listRollupSubmissions("cohort_tracking", {
				classSectionId: query.classSectionId,
				programId: query.programId,
			}),
		),
		{
			auth: true,
			query: RollupListQuerySchema,
			detail: {
				summary: "List cohort tracking submissions",
				description: "Optionally filtered by program; newest first.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "List of cohort tracking submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/cohort-tracking/:id",
		cached(300, async ({ params, user, set }) => {
			try {
				return await cohortTrackingService.generateFromSubmission(
					params.id,
					user?.id,
				);
			} catch (error) {
				if (
					error instanceof RollupSubmissionNotFoundError ||
					error instanceof RollupSourceNotFoundError
				) {
					set.status = 404;
					return { error: error.message };
				}
				throw error;
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get an assembled cohort tracking sheet by submission id",
				description:
					"Re-derives the longitudinal cohort grid and returns the assembled payload.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Assembled cohort payload" },
					401: { description: "Unauthorized" },
					404: { description: "Submission or source data not found" },
				},
			},
		},
	)
	.put(
		"/cohort-tracking/:id",
		async ({ params, body, user, set }) => {
			try {
				return await cohortTrackingService.save(params.id, user.id, body);
			} catch (error) {
				if (error instanceof RollupSubmissionNotFoundError) {
					set.status = 404;
					return { error: error.message };
				}
				if (error instanceof RollupInvalidEditError) {
					set.status = 409;
					return { error: error.message };
				}
				throw error;
			}
		},
		{
			auth: true,
			body: CohortAnnotationsSchema,
			detail: {
				summary: "Save CQI follow-up annotations on the tracking sheet",
				description:
					"Writes per-cohort annotations into the sheet's formData and audits the mutation (Permanent retention). Only allowed while draft or returned.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Saved annotations" },
					401: { description: "Unauthorized" },
					404: { description: "Submission not found" },
					409: { description: "Submission is not editable" },
				},
			},
		},
	);
