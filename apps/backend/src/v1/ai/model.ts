import { t } from "elysia";

// --- Request schemas -------------------------------------------------------

export const AiRecommendationParamsSchema = t.Object({
	termId: t.Optional(
		t.String({
			description:
				"AcademicTerm to analyse; defaults to the newest term with persisted class records",
		}),
	),
});

export type AiRecommendationParams = typeof AiRecommendationParamsSchema.static;

// --- Review -----------------------------------------------------------------

export const ReviewRecommendationSchema = t.Object({
	status: t.Enum({
		acknowledged: "acknowledged",
		actioned: "actioned",
		dismissed: "dismissed",
	}),
});

export type ReviewRecommendation = typeof ReviewRecommendationSchema.static;
