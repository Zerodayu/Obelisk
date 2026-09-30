import type { Prisma } from "@prisma/generated/prisma/client";

/**
 * Post-approval side effects, keyed by `FormType.code`.
 *
 * Mirror of `lib/forms/submit-gates.ts`: the generic forms service stays
 * form-agnostic, and a feature module registers the effect its form has on the
 * outside world when the **final** approval step lands (e.g. the `action_taken`
 * form clearing `AtRiskFlag` rows for the students it covers).
 *
 * The effect runs **inside the same transaction** that flips the submission to
 * `approved`, so the approval and its side effect commit (or roll back)
 * together — a crash can never leave a "cleared without approval" or
 * "approved but not cleared" state.
 *
 * Registration happens at module load of the owning feature (import it
 * somewhere in the app graph — `src/routes.ts` does). An unregistered code is
 * a no-op.
 */
export interface ApprovalEffectSubmission {
	id: string;
	formTypeCode: string;
	classSectionId: string | null;
	formData: Record<string, unknown>;
}

/**
 * Extra detail merged into the `form_submission.approved` audit entry after
 * the transaction commits (e.g. `{ flagsCleared: 2 }`). Return `undefined`
 * for none.
 */
export type ApprovalEffectResult = Record<string, unknown> | undefined;

export type ApprovalEffect = (
	tx: Prisma.TransactionClient,
	submission: ApprovalEffectSubmission,
) => Promise<ApprovalEffectResult>;

const approvalEffects = new Map<string, ApprovalEffect>();

/** Register the final-approval effect for a stable form code. */
export function registerApprovalEffect(
	formTypeCode: string,
	effect: ApprovalEffect,
): void {
	approvalEffects.set(formTypeCode, effect);
}

/**
 * Run the effect registered for `submission.formTypeCode`, if any. Returns
 * the effect's audit details (empty when no effect is registered).
 */
export async function runApprovalEffects(
	tx: Prisma.TransactionClient,
	submission: ApprovalEffectSubmission,
): Promise<Record<string, unknown>> {
	const effect = approvalEffects.get(submission.formTypeCode);
	if (!effect) return {};
	return (await effect(tx, submission)) ?? {};
}
