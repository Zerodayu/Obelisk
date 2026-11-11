import { cached } from "@lib/cache";
import { PythonServerError } from "@lib/ingest/ingest-client";
import {
	assertCanGenerateAiInsights,
	RoleAccessForbiddenError,
} from "@lib/role-access";
import { unitScopeOf } from "@lib/unit-scope";
import { authPlugin } from "@v1/auth/controller";
import { Elysia } from "elysia";

import { AiRecommendationParamsSchema } from "./model";
import {
	AiNoDataError,
	AiTermNotFoundError,
	aiRecommendationService,
} from "./service";

/** The authenticated caller's role (better-auth additional field). */
function callerRole(user: unknown): string {
	return (user as { role?: string } | undefined)?.role ?? "user";
}

const SECURITY = {
	security: [{ bearerAuth: [] as string[], apiKeyCookie: [] as string[] }],
};

export const aiPlugin = new Elysia({
	prefix: "/ai",
	name: "ai",
	tags: ["AI"],
})
	.use(authPlugin)
	.onError(({ error, status }) => {
		if (error instanceof RoleAccessForbiddenError) {
			return status(403, { error: error.message });
		}
		if (error instanceof AiTermNotFoundError) {
			return status(404, { error: error.message });
		}
		if (error instanceof AiNoDataError) {
			return status(409, { error: error.message });
		}
		if (error instanceof PythonServerError) {
			// python-server rejected/mis-ran the analytics call — surface its
			// structured message instead of a generic 500.
			return status(502, { error: error.message });
		}
	})
	.get(
		// NOTE: registered before `/recommendation/latest` — both are literal
		// paths, but keeping the more specific pattern first avoids any doubt
		// about resolution order in Elysia's static-router.
		"/recommendations/status-counts",
		cached(300, async ({ user }) =>
			aiRecommendationService.statusCounts(unitScopeOf(user)),
		),
		{
			auth: true,
			detail: {
				summary: "Count AI recommendations by review status",
				description:
					"The review-status distribution across the caller's unit — a different question from `GET /recommendation/latest`, which returns the single newest record. `generate` stores institution-wide rows (programId null), so only institution-wide roles have anything to count.",
				...SECURITY,
				responses: {
					200: { description: "Status -> count" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/recommendation/latest",
		async ({ user, set }) => {
			// NOTE: the auth macro flags 401 but does not halt the handler —
			// without this bail an unauthenticated caller would receive the
			// persisted recommendation body under a 401 status.
			if (!user) {
				set.status = 401;
				return { recommendation: null };
			}
			return {
				recommendation: await aiRecommendationService.latest(unitScopeOf(user)),
			};
		},
		{
			auth: true,
			detail: {
				summary: "Get the latest persisted AI CQI recommendation",
				description:
					"Returns the newest `AiRecommendation` (markdown text + worst-performing CLOs + period + the per-course alignment context behind it: Bloom's level, I-P-D stage, assessment types) or null when none has been generated yet. Generation is institution-wide, so only institution-wide roles (AQAU/VPAA/admin) receive one — scoped faculty/chair/dean callers get `null`. Only generation is gated.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Latest recommendation or null" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/recommendation/generate",
		async ({ body, user, set }) => {
			// NOTE: the auth macro flags 401 but does not halt the handler —
			// bail before any python-server call or DB write. Role assert
			// next: INTEGRATION.md requires the webapp to enforce VPAA for
			// /institutional-summary.
			if (!user) {
				set.status = 401;
				return { error: "Unauthorized" };
			}
			assertCanGenerateAiInsights(callerRole(user));
			const recommendation = await aiRecommendationService.generate(
				body.termId,
			);
			return { recommendation };
		},
		{
			auth: true,
			body: AiRecommendationParamsSchema,
			detail: {
				summary: "Generate and persist an AI CQI recommendation",
				description:
					"Replays stored ETL snapshots for the target term (default: newest term with class records) into python-server /analytics/institutional-summary — a pure rollup plus an LLM call, carrying each section's pedagogical alignment (Bloom's / I-P-D / assessment types from its latest CAR) into the prompt — and stores the result as an AiRecommendation (status pending_review).",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Persisted recommendation" },
					401: { description: "Unauthorized" },
					403: { description: "Caller's role may not generate AI insights" },
					404: { description: "Requested term not found" },
					409: { description: "No persisted class records to analyse" },
					502: { description: "python-server analytics failure" },
				},
			},
		},
	);
