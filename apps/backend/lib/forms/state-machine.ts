import type {
	ApproverRole,
	SubmissionStatus,
} from "@prisma/generated/prisma/client";

export const APPROVAL_CHAIN: readonly ApproverRole[] = [
	"program_chair",
	"dean",
	"aqau",
	"vpaa",
];

export const STATUS_TRANSITIONS: Record<
	SubmissionStatus,
	readonly SubmissionStatus[]
> = {
	draft: ["submitted", "archived"],
	submitted: ["returned", "approved"],
	returned: ["submitted"],
	approved: ["archived"],
	archived: [],
};

export const EDITABLE_STATUSES: readonly SubmissionStatus[] = [
	"draft",
	"returned",
];

export class InvalidTransitionError extends Error {
	constructor(from: SubmissionStatus, to: SubmissionStatus) {
		super(`Invalid status transition: ${from} -> ${to}`);
		this.name = "InvalidTransitionError";
	}
}

export interface ApprovalStepInput {
	approverRole: ApproverRole;
	sequenceNo: number;
}

export function canTransition(
	from: SubmissionStatus,
	to: SubmissionStatus,
): boolean {
	return STATUS_TRANSITIONS[from].includes(to);
}

export function assertTransition(
	from: SubmissionStatus,
	to: SubmissionStatus,
): void {
	if (!canTransition(from, to)) {
		throw new InvalidTransitionError(from, to);
	}
}

export function assertEditable(status: SubmissionStatus): void {
	if (!EDITABLE_STATUSES.includes(status)) {
		throw new InvalidTransitionError(status, "draft");
	}
}

export function validateApprovalChain(steps: ApprovalStepInput[]): void {
	const sorted = [...steps].sort((a, b) => a.sequenceNo - b.sequenceNo);
	const roles = sorted.map((s) => s.approverRole);
	for (let i = 0; i < roles.length - 1; i += 1) {
		const a = APPROVAL_CHAIN.indexOf(roles[i]);
		const b = APPROVAL_CHAIN.indexOf(roles[i + 1]);
		if (a === -1 || b === -1 || b <= a) {
			throw new InvalidTransitionError("draft", "submitted");
		}
	}
}

export function firstPendingRole(steps: ApprovalStepInput[]): ApproverRole {
	return [...steps].sort((a, b) => a.sequenceNo - b.sequenceNo)[0].approverRole;
}
