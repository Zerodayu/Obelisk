import {
	compositeScorePct,
	isBelowThreshold,
} from "@lib/validators/attainment";

export interface EditedAttainment {
	compositeScorePct: number;
	isBelowThreshold: boolean;
}

/** Computes the derived fields after a manual edit or CSV re-import. */
export function computeEditedAttainment(
	directScorePct: number,
	indirectScorePct?: number | null,
): EditedAttainment {
	const composite = compositeScorePct(directScorePct, indirectScorePct);
	return {
		compositeScorePct: composite,
		isBelowThreshold: isBelowThreshold(composite),
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
