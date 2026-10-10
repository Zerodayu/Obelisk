import { cached } from "@lib/cache";
import { ingestClient } from "@lib/ingest/ingest-client";
import {
	assertCanCaptureClassRecords,
	RoleAccessForbiddenError,
} from "@lib/role-access";
import { assertClassSectionInScope, unitScopeOf } from "@lib/unit-scope";
import { authPlugin } from "@v1/auth/controller";
import { Elysia, t } from "elysia";
import {
	CloRawDataSubmissionSchema,
	InitCloRawDataSchema,
	ListAttainmentsSchema,
	ReimportScoresSchema,
	SaveIngestSchema,
	UpdateAttainmentsSchema,
	UploadClassRecordSchema,
} from "./model";
import {
	attainmentService,
	ClassSectionNotFoundError,
	ComputationRunNotFoundError,
	ingestService,
	MalformedRosterCsvError,
	SectionBindingMismatchError,
} from "./service";

/** The authenticated caller's role (better-auth additional field). */
function callerRole(user: unknown): string {
	return (user as { role?: string } | undefined)?.role ?? "user";
}

/**
 * Role gate **and** unit gate, run together on every route that binds to a
 * class section: the caller must be allowed to capture class records *and* the
 * section must sit inside its own program/department (`lib/unit-scope.ts`) —
 * otherwise reading/ETL-ing it would leak or write across units (403).
 */
async function gateSection(user: unknown, classSectionId: string) {
	assertCanCaptureClassRecords(callerRole(user));
	await assertClassSectionInScope(unitScopeOf(user), classSectionId);
}

/**
 * Class-record read of the per-student roster, wrapped so the role assert
 * runs **before** the cache lookup — a warm cache must never let a
 * non-capture role past the gate.
 */
const listAttainmentsCached = cached(60, async ({ query }) => {
	return attainmentService.listAttainments(
		query.classSectionId,
		query.computationRunId,
	);
});

export const ingestPlugin = new Elysia({
	prefix: "/ingest",
	name: "ingest",
	tags: ["Ingest"],
})
	.use(authPlugin)
	.onError(({ error, status }) => {
		if (error instanceof RoleAccessForbiddenError) {
			return status(403, { error: error.message });
		}
		if (error instanceof ClassSectionNotFoundError) {
			return status(404, { error: error.message });
		}
		if (error instanceof SectionBindingMismatchError) {
			return status(400, { error: error.message });
		}
	})
	.post(
		"/upload",
		async ({ body, user }) => {
			await gateSection(user, body.classSectionId);
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
					403: { description: "Caller's role may not capture class records" },
					404: { description: "ClassSection not found" },
					500: { description: "Python server failure on job creation." },
				},
			},
		},
	)
	.get(
		"/clo-raw-data/submission",
		async ({ query, user }) => {
			await gateSection(user, query.classSectionId);
			return ingestService.getSubmission(query.classSectionId);
		},
		{
			auth: true,
			query: CloRawDataSubmissionSchema,
			detail: {
				summary: "Look up the clo_raw_data submission for a class section",
				description:
					"Returns the newest submission bound to the section (any status), or null when none exists yet — drives the approval-workflow strip on /forms/clo-raw-data.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "{ formSubmissionId: string | null }" },
					401: { description: "Unauthorized" },
					403: { description: "Caller's role may not capture class records" },
					404: { description: "ClassSection not found" },
				},
			},
		},
	)
	.post(
		"/clo-raw-data/init",
		async ({ body, user }) => {
			await gateSection(user, body.classSectionId);
			return ingestService.initSubmission(body.classSectionId, user.id);
		},
		{
			auth: true,
			body: InitCloRawDataSchema,
			detail: {
				summary: "Open (or reuse) the clo_raw_data submission draft",
				description:
					"Creates a draft bound to the class section (term and program resolved server-side) or returns the existing draft/returned/submitted one. An approved/archived submission is left alone and a fresh draft is created.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					201: { description: "{ formSubmissionId: string }" },
					401: { description: "Unauthorized" },
					403: { description: "Caller's role may not capture class records" },
					404: { description: "ClassSection not found" },
				},
			},
		},
	)
	.get(
		"/history",
		async ({ user }) => {
			assertCanCaptureClassRecords(callerRole(user));
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
					403: { description: "Caller's role may not capture class records" },
				},
			},
		},
	)
	.get(
		"/attainments",
		async (ctx) => {
			// NOTE: assert outside `cached` so a cache hit skips nothing.
			await gateSection(ctx.user, ctx.query.classSectionId);
			return listAttainmentsCached(ctx);
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
					403: { description: "Caller's role may not capture class records" },
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
			await gateSection(user, body.classSectionId);
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
					403: { description: "Caller's role may not capture class records" },
					404: {
						description: "No computation run found for the class section",
					},
				},
			},
		},
	)
	.post(
		"/attainments/reimport",
		async ({ body, user, set }) => {
			await gateSection(user, body.classSectionId);
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
					403: { description: "Caller's role may not capture class records" },
				},
			},
		},
	)
	.get(
		"/upload/:jobId/status",
		async ({ params, query, user }) => {
			await gateSection(user, query.classSectionId);
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
				summary: "Get status of an ingest job (preview before saving)",
				description:
					"Poll this endpoint to check the status of an upload job. When the ETL finishes it answers 'ready' with a preview (section verification + parsed counts) and writes nothing — persist it with POST /ingest/upload/:jobId/save, or drop it with /discard.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: {
						description:
							"Returns 'queued'/'running', 'ready' + preview, or the final result ('completed' after a save, 'failed').",
					},
					400: { description: "Section binding mismatch" },
					401: { description: "Unauthorized" },
					403: { description: "Caller's role may not capture class records" },
					404: { description: "ClassSection not found" },
				},
			},
		},
	)
	.post(
		"/upload/:jobId/save",
		async ({ params, body, user }) => {
			await gateSection(user, body.classSectionId);
			return ingestService.saveJob(
				params.jobId,
				body.classSectionId,
				user.id,
			);
		},
		{
			auth: true,
			params: t.Object({ jobId: t.String() }),
			body: SaveIngestSchema,
			detail: {
				summary: "Save a reviewed upload job",
				description:
					"Persists a finished ('ready') ETL job: creates the ComputationRun and its attainment/flag rows, then marks the UploadRecord completed. Idempotent — a repeated save replays the stored summary without writing twice.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: {
						description:
							"Persistence summary, or 'running' while another save is in flight.",
					},
					400: { description: "Section binding mismatch" },
					401: { description: "Unauthorized" },
					403: { description: "Caller's role may not capture class records" },
					404: { description: "ClassSection not found" },
				},
			},
		},
	)
	.post(
		"/upload/:jobId/discard",
		async ({ params, body, user }) => {
			await gateSection(user, body.classSectionId);
			return ingestService.discardJob(params.jobId, body.classSectionId);
		},
		{
			auth: true,
			params: t.Object({ jobId: t.String() }),
			body: SaveIngestSchema,
			detail: {
				summary: "Discard a reviewed upload job",
				description:
					"User chose to re-upload instead of saving: marks the UploadRecord discarded. No attainment data is touched — nothing was ever written for a queued job.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "{ status: 'discarded' }" },
					400: { description: "Section binding mismatch" },
					401: { description: "Unauthorized" },
					403: { description: "Caller's role may not capture class records" },
					404: { description: "ClassSection not found" },
				},
			},
		},
	)
	.get(
		"/jobs/:jobId",
		async ({ params, user }) => {
			assertCanCaptureClassRecords(callerRole(user));
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
					403: { description: "Caller's role may not capture class records" },
				},
			},
		},
	);
