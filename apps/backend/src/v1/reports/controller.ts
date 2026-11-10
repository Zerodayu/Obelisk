import { PythonServerError } from "@lib/ingest/ingest-client";
import {
	RoleAccessForbiddenError,
	assertCanGenerateAiInsights,
	assertCanViewAiInsights,
	assertCanViewPlatformStats,
} from "@lib/role-access";
import { authPlugin } from "@v1/auth/controller";
import { Elysia, t } from "elysia";

import {
	CqiInstitutionalQuerySchema,
	CqiNarrativeReviewSchema,
} from "./cqi-institutional.model";
import {
	CqiNarrativeNotFoundError,
	CqiReportNoDataError,
	CqiTermNotFoundError,
	cqiInstitutionalReportService,
} from "./cqi-institutional.service";
import { exportStatsService } from "./service";

const SECURITY = {
	security: [{ bearerAuth: [] as string[], apiKeyCookie: [] as string[] }],
};

/** The authenticated caller's role (better-auth additional field). */
function callerRole(user: unknown): string {
	return (user as { role?: string } | undefined)?.role ?? "user";
}

export const reportsPlugin = new Elysia({
	prefix: "/reports",
	name: "reports",
	tags: ["Reports"],
})
	.use(authPlugin)
	.onError(({ error, status }) => {
		if (error instanceof RoleAccessForbiddenError) {
			return status(403, { error: error.message });
		}
		if (
			error instanceof CqiTermNotFoundError ||
			error instanceof CqiNarrativeNotFoundError
		) {
			return status(404, { error: error.message });
		}
		if (error instanceof CqiReportNoDataError) {
			return status(409, { error: error.message });
		}
		if (error instanceof PythonServerError) {
			return status(502, { error: error.message });
		}
	})
	.get(
		"/cqi-institutional",
		async ({ query, user, set }) => {
			// NOTE: the auth macro flags 401 but does not halt the handler.
			if (!user) {
				set.status = 401;
				return { error: "Unauthorized" };
			}
			assertCanViewAiInsights(callerRole(user));
			return cqiInstitutionalReportService.getReport(query.termId, query.programId);
		},
		{
			auth: true,
			query: CqiInstitutionalQuerySchema,
			detail: {
				summary: "Assemble the institution-wide CQI report",
				description:
					"Aggregates stored attainment for one academic term into the 10-section CQI institutional report. Reads only persisted values — no attainment formula is recomputed. Includes the latest stored AI narrative, if any.",
				...SECURITY,
				responses: {
					200: { description: "Assembled CQI institutional report" },
					401: { description: "Unauthorized" },
					403: { description: "Caller may not view institutional reports" },
					404: { description: "Term not found" },
					409: { description: "No persisted attainment for the term" },
				},
			},
		},
	)
	.post(
		"/cqi-institutional/narrative",
		async ({ body, user, set }) => {
			if (!user) {
				set.status = 401;
				return { error: "Unauthorized" };
			}
			// NOTE: python-server has no RBAC — the webapp must gate the LLM call.
			assertCanGenerateAiInsights(callerRole(user));
			return cqiInstitutionalReportService.generateNarrative(
				body.termId,
				body.programId,
				user.id,
			);
		},
		{
			auth: true,
			body: CqiInstitutionalQuerySchema,
			detail: {
				summary: "Generate and persist the CQI AI narrative",
				description:
					"Sends aggregate, pre-computed facts to python-server `/analytics/cqi-narrative`. Only a validated `status: \"ok\"` is saved, as a `pending_review` AiRecommendation (never auto-approved). `error` and `narrative_unavailable` are returned without a saved row.",
				...SECURITY,
				responses: {
					200: { description: "Narrative status + stored row (or null)" },
					401: { description: "Unauthorized" },
					403: { description: "Caller may not generate AI insights" },
					404: { description: "Term not found" },
					409: { description: "No persisted attainment for the term" },
					502: { description: "python-server rejected the call" },
				},
			},
		},
	)
	.get(
		"/cqi-institutional/narrative",
		async ({ query, user, set }) => {
			if (!user) {
				set.status = 401;
				return { error: "Unauthorized" };
			}
			assertCanViewAiInsights(callerRole(user));
			if (!query.termId) {
				set.status = 400;
				return { error: "termId is required" };
			}
			return {
				narrative: await cqiInstitutionalReportService.latestNarrative(
					query.termId,
				),
			};
		},
		{
			auth: true,
			query: CqiInstitutionalQuerySchema,
			detail: {
				summary: "Get the latest stored CQI narrative",
				description:
					"Returns the newest institutional narrative for a term with its review status and provenance summary, or null.",
				...SECURITY,
				responses: {
					200: { description: "Stored narrative or null" },
					400: { description: "termId missing" },
					401: { description: "Unauthorized" },
					403: { description: "Caller may not view institutional reports" },
				},
			},
		},
	)
	.patch(
		"/cqi-institutional/narrative/:id",
		async ({ params, body, user, set }) => {
			if (!user) {
				set.status = 401;
				return { error: "Unauthorized" };
			}
			// NOTE: human review only — generation never sets approved/rejected.
			assertCanViewAiInsights(callerRole(user));
			return {
				narrative: await cqiInstitutionalReportService.reviewNarrative(
					params.id,
					body.status,
					user.id,
				),
			};
		},
		{
			auth: true,
			params: t.Object({ id: t.String() }),
			body: CqiNarrativeReviewSchema,
			detail: {
				summary: "Approve or reject a CQI narrative",
				description:
					"Records a human review decision on a stored CQI narrative. Only this endpoint can move a row out of `pending_review`.",
				...SECURITY,
				responses: {
					200: { description: "Updated narrative" },
					401: { description: "Unauthorized" },
					403: { description: "Caller may not review institutional reports" },
					404: { description: "Narrative not found" },
				},
			},
		},
	)
	.get(
		"/exports",
		async ({ user }) => {
			// NOTE: platform-wide by design (every export ever made), so it is
			// admin-gated, not unit-scoped — `ReportExport` carries the exporting
			// user, which is not the unit that produced the report.
			assertCanViewPlatformStats(callerRole(user));
			return exportStatsService.formatCounts();
		},
		{
			auth: true,
			detail: {
				summary: "Count report exports by format",
				description:
					"Platform-wide headcount of ReportExport rows per format (pdf/excel/word). Deliberately not unit-scoped — the row records who exported, not which unit produced the report — so the route is gated to system admin instead.",
				...SECURITY,
				responses: {
					200: { description: "Format -> export count" },
					401: { description: "Unauthorized" },
					403: { description: "Caller may not read platform statistics" },
				},
			},
		},
	);
