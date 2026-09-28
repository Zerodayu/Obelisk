import { describe, expect, it } from "bun:test";
import {
	aggregateClo,
	CLO_LEVEL_BASIC_MIN,
	CLO_LEVEL_EXCEPTIONAL_MIN,
	CLO_LEVEL_PROFICIENT_MIN,
	categoryMeans,
	cloLevel,
	groupByCohort,
	meanPct,
} from "@v1/car/compute";

describe("meanPct", () => {
	it("returns the rounded mean of non-null values", () => {
		expect(meanPct([80, 90, 100])).toBe(90);
		expect(meanPct([1.111, 2.222])).toBe(1.67);
	});

	it("ignores nulls and empty entries", () => {
		expect(meanPct([null, undefined, 40])).toBe(40);
	});

	it("returns null when no non-null values exist", () => {
		expect(meanPct([])).toBeNull();
		expect(meanPct([null, null])).toBeNull();
	});
});

describe("cloLevel", () => {
	it("uses the 4-tier boundary constants", () => {
		expect(CLO_LEVEL_EXCEPTIONAL_MIN).toBe(85);
		expect(CLO_LEVEL_PROFICIENT_MIN).toBe(70);
		expect(CLO_LEVEL_BASIC_MIN).toBe(60);
	});

	it("classifies each band inclusively", () => {
		expect(cloLevel(85)).toBe("Exceptional");
		expect(cloLevel(100)).toBe("Exceptional");
		expect(cloLevel(84.99)).toBe("Proficient");
		expect(cloLevel(70)).toBe("Proficient");
		expect(cloLevel(69.99)).toBe("Basic");
		expect(cloLevel(60)).toBe("Basic");
		expect(cloLevel(59.99)).toBe("Below Basic");
	});
});

describe("categoryMeans", () => {
	it("averages each assessment category across rows", () => {
		const means = categoryMeans([
			{ examPct: 80, atPct: null, tlaPct: 60, outputPct: 90 },
			{ examPct: 90, atPct: 70, tlaPct: null, outputPct: 80 },
		]);
		expect(means.examPct).toBe(85);
		expect(means.atPct).toBe(70);
		expect(means.tlaPct).toBe(60);
		expect(means.outputPct).toBe(85);
	});

	it("returns null for wholly absent categories", () => {
		const means = categoryMeans([{ examPct: null }, { examPct: null }]);
		expect(means.examPct).toBeNull();
		expect(means.outputPct).toBeNull();
	});
});

describe("aggregateClo", () => {
	const rows = [
		{
			compositeScorePct: 75,
			examPct: 90,
			atPct: 60,
			tlaPct: null,
			outputPct: null,
		},
		{
			compositeScorePct: 65,
			examPct: 80,
			atPct: 70,
			tlaPct: null,
			outputPct: null,
		},
	];

	it("computes category means and a composite weighted average", () => {
		const agg = aggregateClo(rows);
		expect(agg.examPct).toBe(85);
		expect(agg.atPct).toBe(65);
		expect(agg.tlaPct).toBeNull();
		expect(agg.outputPct).toBeNull();
		expect(agg.weightedAvgPct).toBe(70);
		expect(agg.count).toBe(2);
	});

	it("flags below-benchmark when the mean composite < 70", () => {
		expect(aggregateClo(rows).belowBenchmark).toBe(false);
		expect(
			aggregateClo([{ compositeScorePct: 69.99 }, { compositeScorePct: 65 }])
				.belowBenchmark,
		).toBe(true);
	});

	it("treats all-null composite as 0 and below-benchmark", () => {
		expect(aggregateClo([{ compositeScorePct: null }])).toMatchObject({
			weightedAvgPct: 0,
			belowBenchmark: true,
		});
	});
});

describe("groupByCohort", () => {
	it("groups rows by year level, collapsing nulls into one bucket", () => {
		const rows = [
			{ yearLevel: 1 },
			{ yearLevel: 1 },
			{ yearLevel: 2 },
			{ yearLevel: null },
			{ yearLevel: null },
		];
		const groups = groupByCohort(rows, (r) => r.yearLevel ?? null);
		expect(groups.get(1)).toHaveLength(2);
		expect(groups.get(2)).toHaveLength(1);
		expect(groups.get(null)).toHaveLength(2);
	});
});
