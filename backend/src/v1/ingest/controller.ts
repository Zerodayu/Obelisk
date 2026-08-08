import { ingestClient } from "@lib/ingest/ingest-client";
import { authPlugin } from "@v1/auth/controller";
import { Elysia } from "elysia";
import { UploadClassRecordSchema } from "./model";
import { ingestService, MalformedEtlResultError } from "./service";

export const ingestPlugin = new Elysia({
	prefix: "/ingest",
	name: "ingest",
	tags: ["Ingest"],
})
	.use(authPlugin)
	.post(
		"/upload",
		async ({ body, user, set }) => {
			try {
				return await ingestService.uploadAndPersist(
					body.file,
					body.file.name,
					body.classSectionId,
					user?.id,
				);
			} catch (error) {
				set.status = 500;
				if (error instanceof MalformedEtlResultError) {
					return {
						error: "Malformed ETL Result",
						message: error.message,
						etlJobId: error.etlJobId,
					};
				}
				const e = error as Error;
				console.error("[INGESTION_ERROR]", error);
				return {
					error: "Persistence Failed",
					message: e.message,
				};
			}
		},
		{
			auth: true,
			body: UploadClassRecordSchema,
			detail: {
				summary: "Upload class record, run ETL, and persist attainment results",
				description:
					"Forwards the file to the python-server for ETL. Once complete, " +
					"the resulting attainment data is persisted to the database. " +
					"Returns both the raw ETL result and a summary of the persistence operation.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: {
						description:
							"ETL and persistence complete. Returns ETL data and persistence summary.",
					},
					401: { description: "Unauthorized" },
					500: {
						description:
							"Indicates a failure in the ETL job, a malformed ETL result, or a database persistence error.",
					},
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
