import { ingestClient } from "@lib/ingest/ingest-client";
import { authPlugin } from "@v1/auth/controller";
import { Elysia, t } from "elysia";
import { UploadClassRecordSchema } from "./model";
import { ingestService } from "./service";

export const ingestPlugin = new Elysia({
	prefix: "/ingest",
	name: "ingest",
	tags: ["Ingest"],
})
	.use(authPlugin)
	.post(
		"/upload",
		async ({ body }) => {
			// Start the ETL job but do not wait for it to complete.
			return ingestService.startUpload(body.file, body.file.name);
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
		"/upload/:jobId/status",
		async ({ params, query, user, set }) => {
			const result = await ingestService.getJobStatus(
				params.jobId,
				query.classSectionId,
				user?.id,
			);

			if (result.status === "failed") {
				set.status = 500;
			}

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