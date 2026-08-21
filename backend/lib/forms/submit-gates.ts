import { prisma } from "@lib/prisma";

export class SubmitGateError extends Error {
	constructor(formTypeCode: string, message: string) {
		super(message);
		this.name = `SubmitGateError[${formTypeCode}]`;
	}
}

export type SubmitGate = (submission: {
	id: string;
	formTypeId: string;
	status: string;
	programId: string | null;
	termId: string;
	formData: Record<string, unknown>;
}) => Promise<void>;

/**
 * Per-form pre-submission validity gates. A feature registers a gate for its
 * form-type code so the generic `POST /forms/:id/submit` endpoint cannot be
 * used to bypass a mandatory validation (e.g. the APAR gate that blocks
 * submission unless the Cohort Tracking Sheet is attached).
 */
const submitGates = new Map<string, SubmitGate>();

export function registerSubmitGate(
	formTypeCode: string,
	gate: SubmitGate,
): void {
	submitGates.set(formTypeCode, gate);
}

/**
 * Runs the gate registered for `formTypeCode`, if any. The gate is expected to
 * throw a `SubmitGateError` describing the blocking condition; a successful
 * return means the submission may proceed.
 */
export async function assertSubmitGate(
	formTypeId: string,
	submission: Omit<Parameters<SubmitGate>[0], "formTypeId">,
): Promise<void> {
	const formType = await prisma.formType.findUnique({
		where: { id: formTypeId },
		select: { code: true },
	});
	if (!formType) return;
	const gate = submitGates.get(formType.code);
	if (!gate) return;
	await gate({ formTypeId, ...submission });
}
