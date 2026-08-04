export const MIN_ATTAINMENT_PCT = 70;

export const DIRECT_WEIGHT = 0.7;
export const INDIRECT_WEIGHT = 0.3;

export const COMPOSITE_WEIGHTS = {
	direct: DIRECT_WEIGHT,
	indirect: INDIRECT_WEIGHT,
} as const;

export class BelowAttainmentFloorError extends Error {
	public readonly value: number;

	constructor(value: number) {
		super(`Attainment ${value} is below the ${MIN_ATTAINMENT_PCT}% hard floor`);
		this.name = "BelowAttainmentFloorError";
		this.value = value;
	}
}

export function isBelowThreshold(value: number): boolean {
	return value < MIN_ATTAINMENT_PCT;
}

export function assertMinAttainment(value: number): void {
	if (isBelowThreshold(value)) {
		throw new BelowAttainmentFloorError(value);
	}
}

export function compositeScorePct(direct: number, indirect = 0): number {
	return round2(direct * DIRECT_WEIGHT + indirect * INDIRECT_WEIGHT);
}

export function round2(value: number): number {
	return Math.round(value * 100) / 100;
}
