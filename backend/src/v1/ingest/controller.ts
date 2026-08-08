import { ingestClient } from "@lib/ingest/ingest-client";
import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/controller";
import {
	attainmentService,
	type TypedEtlLoadedData,
} from "./attainment-service";

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
		async ({ body, user, set }) => {
			const etlResult = await ingestService.ingest(body.file, body.file.name);

			// Runtime validation of the nested structure
			if (
				!etlResult.result?.loaded ||
				!Array.isArray(etlResult.result.loaded.attainments)
			) {
				set.status = 500;
				return {
					error: "Malformed ETL Result",
					message:
						"The result from the python-server was missing the expected 'result.loaded.attainments' structure.",
					etlJobId: etlResult.job_id,
				};
			}

			try {
				// The type assertion is safe due to the runtime check above
				const loadedData = etlResult.result.loaded as TypedEtlLoadedData;

				const persistenceSummary = await attainmentService.persistAttainment(
					loadedData,
					body.classSectionId,
					user?.id,
				);

				return {
					etl: etlResult.result,
					persistence: persistenceSummary,
				};
			} catch (e) {
				set.status = 500;
				const error = e as Error;
				// Log the full error object to the backend terminal
				console.error("[INGESTION_ERROR]", error);
				return {
					error: "Persistence Failed",
					message: error.message,
					stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
				};
			}
		},
		{
			auth: true,
			body: t.Object({
				file: t.File({ description: "Class-record .xlsx workbook" }),
				classSectionId: t.String({
					description: "ID of the ClassSection to associate attainments with",
				}),
			}),
			detail: {
				summary:
					"Upload class record, run ETL, and persist attainment results",
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