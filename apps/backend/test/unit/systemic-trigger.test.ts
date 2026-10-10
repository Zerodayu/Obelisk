import { describe, expect, it } from "bun:test";
import {
	type CohortPloSnapshot,
	findSystemicTriggers,
	SYSTEMIC_TRIGGER_CYCLES,
} from "@lib/forms/systemic-trigger";

/** One cycle's rows for the given achieved/not-met pattern, newest first. */
function cycle(
	year: string,
	rows: Array<[ploCode: string, achieved: boolean]>,
): CohortPloSnapshot {
	return { cycle: year, plos: rows.map(([ploCode, achieved]) => ({ ploCode, achieved })) };
}

describe("findSystemicTriggers", () => {
	it("requires 3 consecutive NOT-MET cycles (the manual's trigger)", () => {
		expect(SYSTEMIC_TRIGGER_CYCLES).toBe(3);

		// 2026-27 (newest) → 2024-25, PLO1 never meets benchmark.
		const report = findSystemicTriggers([
			cycle("2026-2027", [["PLO1", false]]),
			cycle("2025-2026", [["PLO1", false]]),
			cycle("2024-2025", [["PLO1", false]]),
		]);
		expect(report).toEqual({
			cycles: 3,
			maxRun: 3,
			ploCodes: ["PLO1"],
		});
	});

	it("does not trigger when a cycle in the middle recovered", () => {
		const report = findSystemicTriggers([
			cycle("2026-2027", [["PLO1", false]]),
			cycle("2025-2026", [["PLO1", true]]),
			cycle("2024-2025", [["PLO1", false]]),
		]);
		expect(report.ploCodes).toEqual([]);
		expect(report.maxRun).toBe(1);
		expect(report.cycles).toBe(3);
	});

	it("does not trigger on fewer than 3 cycles of data", () => {
		const report = findSystemicTriggers([
			cycle("2026-2027", [["PLO1", false]]),
			cycle("2025-2026", [["PLO1", false]]),
		]);
		expect(report).toEqual({ cycles: 2, maxRun: 2, ploCodes: [] });
	});

	it("reports the full run length for 4+ consecutive failures", () => {
		const report = findSystemicTriggers([
			cycle("2027-2028", [["PLO1", false]]),
			cycle("2026-2027", [["PLO1", false]]),
			cycle("2025-2026", [["PLO1", false]]),
			cycle("2024-2025", [["PLO1", false]]),
			cycle("2023-2024", [["PLO1", true]]),
		]);
		expect(report.maxRun).toBe(4);
		expect(report.ploCodes).toEqual(["PLO1"]);
	});

	it("keeps only the newest snapshot per cycle and skips empty ones", () => {
		const report = findSystemicTriggers([
			// Same AY twice — the newest (first) snapshot wins.
			cycle("2026-2027", [["PLO1", false]]),
			cycle("2026-2027", [["PLO1", true]]),
			cycle("2025-2026", [["PLO1", false]]),
			// A sheet with no `plos` payload carries no evidence at all.
			{ cycle: "2024-2025", plos: [] },
			cycle("2023-2024", [["PLO1", false]]),
		]);
		// Usable cycles: 2026-27, 2025-26, 2023-24 → the run is unbroken.
		expect(report).toEqual({ cycles: 3, maxRun: 3, ploCodes: ["PLO1"] });
	});

	it("breaks a PLO's run when an older snapshot lacks that PLO", () => {
		const report = findSystemicTriggers([
			cycle("2026-2027", [
				["PLO1", false],
				["PLO2", false],
			]),
			cycle("2025-2026", [["PLO1", false]]), // PLO2 not assessed this cycle
			cycle("2024-2025", [
				["PLO1", false],
				["PLO2", false],
			]),
		]);
		expect(report.ploCodes).toEqual(["PLO1"]);
		expect(report.maxRun).toBe(3);
	});

	it("evaluates each PLO independently", () => {
		const report = findSystemicTriggers([
			cycle("2026-2027", [
				["PLO1", false],
				["PLO2", true],
			]),
			cycle("2025-2026", [
				["PLO1", false],
				["PLO2", false],
			]),
			cycle("2024-2025", [
				["PLO1", false],
				["PLO2", true],
			]),
		]);
		expect(report.ploCodes).toEqual(["PLO1"]);
	});

	it("returns an empty report for no snapshots at all", () => {
		expect(findSystemicTriggers([])).toEqual({
			cycles: 0,
			maxRun: 0,
			ploCodes: [],
		});
	});
});
