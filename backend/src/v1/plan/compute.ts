import { MIN_ATTAINMENT_PCT } from "@lib/validators/attainment";

/**
 * Pure computation helpers for the PLAN-phase setup forms:
 * - curriculum_map Coverage Check row
 * - target_setting_matrix Program PLO Avg row + >=70% hard floor enforcement
 * - assessment_budget TOTAL row
 */

export class TargetBelowFloorError extends Error {
	constructor(ploCode: string, value: number) {
		super(
			`Target ${value}% for '${ploCode}' is below the ${MIN_ATTAINMENT_PCT}% institutional hard floor.`,
		);
		this.name = "TargetBelowFloorError";
	}
}

export class MissingRationaleError extends Error {
	constructor(ploCode: string) {
		super(
			`'${ploCode}' has at least one target above the ${MIN_ATTAINMENT_PCT}% floor; a rationale is required.`,
		);
		this.name = "MissingRationaleError";
	}
}

export type CurriculumCellLike = {
	ploCode: string;
	stage: string | null | undefined;
};

export type CurriculumCourseLike = {
	cells: CurriculumCellLike[];
};

/**
 * curriculum_map Section C Coverage Check row: a PLO column is covered when at
 * least one mapped cell carries an I-P-D stage of D.
 */
export function coverageCheck(
	courses: CurriculumCourseLike[],
): Record<string, boolean> {
	const covered: Record<string, boolean> = {};
	for (const course of courses) {
		for (const cell of course.cells) {
			if (cell.stage === "d") {
				covered[cell.ploCode] = true;
			} else if (!(cell.ploCode in covered)) {
				covered[cell.ploCode] = false;
			}
		}
	}
	return covered;
}

export type PloTargetLike = {
	ploCode: string;
	targets: number[];
};

/**
 * target_setting_matrix bottom row: Program PLO Avg per year-level column,
 * averaged across all PLO rows and rounded to 2 decimal places.
 */
export function programPloAverages(rows: PloTargetLike[]): number[] {
	if (rows.length === 0) return [];
	const yearCount = Math.max(...rows.map((r) => r.targets.length));
	const averages: number[] = [];
	for (let year = 0; year < yearCount; year++) {
		let sum = 0;
		for (const row of rows) sum += row.targets[year] ?? 0;
		averages.push(round2(sum / rows.length));
	}
	return averages;
}

export function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

/**
 * Enforces the >=70% hard floor on every PLO target and the
 * "rationale required above floor" rule (rationale justifies exceeding 70%).
 */
export function assertPloTargetsValid(
	row: PloTargetLike & { rationale?: string | null },
): void {
	for (const target of row.targets) {
		if (target < MIN_ATTAINMENT_PCT) {
			throw new TargetBelowFloorError(row.ploCode, target);
		}
	}
	const aboveFloor = row.targets.some((t) => t > MIN_ATTAINMENT_PCT);
	if (aboveFloor && !row.rationale?.trim()) {
		throw new MissingRationaleError(row.ploCode);
	}
}

export type BudgetLineLike = {
	estimatedCost: number | null;
	approvedCost: number | null;
};

export type BudgetTotals = {
	estimatedTotal: number;
	approvedTotal: number;
};

/** assessment_budget TOTAL row: sums both cost columns across all line items. */
export function budgetTotals(lines: BudgetLineLike[]): BudgetTotals {
	let estimatedTotal = 0;
	let approvedTotal = 0;
	for (const line of lines) {
		estimatedTotal += line.estimatedCost ?? 0;
		approvedTotal += line.approvedCost ?? 0;
	}
	return {
		estimatedTotal: round2(estimatedTotal),
		approvedTotal: round2(approvedTotal),
	};
}
