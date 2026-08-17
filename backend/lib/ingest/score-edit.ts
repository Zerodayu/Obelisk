import { isBelowThreshold } from "@lib/validators/attainment";

export interface EditedAttainment {
	compositeScorePct: number;
	isBelowThreshold: boolean;
}

/**
 * Computes the derived fields for a per-student CLO score after a manual
 * edit or CSV re-import. The composite currently mirrors the direct score
 * because direct-instrument persistence has no indirect (30%) data yet —
 * the 70/30 formula is applied when indirect evidence exists.
 */
export function computeEditedAttainment(
	directScorePct: number,
): EditedAttainment {
	const compositeScorePct = Math.round(directScorePct * 100) / 100;
	return {
		compositeScorePct,
		isBelowThreshold: isBelowThreshold(compositeScorePct),
	};
}

export interface FlagReconcileResult {
	shouldCreate: boolean;
	shouldPrune: boolean;
}

/**
 * At-risk flags are computed, never hand-entered: a flag must exist for the
 * attainment iff its composite score is below the fixed 70% hard floor.
 * `exists` describes whether an AtRiskFlag already points at the attainment.
 */
export function reconcileAtRisk(
	isBelowThreshold: boolean,
	exists: boolean,
): FlagReconcileResult {
	return {
		shouldCreate: isBelowThreshold && !exists,
		shouldPrune: !isBelowThreshold && exists,
	};
}
