import { MIN_ATTAINMENT_PCT, round2 } from "@lib/validators/attainment";

/** 4-tier CLO level boundaries (WIN-OBE Assessment Plan §3.1.1). */
export const CLO_LEVEL_EXCEPTIONAL_MIN = 85;
export const CLO_LEVEL_PROFICIENT_MIN = 70;
export const CLO_LEVEL_BASIC_MIN = 60;

export type CloLevel = "Exceptional" | "Proficient" | "Basic" | "Below Basic";

export type CategoryPcts = {
	examPct: number | null;
	atPct: number | null;
	tlaPct: number | null;
	outputPct: number | null;
};

/** Input row for aggregation — one student's row for a single CLO. */
export type CloRowLike = {
	compositeScorePct?: number | null;
	examPct?: number | null;
	atPct?: number | null;
	tlaPct?: number | null;
	outputPct?: number | null;
	yearLevel?: number | null;
};

/** Aggregated per-CLO attainment across students (optionally coerced to a cohort). */
export type CloAggregate = {
	examPct: number | null;
	atPct: number | null;
	tlaPct: number | null;
	outputPct: number | null;
	weightedAvgPct: number;
	belowBenchmark: boolean;
	count: number;
};

/** Nullable mean over a number array; null when no non-null values exist. */
export function meanPct(
	values: Array<number | null | undefined>,
): number | null {
	const present = values.filter(
		(v): v is number => v !== null && v !== undefined && Number.isFinite(v),
	);
	if (present.length === 0) return null;
	return round2(present.reduce((sum, v) => sum + v, 0) / present.length);
}

/** Maps an attainment percentage to its 4-tier descriptive level. */
export function cloLevel(pct: number): CloLevel {
	if (pct >= CLO_LEVEL_EXCEPTIONAL_MIN) return "Exceptional";
	if (pct >= CLO_LEVEL_PROFICIENT_MIN) return "Proficient";
	if (pct >= CLO_LEVEL_BASIC_MIN) return "Basic";
	return "Below Basic";
}

/**
 * Aggregates per-student CLO rows into a single CLO summary: true means per
 * assessment category, a composite weighted average, and the below-benchmark
 * flag (mean composite < 70% hard floor).
 */
export function aggregateClo(rows: CloRowLike[]): CloAggregate {
	const exam = meanPct(rows.map((r) => r.examPct ?? null));
	const at = meanPct(rows.map((r) => r.atPct ?? null));
	const tla = meanPct(rows.map((r) => r.tlaPct ?? null));
	const output = meanPct(rows.map((r) => r.outputPct ?? null));
	const composite = meanPct(rows.map((r) => r.compositeScorePct ?? null));
	const weightedAvgPct = composite ?? 0;
	return {
		examPct: exam,
		atPct: at,
		tlaPct: tla,
		outputPct: output,
		weightedAvgPct,
		belowBenchmark: weightedAvgPct < MIN_ATTAINMENT_PCT,
		count: rows.length,
	};
}

/**
 * Groups per-student CLO rows by year-level cohort. Rows without a year level
 * collapse into a single `null` cohort (kept separate from named cohorts).
 */
export function groupByCohort<T extends CloRowLike>(
	rows: T[],
	cohortKey: (row: T) => number | null,
): Map<number | null, T[]> {
	const groups = new Map<number | null, T[]>();
	for (const row of rows) {
		const key = cohortKey(row);
		const bucket = groups.get(key) ?? [];
		bucket.push(row);
		groups.set(key, bucket);
	}
	return groups;
}

export type CategoryPctField = "examPct" | "atPct" | "tlaPct" | "outputPct";

/** Per-category means for a set of rows; returns only non-null entries. */
export function categoryMeans(
	rows: CloRowLike[],
	fields: CategoryPctField[] = ["examPct", "atPct", "tlaPct", "outputPct"],
): CategoryPcts {
	const means: CategoryPcts = {
		examPct: null,
		atPct: null,
		tlaPct: null,
		outputPct: null,
	};
	for (const field of fields) {
		means[field] = meanPct(rows.map((r) => r[field] ?? null));
	}
	return means;
}
