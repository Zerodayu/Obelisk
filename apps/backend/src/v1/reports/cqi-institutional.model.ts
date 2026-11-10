import { t } from "elysia";

/** Optional term filter; omitted = newest term with persisted attainment. */
export const CqiInstitutionalQuerySchema = t.Object({
	termId: t.Optional(
		t.String({
			description:
				"AcademicTerm to report on; defaults to the newest term with stored attainment",
		}),
	),
	programId: t.Optional(
		t.String({
			description:
				"Optional program to scope the report to (e.g. one degree program); defaults to institution-wide",
		}),
	),
});

export type CqiInstitutionalQuery =
	typeof CqiInstitutionalQuerySchema.static;

export const CqiNarrativeReviewSchema = t.Object({
	status: t.Enum({
		// NOTE: mirrors Prisma RecommendationStatus; "acknowledged" = approved.
		acknowledged: "acknowledged",
		dismissed: "dismissed",
	}),
});

export type CqiNarrativeReview = typeof CqiNarrativeReviewSchema.static;

/** Report-scope rows the frontend renders; kept loose so the page can evolve. */
export type CqiInstitutionalReport = {
	termId: string;
	term: { schoolYear: string; semester: string };
	generatedAt: string;
	scope: {
		programs: { code: string; name: string }[];
		sections: number;
		courses: number;
		enrolledCount: number;
		assessedCount: number;
		computationRunIds: string[];
		thresholds: {
			floorPct: number;
			targetSource: string;
		};
	};
	completeness: {
		snapshotRecords: number;
		incompleteRecords: number;
		completenessPct: number | null;
		missingIndirectRecords: number;
		missingTargets: string[];
		missingSections: string[];
	};
	statistics: import("./cqi-institutional.compute").PerformanceStats;
	outcomes: import("./cqi-institutional.compute").OutcomeRow[];
	priorComparisons: import("./cqi-institutional.compute").PriorComparison[];
	findings: {
		strengths: import("./cqi-institutional.compute").Finding[];
		weaknesses: import("./cqi-institutional.compute").Finding[];
		hypotheses: {
			hypothesis: string;
			rootCauseCategory: string;
			evidenceFactIds: string[];
			status: "pending_program_chair_confirmation";
		}[];
	};
	previousCqi: import("./cqi-institutional.compute").CqiEffectivenessRow[];
	nextCycle: import("./cqi-institutional.compute").NextCyclePriorities;
	narrative: {
		id: string;
		status: string;
		generatedAt: string;
		summary: string | null;
		recommendations: import("@lib/ingest/ingest-client").CqiNarrativeRecommendation[];
		pattern: { description: string; evidenceFactIds: string[] } | null;
		/** AI hypotheses; promoted into `findings.hypotheses` by `getReport`. */
		factors: {
			hypothesis: string;
			rootCauseCategory: string;
			evidenceFactIds: string[];
			status: "pending_program_chair_confirmation";
		}[];
		dataLimitations: string[];
		missingSections: string[];
		provenance: Record<string, unknown> | null;
	} | null;
};
