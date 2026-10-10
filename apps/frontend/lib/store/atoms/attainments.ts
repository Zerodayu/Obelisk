/**
 * Attainment dataset atoms (CHECK phase roll-ups).
 *
 * Backed by the rollup routes (`GET /rollup/*`): a submission list plus the
 * assembled payload of the newest submission — see
 * `lib/store/latest-payload.ts`. Datasets whose backend endpoint does not
 * exist yet are seeded with `[]` so charts render an empty state instead of
 * fabricated numbers.
 */

import type {
	CloAttainmentDatum,
	CohortTrendDatum,
	PeoAttainmentDatum,
	PloAttainmentDatum,
	ScoreBandDatum,
} from "@/components/charts/obe-sample-data";
import { api } from "@/lib/api-client";
import { atomWithAsyncData, atomWithMockData } from "@/lib/store/async-atom";
import { fetchLatestPayload } from "@/lib/store/latest-payload";

const CLO_SUMMARY = "/rollup/clo-attainment-summary";
const PLO_SUMMARY = "/rollup/plo-attainment-summary";
const COHORT_TRACKING = "/rollup/cohort-tracking";

/** Payload subset of `GET /rollup/clo-attainment-summary/:id` (`rollup/model.ts`). */
interface CloSummaryPayload {
	rows: {
		cloCode: string;
		cloDescription: string;
		weightedAvgPct: number;
		status: "MET" | "NOT MET";
	}[];
}

/** Payload subset of `GET /rollup/plo-attainment-summary/:id` (`rollup/model.ts`). */
interface PloSummaryPayload {
	plos: {
		ploCode: string;
		ploDescription: string;
		targetAttainmentPct: number;
		attainedPct: number;
		studentsBelowTargetCount: number;
	}[];
}

/** Payload subset of `GET /rollup/cohort-tracking/:id` (`rollup/model.ts`). */
interface CohortPayload {
	lines: {
		yearLevel: number | null;
		terms: {
			schoolYear: string;
			semester: string;
			averagePct: number | null;
		}[];
	}[];
}

/** `"2025-2026" + "1"` → `"2025-2026-1"`; a named semester keeps its text. */
function termLabel(schoolYear: string, semester: string): string {
	return /^[12]$/.test(semester)
		? `${schoolYear}-${semester}`
		: `${schoolYear} ${semester}`;
}

/**
 * Per-CLO attainment for the newest CLO summary submission.
 *
 * TODO(direct-indirect): the summary payload carries the CAR component
 * percentages (exam/AT/TLA/output) and the weighted composite, but no
 * per-CLO direct/indirect averages — those live only on per-student
 * `CloAttainment` rows. The chart omits those series until an endpoint
 * exposes them.
 */
export const {
	dataAtom: cloAttainmentsDataAtom,
	stateAtom: cloAttainmentsStateAtom,
	refreshAtom: refreshCloAttainmentsAtom,
} = atomWithAsyncData<CloAttainmentDatum[]>([], (_get, signal) =>
	fetchLatestPayload<CloSummaryPayload>(
		CLO_SUMMARY,
		(id) => `${CLO_SUMMARY}/${id}`,
		signal,
	).then((payload) =>
		(payload?.rows ?? []).map((row) => ({
			cloCode: row.cloCode,
			cloDescription: row.cloDescription,
			compositeScorePct: row.weightedAvgPct,
			isBelowThreshold: row.status === "NOT MET",
		})),
	),
);

/** Per-PLO attainment vs target for the newest PLO summary submission. */
export const {
	dataAtom: ploAttainmentsDataAtom,
	stateAtom: ploAttainmentsStateAtom,
	refreshAtom: refreshPloAttainmentsAtom,
} = atomWithAsyncData<PloAttainmentDatum[]>([], (_get, signal) =>
	fetchLatestPayload<PloSummaryPayload>(
		PLO_SUMMARY,
		(id) => `${PLO_SUMMARY}/${id}`,
		signal,
	).then((payload) =>
		(payload?.plos ?? []).map((plo) => ({
			ploCode: plo.ploCode,
			description: plo.ploDescription,
			attainedPct: plo.attainedPct,
			targetAttainmentPct: plo.targetAttainmentPct,
			studentsBelowTargetCount: plo.studentsBelowTargetCount,
		})),
	),
);

/**
 * Longitudinal per-cohort composite attainment for the newest cohort-tracking
 * submission. The payload nests terms under each cohort line, so it is
 * flattened to the chart's `term × cohort` rows here.
 */
export const {
	dataAtom: cohortTrendsDataAtom,
	stateAtom: cohortTrendsStateAtom,
	refreshAtom: refreshCohortTrendsAtom,
} = atomWithAsyncData<CohortTrendDatum[]>([], (_get, signal) =>
	fetchLatestPayload<CohortPayload>(
		COHORT_TRACKING,
		(id) => `${COHORT_TRACKING}/${id}`,
		signal,
	).then((payload) => {
		const rows: CohortTrendDatum[] = [];
		for (const line of payload?.lines ?? []) {
			// The chart's series are fixed to Y1–Y4; an unattributed cohort has no lane.
			if (line.yearLevel === null) continue;
			const cohort = `Y${line.yearLevel}`;
			for (const term of line.terms) {
				if (term.averagePct === null) continue;
				rows.push({
					term: termLabel(term.schoolYear, term.semester),
					cohort,
					compositeScorePct: term.averagePct,
				});
			}
		}
		return rows;
	}),
);

/**
 * 4-tier rubric score bands (`GET /rollup/score-bands`).
 *
 * The server owns the band labels and boundaries and counts each student once
 * (in the band of their lowest CLO score), so nothing is re-derived here.
 */
export const {
	dataAtom: scoreBandsDataAtom,
	refreshAtom: refreshScoreBandsAtom,
} = atomWithAsyncData<ScoreBandDatum[]>([], (_get, signal) =>
	api
		.get<{ band: ScoreBandDatum["band"]; studentCount: number }[]>(
			"/rollup/score-bands",
			{ signal },
		)
		.then((rows) => rows.map((r) => ({ ...r }))),
);

/**
 * Biennial PEO attainment vs target — the `Peo` / `PeoAttainment` models are
 * not exposed by any route yet, so the chart renders its empty state.
 */
export const {
	dataAtom: peoAttainmentsDataAtom,
	refreshAtom: refreshPeoAttainmentsAtom,
} = atomWithMockData<PeoAttainmentDatum[]>([]);
