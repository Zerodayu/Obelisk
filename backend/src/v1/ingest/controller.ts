import { ingestClient } from "@lib/ingest/ingest-client";
import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/controller";

export const ingestService = {
	async ingest(file: File, filename: string) {
		const blob = new Blob([file]);
		return ingestClient.ingest(blob, filename);
	},
};

export const ingestPlugin = new Elysia({
	prefix: "/ingest",
	name: "ingest",
	tags: ["Ingest"],
})
	.use(authPlugin)
	.post(
		"/upload",
		async ({ body }) => {
			const result = await ingestService.ingest(body.file, body.file.name);
			return result;
		},
		{
			auth: true,
			body: t.Object({
				file: t.File({ description: "Class-record .xlsx workbook" }),
			}),
			detail: {
				summary: "Upload a class record to the python ETL server",
				description:
					"Saves the input to disposition: forwards to the python-server, polls " +
					"the job queue to completion, and returns the ETL result. Errors are " +
					"mapped from the structured python error object (error_type/details).",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Completed ETL job with result" },
					401: { description: "Unauthorized" },
					500: { description: "Python server or job failure" },
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
				summary: "Poll a python ETL job by id",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Current job state" },
					401: { description: "Unauthorized" },
				},
			},
		},
	);
