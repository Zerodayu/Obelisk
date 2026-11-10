import { MIN_ATTAINMENT_PCT, round2 } from "@lib/validators/attainment";
import { SCORE_BANDS, scoreBandOf } from "@v1/rollup/compute";

/**
 * Pure report-level aggregation for the CQI Institutional Report.
 *
 * NOTE: attainment math stays in python-server; this file only turns stored
 * `CloAttainment` / `PloAttainment` values into counts, means, medians and
 * traceable evidence strings. Never re-derive the 70/30 composite here.
 */

export const FLOOR_PCT = MIN_ATTAINMENT_PCT;
/** Minimum group size before a cohort/outcome may be named in the report. */
export const MIN_GROUP_SIZE = 10;

export type OutcomeType = "CLO" | "PLO" | "PEO";
export type OutcomeStatus = "MET" | "NOT MET" | "NOT AVAILABLE";

export type OutcomeRecordInput = {
	studentKey: string;
	directPct: number | null;
	indirectPct: number | null;
	compositePct: number | null;
	yearLevel: number | null;
	isComplete: boolean;
};

export type OutcomeInput = {
	key: string;
	outcomeType: OutcomeType;
	code: string;
	description: string;
	programCode: string;
	courseCode: string | null;
	targetPct: number | null;
	priorCycleCompositePct: number | null;
	derived?: boolean;
	records: OutcomeRecordInput[];
};

export type DistributionBucket = { band: string; count: number };

export type OutcomeRow = {
	key: string;
	outcomeType: OutcomeType;
	code: string;
	description: string;
	programCode: string;
	courseCode: string | null;
	targetPct: number | null;
	effectiveTargetPct: number;
	directPct: number | null;
	indirectPct: number | null;
	compositePct: number | null;
	medianPct: number | null;
	assessedCount: number;
	studentCount: number;
	meetingCount: number;
	belowCount: number;
	targetMetCount: number;
	attainmentPct: number | null;
	status: OutcomeStatus;
	priorCycleCompositePct: number | null;
	deltaPct: number | null;
	isComplete: boolean;
	derived: boolean;
	distribution: DistributionBucket[];
};

export type PerformanceStats = {
	enrolledCount: number;
	assessedCount: number;
	recordCount: number;
	meetingCount: number;
	belowCount: number;
	atRiskCount: number;
	meanPct: number | null;
	medianPct: number | null;
	attainmentPct: number | null;
	distribution: DistributionBucket[];
};

export type Finding = {
	outcomeKey: string;
	outcomeCode: string;
	outcomeType: OutcomeType;
	programCode: string;
	courseCode: string | null;
	statement: string;
	evidence: string;
	priority: "critical" | "high" | "medium" | "low";
};

export type PriorComparison = {
	outcomeKey: string;
	outcomeCode: string;
	outcomeType: OutcomeType;
	programCode: string;
	courseCode: string | null;
	priorPct: number | null;
	currentPct: number | null;
	deltaPct: number | null;
	direction: "up" | "down" | "flat" | "insufficient";
};

function finite(value: number | null | undefined): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function mean(values: number[]): number | null {
	if (values.length === 0) return null;
	return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return round2(
		sorted.length % 2 === 0
			? (sorted[middle - 1] + sorted[middle]) / 2
			: sorted[middle],
	);
}

/** Stable band counts, always emitted in the canonical order. */
export function distributionOf(values: number[]): DistributionBucket[] {
	const counts = new Map<string, number>();
	for (const band of SCORE_BANDS) counts.set(band, 0);
	for (const value of values) {
		const band = scoreBandOf(value);
		counts.set(band, (counts.get(band) ?? 0) + 1);
	}
	return SCORE_BANDS.map((band) => ({ band, count: counts.get(band) ?? 0 }));
}

/**
 * Aggregates one outcome's student records. Status uses the stricter of the
 * 70% floor and the F04 target; the counts split at the 70% floor.
 */
export function computeOutcome(input: OutcomeInput): OutcomeRow {
	const composites = input.records
		.map((record) => record.compositePct)
		.filter(finite);
	const direct = input.records
		.map((record) => record.directPct)
		.filter(finite);
	const indirect = input.records
		.map((record) => record.indirectPct)
		.filter(finite);
	const students = new Set(input.records.map((record) => record.studentKey));

	const compositePct = mean(composites);
	const effectiveTargetPct = Math.max(FLOOR_PCT, input.targetPct ?? FLOOR_PCT);
	const status: OutcomeStatus =
		compositePct === null
			? "NOT AVAILABLE"
			: compositePct >= effectiveTargetPct
				? "MET"
				: "NOT MET";

	return {
		key: input.key,
		outcomeType: input.outcomeType,
		code: input.code,
		description: input.description,
		programCode: input.programCode,
		courseCode: input.courseCode,
		targetPct: input.targetPct,
		effectiveTargetPct,
		directPct: mean(direct),
		indirectPct: mean(indirect),
		compositePct,
		medianPct: median(composites),
		assessedCount: input.records.length,
		studentCount: students.size,
		meetingCount: composites.filter((value) => value >= FLOOR_PCT).length,
		belowCount: composites.filter((value) => value < FLOOR_PCT).length,
		targetMetCount: composites.filter(
			(value) => value >= effectiveTargetPct,
		).length,
		attainmentPct: compositePct,
		status,
		priorCycleCompositePct: input.priorCycleCompositePct,
		deltaPct:
			compositePct !== null && input.priorCycleCompositePct !== null
				? round2(compositePct - input.priorCycleCompositePct)
				: null,
		isComplete:
			input.records.length > 0 &&
			input.records.every((record) => record.isComplete),
		derived: input.derived ?? false,
		distribution: distributionOf(composites),
	};
}

/**
 * Builds an outcome row from pre-aggregated values (used for PLO composites
 * stored in `PloAttainment`, where per-student rows are not persisted).
 * `values` only drive the distribution bands; they are never re-averaged.
 */
export function computeDerivedOutcome(input: {
	key: string;
	outcomeType: OutcomeType;
	code: string;
	description: string;
	programCode: string;
	courseCode: string | null;
	targetPct: number | null;
	compositePct: number | null;
	directPct: number | null;
	indirectPct: number | null;
	priorCycleCompositePct: number | null;
	values?: number[];
	studentCount?: number;
	assessedCount?: number;
}): OutcomeRow {
	const effectiveTargetPct = Math.max(FLOOR_PCT, input.targetPct ?? FLOOR_PCT);
	const values = input.values ?? [];
	const assessedCount = input.assessedCount ?? values.length;
	const compositePct = input.compositePct;
	const status: OutcomeStatus =
		compositePct === null
			? "NOT AVAILABLE"
			: compositePct >= effectiveTargetPct
				? "MET"
				: "NOT MET";

	return {
		key: input.key,
		outcomeType: input.outcomeType,
		code: input.code,
		description: input.description,
		programCode: input.programCode,
		courseCode: input.courseCode,
		targetPct: input.targetPct,
		effectiveTargetPct,
		directPct: input.directPct,
		indirectPct: input.indirectPct,
		compositePct,
		medianPct: median(values),
		assessedCount,
		studentCount: input.studentCount ?? assessedCount,
		meetingCount: values.filter((value) => value >= FLOOR_PCT).length,
		belowCount: values.filter((value) => value < FLOOR_PCT).length,
		targetMetCount: values.filter(
			(value) => value >= effectiveTargetPct,
		).length,
		attainmentPct: compositePct,
		status,
		priorCycleCompositePct: input.priorCycleCompositePct,
		deltaPct:
			compositePct !== null && input.priorCycleCompositePct !== null
				? round2(compositePct - input.priorCycleCompositePct)
				: null,
		isComplete: assessedCount > 0,
		derived: true,
		distribution: distributionOf(values),
	};
}

/** Institution-wide population statistics over student-CLO records. */
export function computePerformanceStats(
	records: { studentKey: string; compositePct: number | null }[],
	enrolledCount: number,
): PerformanceStats {
	const scored = records.filter(
		(record): record is { studentKey: string; compositePct: number } =>
			finite(record.compositePct),
	);
	const values = scored.map((record) => record.compositePct);
	const byStudent = new Map<string, number[]>();
	for (const record of scored) {
		const bucket = byStudent.get(record.studentKey) ?? [];
		bucket.push(record.compositePct);
		byStudent.set(record.studentKey, bucket);
	}
	const studentMeans = [...byStudent.values()]
		.map(mean)
		.filter(finite);

	return {
		enrolledCount,
		assessedCount: byStudent.size,
		recordCount: values.length,
		meetingCount: studentMeans.filter((value) => value >= FLOOR_PCT).length,
		belowCount: studentMeans.filter((value) => value < FLOOR_PCT).length,
		atRiskCount: studentMeans.filter((value) => value < FLOOR_PCT).length,
		meanPct: mean(values),
		medianPct: median(values),
		attainmentPct: mean(values),
		distribution: distributionOf(values),
	};
}

/** Traceable evidence string; every percentage carries its numerator/denominator. */
export function evidenceFor(row: OutcomeRow): string {
	const format = (value: number | null) =>
		value === null ? "not available" : `${value.toFixed(2)}%`;
	return [
		`mean composite ${format(row.compositePct)} across ${row.assessedCount} assessed record(s) / ${row.studentCount} student(s)`,
		`${row.meetingCount} of ${row.assessedCount} record(s) at or above the ${FLOOR_PCT}% floor`,
		`${row.targetMetCount} of ${row.assessedCount} at or above the ${row.effectiveTargetPct.toFixed(2)}% target`,
		`direct ${format(row.directPct)}, indirect ${format(row.indirectPct)}`,
	].join("; ");
}

function priorityOf(row: OutcomeRow): Finding["priority"] {
	if (row.compositePct === null) return "medium";
	if (row.compositePct < 60) return "critical";
	if (row.compositePct < FLOOR_PCT) return "high";
	if (row.compositePct < row.effectiveTargetPct) return "medium";
	return "low";
}

/**
 * Splits computed outcomes into strengths and weaknesses. Small groups are
 * excluded from named findings to avoid identifying a handful of students.
 */
export function computeFindings(rows: OutcomeRow[]): {
	strengths: Finding[];
	weaknesses: Finding[];
} {
	const eligible = rows.filter(
		(row) =>
			row.status !== "NOT AVAILABLE" &&
			row.studentCount >= MIN_GROUP_SIZE,
	);
	const toFinding = (row: OutcomeRow): Finding => ({
		outcomeKey: row.key,
		outcomeCode: row.code,
		outcomeType: row.outcomeType,
		programCode: row.programCode,
		courseCode: row.courseCode,
		statement:
			row.status === "MET"
				? `${row.code} met its target (${row.compositePct?.toFixed(2)}%).`
				: `${row.code} fell below its target (${row.compositePct?.toFixed(2)}% vs ${row.effectiveTargetPct.toFixed(2)}%).`,
		evidence: evidenceFor(row),
		priority: priorityOf(row),
	});

	return {
		strengths: eligible
			.filter((row) => row.status === "MET")
			.sort((a, b) => (b.compositePct ?? 0) - (a.compositePct ?? 0))
			.slice(0, 5)
			.map(toFinding),
		weaknesses: eligible
			.filter((row) => row.status === "NOT MET")
			.sort((a, b) => (a.compositePct ?? 0) - (b.compositePct ?? 0))
			.slice(0, 5)
			.map(toFinding),
	};
}

/** Prior-versus-current comparison on the same outcome key. */
export function comparePrior(
	current: OutcomeRow[],
	priorByKey: Map<string, number | null>,
): PriorComparison[] {
	return current.map((row) => {
		const priorPct = priorByKey.get(row.key) ?? null;
		const currentPct = row.compositePct;
		const deltaPct =
			currentPct !== null && priorPct !== null
				? round2(currentPct - priorPct)
				: null;
		return {
			outcomeKey: row.key,
			outcomeCode: row.code,
			outcomeType: row.outcomeType,
			programCode: row.programCode,
			courseCode: row.courseCode,
			priorPct,
			currentPct,
			deltaPct,
			direction:
				deltaPct === null
					? "insufficient"
					: deltaPct > 0
						? "up"
						: deltaPct < 0
							? "down"
							: "flat",
		};
	});
}

export type CqiEffectivenessInput = {
	entryId: string;
	outcomeCode: string;
	programCode: string;
	priorAttainmentPct: number | null;
	currentAttainmentPct: number | null;
	implementationStatus: "yes" | "partial" | "no" | null;
	loopStatus: "CLOSED" | "OPEN_REASSESS" | "OPEN_NOT_IMPLEMENTED" | null;
	intervention: string;
	ownerRole: string;
	rootCauseCategory: string | null;
	timelineAndKpi: string;
	isEscalated: boolean;
};

export type CqiEffectivenessRow = CqiEffectivenessInput & {
	deltaPct: number | null;
	kpiStatus: "not_machine_verifiable";
};

export type NextCyclePriorities = {
	previouslyMetDeclining: string[];
	openLoops: {
		closed: number;
		openReassess: number;
		openNotImplemented: number;
	};
	escalatedOutcomes: string[];
	interventionCompletion: {
		implemented: number;
		partial: number;
		notImplemented: number;
		ratePct: number | null;
	};
	priorities: Finding[];
};

/**
 * Builds the previous-CQI section. KPI achievement is deliberately not
 * evaluated: `timelineAndKpi` is a single free-text field, not a target.
 */
export function computeCqiEffectiveness(
	entries: CqiEffectivenessInput[],
): CqiEffectivenessRow[] {
	return entries.map((entry) => ({
		...entry,
		deltaPct:
			entry.priorAttainmentPct !== null && entry.currentAttainmentPct !== null
				? round2(entry.currentAttainmentPct - entry.priorAttainmentPct)
				: null,
		kpiStatus: "not_machine_verifiable",
	}));
}

export function computeNextCyclePriorities(
	comparisons: PriorComparison[],
	entries: CqiEffectivenessRow[],
	findings: { weaknesses: Finding[] },
): NextCyclePriorities {
	const openLoops = { closed: 0, openReassess: 0, openNotImplemented: 0 };
	const completion = { implemented: 0, partial: 0, notImplemented: 0 };
	for (const entry of entries) {
		if (entry.loopStatus === "CLOSED") openLoops.closed += 1;
		else if (entry.loopStatus === "OPEN_NOT_IMPLEMENTED")
			openLoops.openNotImplemented += 1;
		else openLoops.openReassess += 1;

		if (entry.implementationStatus === "yes") completion.implemented += 1;
		else if (entry.implementationStatus === "partial") completion.partial += 1;
		else completion.notImplemented += 1;
	}
	const tracked = entries.length;
	const ratePct =
		tracked === 0
			? null
			: round2(
					((completion.implemented + completion.partial * 0.5) / tracked) *
						100,
				);

	return {
		previouslyMetDeclining: comparisons
			.filter(
				(comparison) =>
					comparison.priorPct !== null &&
					comparison.priorPct >= FLOOR_PCT &&
					comparison.currentPct !== null &&
					comparison.currentPct < FLOOR_PCT,
			)
			.map((comparison) => comparison.outcomeCode),
		openLoops,
		escalatedOutcomes: entries
			.filter((entry) => entry.isEscalated)
			.map((entry) => entry.outcomeCode),
		interventionCompletion: {
			...completion,
			ratePct,
		},
		priorities: findings.weaknesses
			.filter((finding) => finding.priority !== "low")
			.slice(0, 5),
	};
}
