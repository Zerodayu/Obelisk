/**
 * Systemic-gap trigger rule for the Systemic Gap Report submit gate
 * (`src/v1/periodic/service.ts`).
 *
 * The manual fires the escalation only after the SAME PLO has stayed
 * NOT MET for 3+ consecutive assessment cycles — one bad term is normal
 * CQI material, three in a row is a systemic gap (F26 → F27 CAPA).
 *
 * Pure data-in/data-out so the rule is unit-testable without a DB; the
 * caller fetches the approved `cohort_tracking` submissions and shapes the
 * snapshots from `formData.plos` (written by the rollup generator,
 * `src/v1/rollup/service.ts`).
 */

/** Consecutive NOT-MET cycles required to trigger the systemic escalation. */
export const SYSTEMIC_TRIGGER_CYCLES = 3;

export interface CohortPloSnapshot {
	/**
	 * Cycle dedupe key — the sheet's academic year (`term.schoolYear`) when
	 * known, so two sheets of the same AY count as one cycle.
	 */
	cycle: string;
	/** `formData.plos` rows: `{ ploCode, achieved }`. */
	plos: readonly { ploCode: string; achieved: boolean }[];
}

export interface SystemicTriggerReport {
	/** Distinct cycles that actually carry attainment data, newest first. */
	cycles: number;
	/** Longest consecutive NOT-MET run found across all PLOs. */
	maxRun: number;
	/** PLOs whose NOT-MET run reaches {@link SYSTEMIC_TRIGGER_CYCLES}. */
	ploCodes: string[];
}

/**
 * Evaluate snapshots ordered **newest first** (duplicates per cycle
 * allowed — the newest snapshot of a cycle wins).
 *
 * A PLO missing from a snapshot breaks its run: a cycle without data for
 * that PLO cannot prove "still NOT MET".
 * shortcut: term-less sheets would each count as their own cycle —
 * `FormSubmission.termId` is required today, so this cannot happen; if it
 * ever becomes nullable, key those sheets by AY instead.
 */
export function findSystemicTriggers(
	snapshots: readonly CohortPloSnapshot[],
): SystemicTriggerReport {
	const byCycle = new Map<
		string,
		readonly { ploCode: string; achieved: boolean }[]
	>();
	for (const snapshot of snapshots) {
		if (!byCycle.has(snapshot.cycle))
			byCycle.set(snapshot.cycle, snapshot.plos);
	}
	const cycles = [...byCycle.values()].filter((plos) => plos.length > 0);
	if (cycles.length === 0) return { cycles: 0, maxRun: 0, ploCodes: [] };

	const ploCodes = new Set<string>();
	for (const plos of cycles) for (const plo of plos) ploCodes.add(plo.ploCode);

	let maxRun = 0;
	const triggered: string[] = [];
	for (const code of ploCodes) {
		let run = 0;
		for (const plos of cycles) {
			const plo = plos.find((entry) => entry.ploCode === code);
			if (!plo || plo.achieved) break;
			run += 1;
		}
		maxRun = Math.max(maxRun, run);
		if (run >= SYSTEMIC_TRIGGER_CYCLES) triggered.push(code);
	}

	return { cycles: cycles.length, maxRun, ploCodes: triggered };
}
