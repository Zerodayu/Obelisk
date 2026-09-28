import { describe, expect, it } from "bun:test";
import {
	computeEditedAttainment,
	reconcileAtRisk,
} from "@lib/ingest/score-edit";
import {
	assertMinAttainment,
	BelowAttainmentFloorError,
	compositeScorePct,
	DIRECT_WEIGHT,
	INDIRECT_WEIGHT,
	isBelowThreshold,
	MIN_ATTAINMENT_PCT,
} from "@lib/validators/attainment";

describe("attainment validators", () => {
	it("exposes the canonical 70% hard floor and 70/30 weights", () => {
		expect(MIN_ATTAINMENT_PCT).toBe(70);
		expect(DIRECT_WEIGHT).toBe(0.7);
		expect(INDIRECT_WEIGHT).toBe(0.3);
	});

	it("flags anything below 70% as below threshold", () => {
		expect(isBelowThreshold(69.99)).toBe(true);
		expect(isBelowThreshold(70)).toBe(false);
		expect(isBelowThreshold(85)).toBe(false);
	});

	it("assertMinAttainment passes at or above the floor", () => {
		expect(() => assertMinAttainment(70)).not.toThrow();
		expect(() => assertMinAttainment(100)).not.toThrow();
	});

	it("assertMinAttainment throws below the floor", () => {
		expect(() => assertMinAttainment(69)).toThrow(BelowAttainmentFloorError);
	});

	it("computes the direct x 0.70 + indirect x 0.30 composite", () => {
		expect(compositeScorePct(84, 62)).toBe(77.4);
		expect(compositeScorePct(100, 100)).toBe(100);
		expect(compositeScorePct(70, 70)).toBe(70);
	});

	it("defaults indirect to 0 when omitted", () => {
		expect(compositeScorePct(80)).toBe(56);
	});
});

describe("computeEditedAttainment (per-student score edits)", () => {
	it("mirrors the direct score as the composite and flags below 70", () => {
		const atRisk = computeEditedAttainment(55);
		expect(atRisk.compositeScorePct).toBe(55);
		expect(atRisk.isBelowThreshold).toBe(true);
	});

	it("clears the below-threshold flag at or above 70", () => {
		expect(computeEditedAttainment(70).isBelowThreshold).toBe(false);
		expect(computeEditedAttainment(85).isBelowThreshold).toBe(false);
	});

	it("rounds composite to two decimals", () => {
		expect(computeEditedAttainment(55.555).compositeScorePct).toBe(55.56);
	});
});

describe("reconcileAtRisk", () => {
	it("creates a flag when below threshold and none exists", () => {
		expect(reconcileAtRisk(true, false)).toEqual({
			shouldCreate: true,
			shouldPrune: false,
		});
	});

	it("prunes a stale flag when the score recovers to >= 70", () => {
		expect(reconcileAtRisk(false, true)).toEqual({
			shouldCreate: false,
			shouldPrune: true,
		});
	});

	it("is a no-op when state already matches", () => {
		expect(reconcileAtRisk(true, true)).toEqual({
			shouldCreate: false,
			shouldPrune: false,
		});
		expect(reconcileAtRisk(false, false)).toEqual({
			shouldCreate: false,
			shouldPrune: false,
		});
	});
});
