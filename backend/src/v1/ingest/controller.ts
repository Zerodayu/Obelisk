import { ingestClient } from "@lib/ingest/ingest-client";
import { authPlugin } from "@v1/auth/controller";
import { Elysia, t } from "elysia";
import {
	ListAttainmentsSchema,
	ReimportScoresSchema,
	UpdateAttainmentsSchema,
	UploadClassRecordSchema,
} from "./model";
import {
	attainmentService,
	ComputationRunNotFoundError,
	ingestService,
	MalformedRosterCsvError,
} from "./service";

export const ingestPlugin = new Elysia({
	prefix: "/ingest",
	name: "ingest",
	tags: ["Ingest"],
})
	.use(authPlugin)
	.post(
		"/upload",
		async ({ body, user }) => {
			// Start the ETL job but do not wait for it to complete.
			return ingestService.startUpload(
				body.file,
				body.file.name,
				body.classSectionId,
				user.id,
			);
		},
		{
			auth: true,
			body: UploadClassRecordSchema,
			detail: {
				summary: "Upload class record and start ETL process",
				description:
					"Forwards the file to the python-server for ETL and immediately returns a job ID.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "ETL job started successfully." },
					401: { description: "Unauthorized" },
					500: { description: "Python server failure on job creation." },
				},
			},
		},
	)
	.get(
		"/history",
		async ({ user }) => {
			return ingestService.listHistory(user.id);
		},
		{
			auth: true,
			detail: {
				summary: "List the current user's class-record upload history",
				description:
					"Returns every upload attempt by the signed-in user (any class section), newest first, including failed ones.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: {
						description: "List of upload records for the current user.",
					},
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/attainments",
		async ({ query }) => {
			return attainmentService.listAttainments(
				query.classSectionId,
				query.computationRunId,
			);
		},
		{
			auth: true,
			query: ListAttainmentsSchema,
			detail: {
				summary: "List per-student CLO attainment rows (editable roster)",
				description:
					"Returns the per-student CLO attainment rows for a class section's computation run (latest by default) with each row's id, student, CLO, scores, and at-risk state.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "List of attainment roster rows" },
					401: { description: "Unauthorized" },
					404: {
						description: "No computation run found for the class section",
					},
				},
			},
		},
	)
	.put(
		"/attainments",
		async ({ body, user, set }) => {
			try {
				return await attainmentService.updateScores(
					body.classSectionId,
					body.updates,
					user.id,
				);
			} catch (error) {
				if (error instanceof ComputationRunNotFoundError) {
					set.status = 404;
					return { error: error.message };
				}
				throw error;
			}
		},
		{
			auth: true,
			body: UpdateAttainmentsSchema,
			detail: {
				summary: "Manually edit per-student CLO scores",
				description:
					"Updates direct scores for the given CloAttainment rows, recomputes composite/threshold, and reconciles at-risk flags (computed, never manual).",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Score update summary" },
					401: { description: "Unauthorized" },
					404: {
						description: "No computation run found for the class section",
					},
				},
			},
		},
	)
	.post(
		"/attainments/reimport",
		async ({ body, set }) => {
			try {
				return await attainmentService.reimportScores(
					body.file,
					body.classSectionId,
					body.computationRunId,
				);
			} catch (error) {
				if (
					error instanceof ComputationRunNotFoundError ||
					error instanceof MalformedRosterCsvError
				) {
					set.status = 400;
					return { error: error.message };
				}
				throw error;
			}
		},
		{
			auth: true,
			body: ReimportScoresSchema,
			detail: {
				summary: "Re-import per-student scores from a roster CSV/TSV",
				description:
					"Parses a wide-format roster (student_name, student_id?, CLO1, CLO2, …), upserts the matching CloAttainment rows, and reconciles at-risk flags.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Re-import summary" },
					400: {
						description:
							"Malformed roster or no computation run for the class section",
					},
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/upload/:jobId/status",
		async ({ params, query, user }) => {
			const result = await ingestService.getJobStatus(
				params.jobId,
				query.classSectionId,
				user?.id,
			);

			return result;
		},
		{
			auth: true,
			params: t.Object({ jobId: t.String() }),
			query: t.Object({ classSectionId: t.String() }),
			detail: {
				summary: "Get status of an ingest job and trigger persistence",
				description:
					"Poll this endpoint to check the status of an upload job. When the job is complete, the server will trigger the database persistence step and return the final summary. This persistence step is idempotent and will only run once.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: {
						description:
							"Returns current job status ('queued', 'running') or the final result ('completed', 'failed').",
					},
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/jobs/:jobId",
		async ({ params }) => {
			const job = await ingestClient.getJob(params.jobId);
			return job;
		},
		{
			auth: true,
			detail: {
				summary: "Poll a python ETL job by id (raw)",
				description:
					"DEPRECATED: Use /ingest/upload/:jobId/status instead. This endpoint returns the raw python-server job state without triggering persistence.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Current job state" },
					401: { description: "Unauthorized" },
				},
			},
		},
	);
