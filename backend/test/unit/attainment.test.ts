import { describe, expect, it } from "bun:test";
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
