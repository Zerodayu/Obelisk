import { describe, expect, it } from "bun:test";
import {
	type CohortAttainmentInput,
	computeCohortAttainment,
	computeDashboardStatus,
	computeGapCandidates,
	computeLoopStatus,
	ploStatus,
} from "@v1/cqi/compute";

const PLO: CohortAttainmentInput["ploId"] = "plo-1";

function row(
	overrides: Partial<CohortAttainmentInput> = {},
): CohortAttainmentInput {
	return {
		ploId: PLO,
		ploCode: "PLO1",
		ploDescription: "Apply engineering fundamentals",
		yearLevel: 1,
		compositeScorePct: 85,
		...overrides,
	};
}

describe("computeCohortAttainment", () => {
	it("averages composites per PLO cohort and sorts cohorts null-last", () => {
		const summaries = computeCohortAttainment([
			row({ yearLevel: 2, compositeScorePct: 90 }),
			row({ yearLevel: 2, compositeScorePct: 70 }),
			row({ yearLevel: 1, compositeScorePct: 80 }),
			row({ yearLevel: null, compositeScorePct: 75 }),
		]);
		expect(summaries).toHaveLength(1);
		const [plo] = summaries;
		expect(plo.cohorts.map((c) => c.cohortYearLevel)).toEqual([1, 2, null]);
		expect(plo.cohorts[0].attainmentPct).toBe(80);
		expect(plo.cohorts[1].attainmentPct).toBe(80);
		expect(plo.cohorts[2].attainmentPct).toBe(75);
	});

	it("computes the program average from the cohort means", () => {
		const [plo] = computeCohortAttainment([
			row({ yearLevel: 1, compositeScorePct: 80 }),
			row({ yearLevel: 2, compositeScorePct: 90 }),
		]);
		expect(plo.programAvgPct).toBe(85);
	});

	it("sorts PLO summaries by code", () => {
		const summaries = computeCohortAttainment([
			row({ ploId: "b", ploCode: "PLO2", compositeScorePct: 80 }),
			row({ ploId: "a", ploCode: "PLO1", compositeScorePct: 80 }),
		]);
		expect(summaries.map((s) => s.ploCode)).toEqual(["PLO1", "PLO2"]);
	});

	it("drops students with no composite instead of fabricating a 0 cohort", () => {
		const summaries = computeCohortAttainment([
			row({ compositeScorePct: null }),
		]);
		expect(summaries).toHaveLength(1);
		expect(summaries[0].cohorts).toHaveLength(0);
		expect(summaries[0].programAvgPct).toBeNull();
	});
});

describe("ploStatus", () => {
	it("is all_met when every cohort clears the 70% floor", () => {
		expect(
			ploStatus([
				{ cohortYearLevel: 1, attainmentPct: 82 },
				{ cohortYearLevel: 2, attainmentPct: 71 },
			]),
		).toBe("all_met");
	});

	it("is not_met when no cohort clears the floor", () => {
		expect(
			ploStatus([
				{ cohortYearLevel: 1, attainmentPct: 69.9 },
				{ cohortYearLevel: 2, attainmentPct: 55 },
			]),
		).toBe("not_met");
	});

	it("is partial for a mix of met and not-met cohorts", () => {
		expect(
			ploStatus([
				{ cohortYearLevel: 1, attainmentPct: 82 },
				{ cohortYearLevel: 2, attainmentPct: 65 },
			]),
		).toBe("partial");
	});

	it("is not_met with no observed cohorts", () => {
		expect(ploStatus([])).toBe("not_met");
	});

	it("uses < 70 as the boundary in both directions", () => {
		expect(
			ploStatus([
				{ cohortYearLevel: 1, attainmentPct: 70 },
				{ cohortYearLevel: 2, attainmentPct: 69.99 },
			]),
		).toBe("partial");
	});
});

describe("computeGapCandidates", () => {
	it("emits exactly one candidate per NOT-MET PLO-cohort combo", () => {
		const candidates = computeGapCandidates([
			row({ yearLevel: 1, compositeScorePct: 85 }),
			row({ yearLevel: 2, compositeScorePct: 64 }),
			row({ yearLevel: 3, compositeScorePct: 55 }),
			row({ yearLevel: 4, compositeScorePct: 72 }),
		]);
		expect(candidates).toHaveLength(2);
		expect(candidates.map((c) => c.cohortYearLevel)).toEqual([2, 3]);
		expect(candidates.every((c) => c.attainmentPct < 70)).toBe(true);
	});

	it("carries the PLO identity onto each candidate", () => {
		const [candidate] = computeGapCandidates([
			row({ ploCode: "PLO2", compositeScorePct: 50 }),
		]);
		expect(candidate).toMatchObject({
			ploId: PLO,
			ploCode: "PLO2",
			cohortYearLevel: 1,
			attainmentPct: 50,
		});
	});

	it("emits no candidate when every cohort clears the floor", () => {
		expect(
			computeGapCandidates([
				row({ compositeScorePct: 80 }),
				row({ compositeScorePct: 75 }),
			]),
		).toEqual([]);
	});
});

describe("computeLoopStatus", () => {
	it("is closed only when all five conditions are met", () => {
		expect(
			computeLoopStatus({
				conditions12Met: true,
				condition3Met: true,
				condition4Met: true,
				condition5Met: true,
			}),
		).toBe("closed");
	});

	it("stays open when any single condition is unmet", () => {
		expect(
			computeLoopStatus({
				conditions12Met: true,
				condition3Met: true,
				condition4Met: true,
				condition5Met: false,
			}),
		).not.toBe("closed");
	});

	it("is open_not_implemented when the intervention was not implemented", () => {
		expect(
			computeLoopStatus({
				conditions12Met: false,
				condition3Met: false,
				condition4Met: false,
				condition5Met: false,
				interventionImplemented: "no",
				interventionImplementedText: "dropped due to budget",
			}),
		).toBe("open_not_implemented");
	});

	it("is open_not_implemented when no intervention description exists", () => {
		expect(
			computeLoopStatus({
				conditions12Met: false,
				condition3Met: false,
				condition4Met: false,
				condition5Met: false,
				interventionImplemented: "partial",
				interventionImplementedText: "  ",
			}),
		).toBe("open_not_implemented");
	});

	it("is open_reassess when implemented but conditions not fully met", () => {
		expect(
			computeLoopStatus({
				conditions12Met: true,
				condition3Met: true,
				condition4Met: true,
				condition5Met: false,
				interventionImplemented: "yes",
				interventionImplementedText: "revised the lab manual",
			}),
		).toBe("open_reassess");
	});
});

describe("computeDashboardStatus", () => {
	it("marks MET / NOT MET against the 70% benchmark", () => {
		expect(computeDashboardStatus(70)).toBe("MET");
		expect(computeDashboardStatus(69.99)).toBe("NOT MET");
		expect(computeDashboardStatus(100)).toBe("MET");
	});

	it("is null for missing values", () => {
		expect(computeDashboardStatus(null)).toBeNull();
		expect(computeDashboardStatus(undefined)).toBeNull();
		expect(computeDashboardStatus(Number.NaN)).toBeNull();
	});
});
