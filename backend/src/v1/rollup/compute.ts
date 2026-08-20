import { MIN_ATTAINMENT_PCT, round2 } from "@lib/validators/attainment";

/**
 * Pure compute helpers for the Phase-3 roll-up chain
 * (`clo_attainment_summary` / `plo_attainment_summary` / `cohort_tracking`).
 * CLO-level aggregation primitives (aggregateClo, meanPct, cloLevel) live in
 * `@v1/car/compute` and are reused by the services; this file owns the
 * cohort-tracking structure and trend/CQI flags only.
 */

export type CohortTrend = "UP" | "DOWN" | "FLAT";

export type CohortCloRow = {
	cloCode: string;
	cloDescription: string;
	attainmentPct: number;
	status: "MET" | "NOT MET";
};

export type CohortTerm = {
	termId: string;
	schoolYear: string;
	semester: string;
	rows: CohortCloRow[];
	averagePct: number | null;
};

export type CohortLine = {
	yearLevel: number | null;
	terms: CohortTerm[];
	trend: CohortTrend;
	cqiTriggered: boolean;
};

/** Flat per-term/per-CLO input consumed by `buildCohortLines`. */
export type CohortEntryInput = {
	yearLevel: number | null;
	termId: string;
	schoolYear: string;
	semester: string;
	row: CohortCloRow;
};

/** Mean attainment across a term's CLO rows (null when none present). */
export function cohortMeanPct(rows: CohortCloRow[]): number | null {
	const present = rows
		.map((row) => row.attainmentPct)
		.filter(
			(value): value is number => value !== null && Number.isFinite(value),
		);
	if (present.length === 0) return null;
	return round2(
		present.reduce((sum, value) => sum + value, 0) / present.length,
	);
}

/** Direction of movement between the prior and the most recent term average. */
export function trendBetween(
	prev: number | null,
	curr: number | null,
): CohortTrend {
	if (prev === null || curr === null) return "FLAT";
	if (curr > prev) return "UP";
	if (curr < prev) return "DOWN";
	return "FLAT";
}

/** A cohort line triggers CQI when any CLO in its latest term misses the 70% floor. */
export function cohortCqiTriggered(rows: CohortCloRow[]): boolean {
	return rows.some((row) => row.status === "NOT MET");
}

export function attainmentStatus(attainmentPct: number): "MET" | "NOT MET" {
	return attainmentPct < MIN_ATTAINMENT_PCT ? "NOT MET" : "MET";
}

/**
 * Groups flat per-term/per-CLO entries into per-year-level cohort lines whose
 * terms are chronologically ordered; each line's trend spans its last two
 * terms and `cqiTriggered` reflects the latest term.
 */
export function buildCohortLines(entries: CohortEntryInput[]): CohortLine[] {
	const byYear = new Map<number | null, Map<string, CohortTerm>>();
	for (const entry of entries) {
		let byTerm = byYear.get(entry.yearLevel);
		if (!byTerm) {
			byTerm = new Map<string, CohortTerm>();
			byYear.set(entry.yearLevel, byTerm);
		}
		let term = byTerm.get(entry.termId);
		if (!term) {
			term = {
				termId: entry.termId,
				schoolYear: entry.schoolYear,
				semester: entry.semester,
				rows: [],
				averagePct: null,
			};
			byTerm.set(entry.termId, term);
		}
		term.rows.push(entry.row);
	}

	const lines: CohortLine[] = [];
	for (const [yearLevel, termsMap] of byYear) {
		const terms = [...termsMap.values()].sort((a, b) => termOrder(a, b));
		for (const term of terms) {
			term.rows.sort((a, b) => a.cloCode.localeCompare(b.cloCode));
			term.averagePct = cohortMeanPct(term.rows);
		}

		const latest = terms[terms.length - 1];
		lines.push({
			yearLevel,
			terms,
			trend:
				terms.length >= 2
					? trendBetween(terms[terms.length - 2].averagePct, latest.averagePct)
					: "FLAT",
			cqiTriggered: latest ? cohortCqiTriggered(latest.rows) : false,
		});
	}

	return lines.sort((a, b) => {
		if (a.yearLevel !== null && b.yearLevel !== null)
			return a.yearLevel - b.yearLevel;
		if (a.yearLevel === null) return -1;
		return 1;
	});
}

function termOrder(a: CohortTerm, b: CohortTerm): number {
	return (
		a.schoolYear.localeCompare(b.schoolYear) ||
		a.semester.localeCompare(b.semester)
	);
}
