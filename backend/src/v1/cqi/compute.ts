import { MIN_ATTAINMENT_PCT } from "@lib/validators/attainment";
import type { LoopStatus, PloStatus } from "@prisma/generated/prisma/client";
import { meanPct } from "@v1/car/compute";

/**
 * Pure, DB-free computation for the CQI / ACT loop (Phase 4). All rules here
 * must hold in every service path — the database stores scalar condition flags,
 * never a manually-entered loop status.
 */

export type CohortAttainmentInput = {
	ploId: string;
	ploCode: string;
	ploDescription: string;
	yearLevel: number | null;
	compositeScorePct: number | null;
};

export type CohortAttainmentRow = {
	cohortYearLevel: number | null;
	attainmentPct: number;
};

export type PloCohortSummary = {
	ploId: string;
	ploCode: string;
	ploDescription: string;
	cohorts: CohortAttainmentRow[];
	programAvgPct: number | null;
	status: PloStatus;
	notMetCohorts: number;
};

export type GapCandidate = {
	ploId: string;
	ploCode: string;
	ploDescription: string;
	cohortYearLevel: number | null;
	attainmentPct: number;
};

/**
 * Aggregates per-student (CLO × PLO) rows into per-PLO per-cohort attainment.
 * A cohort counts as NOT MET when its mean composite falls below the 70% hard
 * floor; the PLO's overall status is ALL MET / PARTIAL / NOT MET depending on
 * how many of its observed cohorts clear the floor.
 */
export function computeCohortAttainment(
	rows: CohortAttainmentInput[],
): PloCohortSummary[] {
	const byPlo = new Map<
		string,
		{
			summary: PloCohortSummary;
			cohorts: Map<number | null, number[]>;
		}
	>();
	for (const row of rows) {
		let group = byPlo.get(row.ploId);
		if (!group) {
			group = {
				summary: {
					ploId: row.ploId,
					ploCode: row.ploCode,
					ploDescription: row.ploDescription,
					cohorts: [],
					programAvgPct: null,
					status: "not_met",
					notMetCohorts: 0,
				},
				cohorts: new Map<number | null, number[]>(),
			};
			byPlo.set(row.ploId, group);
		}

		const key = row.yearLevel ?? null;
		const bucket = group.cohorts.get(key) ?? [];
		if (row.compositeScorePct !== null && row.compositeScorePct !== undefined) {
			bucket.push(row.compositeScorePct);
			group.cohorts.set(key, bucket);
		}
	}

	const summaries: PloCohortSummary[] = [];
	for (const { summary, cohorts } of byPlo.values()) {
		summary.cohorts = [...cohorts.entries()]
			.map(([cohortYearLevel, values]) => ({
				cohortYearLevel,
				attainmentPct: meanPct(values) ?? 0,
			}))
			.sort((a, b) => (a.cohortYearLevel ?? 99) - (b.cohortYearLevel ?? 99));

		summary.programAvgPct = meanPct(
			summary.cohorts.map((c) => c.attainmentPct),
		);
		summary.notMetCohorts = summary.cohorts.filter(
			(c) => c.attainmentPct < MIN_ATTAINMENT_PCT,
		).length;
		summary.status = ploStatus(summary.cohorts);
		summaries.push(summary);
	}
	return summaries.sort((a, b) => a.ploCode.localeCompare(b.ploCode));
}

/**
 * Classifies a PLO across its observed cohorts: `all_met` when every cohort
 * clears the floor, `not_met` when none do, and `partial` when mixed.
 */
export function ploStatus(cohorts: CohortAttainmentRow[]): PloStatus {
	if (cohorts.length === 0) return "not_met";
	const met = cohorts.filter((c) => c.attainmentPct >= MIN_ATTAINMENT_PCT);
	if (met.length === cohorts.length) return "all_met";
	if (met.length === 0) return "not_met";
	return "partial";
}

/**
 * Derives the gap matrix candidates: one entry per PLO × cohort combination
 * whose attainment is below the institutional 70% hard floor. A cohort with no
 * observed attainment yields no candidate — there is nothing to re-assess.
 */
export function computeGapCandidates(
	rows: CohortAttainmentInput[],
): GapCandidate[] {
	const candidates: GapCandidate[] = [];
	for (const summary of computeCohortAttainment(rows)) {
		for (const cohort of summary.cohorts) {
			if (cohort.attainmentPct >= MIN_ATTAINMENT_PCT) continue;
			candidates.push({
				ploId: summary.ploId,
				ploCode: summary.ploCode,
				ploDescription: summary.ploDescription,
				cohortYearLevel: cohort.cohortYearLevel,
				attainmentPct: cohort.attainmentPct,
			});
		}
	}
	return candidates;
}

/**
 * Hard-computes the loop status for a CTL row. CLOSED requires all five
 * documented conditions; anything else is OPEN — either `open_not_implemented`
 * when the intervention was never deployed, or `open_reassess` otherwise.
 */
export function computeLoopStatus(input: {
	conditions12Met: boolean;
	condition3Met: boolean;
	condition4Met: boolean;
	condition5Met: boolean;
	interventionImplemented?: "yes" | "partial" | "no" | null;
	interventionImplementedText?: string | null;
}): LoopStatus {
	const allFiveMet =
		input.conditions12Met &&
		input.condition3Met &&
		input.condition4Met &&
		input.condition5Met;
	if (allFiveMet) return "closed";

	const hasDescription = Boolean(input.interventionImplementedText?.trim());
	if (input.interventionImplemented === "no" || !hasDescription) {
		return "open_not_implemented";
	}
	return "open_reassess";
}

/** Auto-computed MET / NOT MET for a dashboard KPI against its benchmark. */
export function computeDashboardStatus(
	value: number | null | undefined,
	benchmark = MIN_ATTAINMENT_PCT,
): "MET" | "NOT MET" | null {
	if (value === null || value === undefined || Number.isNaN(value)) return null;
	return value >= benchmark ? "MET" : "NOT MET";
}
