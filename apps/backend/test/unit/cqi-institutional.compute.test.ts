import { describe, expect, it } from "bun:test";

import {
	computeCqiEffectiveness,
	computeFindings,
	computeNextCyclePriorities,
	computeOutcome,
	computePerformanceStats,
	comparePrior,
	dedupeCqiEntries,
} from "@v1/reports/cqi-institutional.compute";

function record(
	studentKey: string,
	compositePct: number | null,
	overrides: Partial<{
		directPct: number | null;
		indirectPct: number | null;
		yearLevel: number | null;
		isComplete: boolean;
	}> = {},
) {
	return {
		studentKey,
		directPct: compositePct,
		indirectPct: compositePct,
		compositePct,
		yearLevel: 1,
		isComplete: true,
		...overrides,
	};
}

describe("computeOutcome", () => {
	it("applies the stricter F04 target while counting the 70% floor", () => {
		const outcome = computeOutcome({
			key: "BSIT/IT101/CLO1",
			outcomeType: "CLO",
			code: "IT101/CLO1",
			description: "Explain fundamentals",
			programCode: "BSIT",
			courseCode: "IT101",
			targetPct: 75,
			priorCycleCompositePct: 68,
			records: [record("s1", 80), record("s2", 72), record("s3", 64)],
		});

		expect(outcome.compositePct).toBe(72);
		expect(outcome.effectiveTargetPct).toBe(75);
		expect(outcome.status).toBe("NOT MET");
		expect(outcome.meetingCount).toBe(2);
		expect(outcome.belowCount).toBe(1);
		expect(outcome.targetMetCount).toBe(1);
		expect(outcome.deltaPct).toBe(4);
	});

	it("returns NOT AVAILABLE instead of fabricating a zero", () => {
		const outcome = computeOutcome({
			key: "BSIT/IT101/CLO2",
			outcomeType: "CLO",
			code: "IT101/CLO2",
			description: "No data",
			programCode: "BSIT",
			courseCode: "IT101",
			targetPct: null,
			priorCycleCompositePct: null,
			records: [record("s1", null)],
		});
		expect(outcome.compositePct).toBeNull();
		expect(outcome.status).toBe("NOT AVAILABLE");
	});
});

describe("computePerformanceStats", () => {
	it("counts distinct students, not records", () => {
		const stats = computePerformanceStats(
			[
				{ studentKey: "s1", compositePct: 90 },
				{ studentKey: "s1", compositePct: 80 },
				{ studentKey: "s2", compositePct: 60 },
			],
			10,
		);
		expect(stats.assessedCount).toBe(2);
		expect(stats.recordCount).toBe(3);
		expect(stats.meetingCount).toBe(1);
		expect(stats.belowCount).toBe(1);
		expect(stats.attainmentPct).toBe(76.67);
	});
});

describe("computeFindings", () => {
	it("excludes groups smaller than the minimum report size", () => {
		const small = computeOutcome({
			key: "BSIT/IT101/CLO1",
			outcomeType: "CLO",
			code: "IT101/CLO1",
			description: "Small",
			programCode: "BSIT",
			courseCode: "IT101",
			targetPct: 70,
			priorCycleCompositePct: null,
			records: Array.from({ length: 5 }, (_, index) => record(`s${index}`, 90)),
		});
		const findings = computeFindings([small]);
		expect(findings.strengths).toHaveLength(0);
	});
});

describe("comparePrior", () => {
	it("marks missing prior data as insufficient", () => {
		const current = computeOutcome({
			key: "BSIT/IT101/CLO1",
			outcomeType: "CLO",
			code: "IT101/CLO1",
			description: "Current",
			programCode: "BSIT",
			courseCode: "IT101",
			targetPct: 70,
			priorCycleCompositePct: null,
			records: [record("s1", 80)],
		});
		const [comparison] = comparePrior(current ? [current] : [], new Map());
		expect(comparison.direction).toBe("insufficient");
	});
});

describe("previous CQI effectiveness", () => {
	it("computes deltas and never claims KPI verification", () => {
		const rows = computeCqiEffectiveness([
			{
				entryId: "e1",
				outcomeCode: "BSIT/PLO1",
				programCode: "BSIT",
				priorAttainmentPct: 65,
				currentAttainmentPct: 72,
				implementationStatus: "yes",
				loopStatus: "CLOSED",
				intervention: "Clinic",
				ownerRole: "Program Chair",
				rootCauseCategory: "2-Instruction & Pedagogy",
				timelineAndKpi: "Within 4 weeks; reach 70%",
				isEscalated: false,
			},
		]);
		expect(rows[0].deltaPct).toBe(7);
		expect(rows[0].kpiStatus).toBe("not_machine_verifiable");

		const priorities = computeNextCyclePriorities([], rows, {
			weaknesses: [],
		});
		expect(priorities.openLoops.closed).toBe(1);
		expect(priorities.interventionCompletion.ratePct).toBe(100);
	});
});

describe("dedupeCqiEntries", () => {
	const input = (
		outcomeCode: string,
		implementationStatus: "yes" | "partial" | "no" | null,
		loopStatus: "CLOSED" | "OPEN_REASSESS" | "OPEN_NOT_IMPLEMENTED" | null,
		entryId: string,
	) => ({
		entryId,
		outcomeCode,
		programCode: "BSIT",
		priorAttainmentPct: 65,
		currentAttainmentPct: 72,
		outcomeStatus: "MET" as const,
		implementationStatus,
		loopStatus,
		intervention: "Clinic",
		ownerRole: "Program Chair",
		rootCauseCategory: "2-Instruction & Pedagogy",
		timelineAndKpi: "Within 4 weeks; reach 70%",
		isEscalated: false,
	});

	it("collapses cohort rows into one row per outcome, keeping the worst status", () => {
		const rows = computeCqiEffectiveness([
			input("BSIT/PLO3", "yes", "CLOSED", "a"),
			input("BSIT/PLO3", "no", "OPEN_NOT_IMPLEMENTED", "b"),
			input("BSIT/PLO3", null, null, "c"),
		]);
		const result = dedupeCqiEntries(rows);
		expect(result).toHaveLength(1);
		expect(result[0].implementationStatus).toBe("no");
		expect(result[0].loopStatus).toBe("OPEN_NOT_IMPLEMENTED");
	});

	it("keeps a filled row over a blank one for the same outcome", () => {
		const rows = computeCqiEffectiveness([
			input("BSIT/PLO1", null, null, "a"),
			input("BSIT/PLO1", "partial", "OPEN_REASSESS", "b"),
		]);
		const result = dedupeCqiEntries(rows);
		expect(result).toHaveLength(1);
		expect(result[0].implementationStatus).toBe("partial");
		expect(result[0].loopStatus).toBe("OPEN_REASSESS");
	});
});
