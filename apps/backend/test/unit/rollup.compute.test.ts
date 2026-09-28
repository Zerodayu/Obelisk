import { describe, expect, it } from "bun:test";
import {
	attainmentStatus,
	buildCohortLines,
	type CohortEntryInput,
	cohortCqiTriggered,
	cohortMeanPct,
	trendBetween,
} from "@v1/rollup/compute";

function row(cloCode: string, attainmentPct: number): CohortEntryInput {
	return {
		yearLevel: 1,
		termId: "t",
		schoolYear: "2025",
		semester: "1",
		row: {
			cloCode,
			cloDescription: `Description of ${cloCode}`,
			attainmentPct,
			status: attainmentStatus(attainmentPct),
		},
	};
}

describe("cohortMeanPct", () => {
	it("returns the rounded mean of row attainments", () => {
		expect(cohortMeanPct([row("CLO1", 80).row, row("CLO2", 90).row])).toBe(85);
		expect(cohortMeanPct([row("CLO1", 1.111).row])).toBe(1.11);
	});

	it("returns null when there are no rows", () => {
		expect(cohortMeanPct([])).toBeNull();
	});
});

describe("trendBetween", () => {
	it("derives the direction between the prior and latest term averages", () => {
		expect(trendBetween(75, 85)).toBe("UP");
		expect(trendBetween(85, 75)).toBe("DOWN");
		expect(trendBetween(80, 80)).toBe("FLAT");
	});

	it("is FLAT when either average is missing", () => {
		expect(trendBetween(null, 80)).toBe("FLAT");
		expect(trendBetween(80, null)).toBe("FLAT");
		expect(trendBetween(null, null)).toBe("FLAT");
	});
});

describe("attainmentStatus", () => {
	it("flags below the 70% floor", () => {
		expect(attainmentStatus(69.99)).toBe("NOT MET");
		expect(attainmentStatus(70)).toBe("MET");
		expect(attainmentStatus(100)).toBe("MET");
	});
});

describe("cohortCqiTriggered", () => {
	it("triggers CQI when any row misses the floor", () => {
		expect(cohortCqiTriggered([row("CLO1", 60).row, row("CLO2", 85).row])).toBe(
			true,
		);
		expect(cohortCqiTriggered([row("CLO1", 85).row, row("CLO2", 90).row])).toBe(
			false,
		);
		expect(cohortCqiTriggered([])).toBe(false);
	});
});

describe("buildCohortLines", () => {
	function entry(
		yearLevel: number | null,
		termId: string,
		schoolYear: string,
		semester: string,
		rows: { cloCode: string; attainmentPct: number }[],
	): CohortEntryInput[] {
		return rows.map((r) => ({
			yearLevel,
			termId,
			schoolYear,
			semester,
			row: {
				cloCode: r.cloCode,
				cloDescription: `Description of ${r.cloCode}`,
				attainmentPct: r.attainmentPct,
				status: attainmentStatus(r.attainmentPct),
			},
		}));
	}

	it("groups entries by year level and orders terms chronologically", () => {
		const lines = buildCohortLines([
			...entry(1, "t2", "SY 2025", "2nd", [
				{ cloCode: "CLO2", attainmentPct: 90 },
				{ cloCode: "CLO1", attainmentPct: 80 },
			]),
			...entry(1, "t1", "SY 2025", "1st", [
				{ cloCode: "CLO1", attainmentPct: 70 },
			]),
			...entry(2, "t1", "SY 2025", "1st", [
				{ cloCode: "CLO1", attainmentPct: 88 },
			]),
		]);

		expect(lines).toHaveLength(2);
		const yearOne = lines.find((l) => l.yearLevel === 1);
		expect(yearOne?.terms.map((t) => t.termId)).toEqual(["t1", "t2"]);
		expect(yearOne?.terms[0].rows.map((r) => r.cloCode)).toEqual(["CLO1"]);
		expect(yearOne?.terms[1].rows.map((r) => r.cloCode)).toEqual([
			"CLO1",
			"CLO2",
		]);
	});

	it("computes per-term averages and a line trend across the last two terms", () => {
		const lines = buildCohortLines([
			...entry(1, "t1", "SY 2025", "1st", [
				{ cloCode: "CLO1", attainmentPct: 70 },
				{ cloCode: "CLO2", attainmentPct: 80 },
			]),
			...entry(1, "t2", "SY 2025", "2nd", [
				{ cloCode: "CLO1", attainmentPct: 90 },
				{ cloCode: "CLO2", attainmentPct: 100 },
			]),
		]);

		const line = lines[0];
		expect(line.terms[0].averagePct).toBe(75);
		expect(line.terms[1].averagePct).toBe(95);
		expect(line.trend).toBe("UP");
	});

	it("flags CQI when the latest term has a missed CLO, trend flat when a single term", () => {
		const lines = buildCohortLines([
			...entry(1, "t1", "SY 2025", "1st", [
				{ cloCode: "CLO1", attainmentPct: 55 },
				{ cloCode: "CLO2", attainmentPct: 85 },
			]),
		]);
		expect(lines[0].trend).toBe("FLAT");
		expect(lines[0].cqiTriggered).toBe(true);
	});

	it("sorts null year levels first and collapses them like any cohort", () => {
		const lines = buildCohortLines([
			...entry(2, "t1", "SY 2025", "1st", [
				{ cloCode: "CLO1", attainmentPct: 88 },
			]),
			...entry(null, "t1", "SY 2025", "1st", [
				{ cloCode: "CLO1", attainmentPct: 90 },
			]),
		]);
		expect(lines[0].yearLevel).toBeNull();
		expect(lines[1].yearLevel).toBe(2);
	});
});
