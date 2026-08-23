import { describe, expect, it } from "bun:test";
import {
	assertPloTargetsValid,
	budgetTotals,
	coverageCheck,
	MissingRationaleError,
	programPloAverages,
	TargetBelowFloorError,
} from "@v1/plan/compute";

describe("coverageCheck", () => {
	it("marks a PLO covered only when at least one cell has stage D", () => {
		const covered = coverageCheck([
			{
				cells: [
					{ ploCode: "PLO1", stage: "i" },
					{ ploCode: "PLO2", stage: "d" },
				],
			},
			{
				cells: [
					{ ploCode: "PLO1", stage: "p" },
					{ ploCode: "PLO2", stage: null },
				],
			},
			{ cells: [{ ploCode: "PLO3", stage: undefined }] },
		]);
		expect(covered).toEqual({
			PLO1: false,
			PLO2: true,
			PLO3: false,
		});
	});

	it("keeps coverage true once any course reaches stage D", () => {
		const covered = coverageCheck([
			{ cells: [{ ploCode: "PLO1", stage: "d" }] },
			{ cells: [{ ploCode: "PLO1", stage: "i" }] },
		]);
		expect(covered.PLO1).toBe(true);
	});

	it("returns an empty map with no courses", () => {
		expect(coverageCheck([])).toEqual({});
	});
});

describe("programPloAverages", () => {
	it("averages each year-level column across PLO rows", () => {
		const averages = programPloAverages([
			{ ploCode: "PLO1", targets: [70, 75, 80, 85] },
			{ ploCode: "PLO2", targets: [72, 77, 82, 87] },
		]);
		expect(averages).toEqual([71, 76, 81, 86]);
	});

	it("rounds to 2 decimal places and treats missing cells as zero", () => {
		const averages = programPloAverages([
			{ ploCode: "PLO1", targets: [70, 71] },
			{ ploCode: "PLO2", targets: [71, 70] },
			{ ploCode: "PLO3", targets: [71.5] },
		]);
		expect(averages).toEqual([70.83, 47]);
	});

	it("returns no averages without rows", () => {
		expect(programPloAverages([])).toEqual([]);
	});
});

describe("assertPloTargetsValid", () => {
	it("accepts targets at exactly the 70% floor", () => {
		expect(() =>
			assertPloTargetsValid({
				ploCode: "PLO1",
				targets: [70, 70, 70, 70],
			}),
		).not.toThrow();
	});

	it("rejects targets below the 70% hard floor", () => {
		try {
			assertPloTargetsValid({ ploCode: "PLO1", targets: [70, 69.5, 70, 70] });
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(TargetBelowFloorError);
			expect((error as Error).message).toContain("69.5");
			expect((error as Error).message).toContain("PLO1");
		}
	});

	it("requires a rationale when a target exceeds the floor", () => {
		try {
			assertPloTargetsValid({ ploCode: "PLO1", targets: [70, 75, 70, 70] });
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(MissingRationaleError);
		}
	});

	it("treats whitespace-only rationale as missing", () => {
		expect(() =>
			assertPloTargetsValid({
				ploCode: "PLO1",
				targets: [80, 70, 70, 70],
				rationale: "   ",
			}),
		).toThrow(MissingRationaleError);
	});

	it("passes above-floor targets backed by a rationale", () => {
		expect(() =>
			assertPloTargetsValid({
				ploCode: "PLO1",
				targets: [80, 70, 70, 70],
				rationale: "Strong cohort history",
			}),
		).not.toThrow();
	});
});

describe("budgetTotals", () => {
	it("sums estimated and approved costs across line items", () => {
		const totals = budgetTotals([
			{ estimatedCost: 10000, approvedCost: 9000 },
			{ estimatedCost: 5000.5, approvedCost: null },
			{ estimatedCost: null, approvedCost: 1000.25 },
		]);
		expect(totals).toEqual({
			estimatedTotal: 15000.5,
			approvedTotal: 10000.25,
		});
	});

	it("returns zeros for an empty breakdown", () => {
		expect(budgetTotals([])).toEqual({
			estimatedTotal: 0,
			approvedTotal: 0,
		});
	});
});
