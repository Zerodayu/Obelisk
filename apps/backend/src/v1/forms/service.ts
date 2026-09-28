import {
	approvalRouteFor,
	assertCanArchive,
	assertCanDecide,
	assertCanSubmit,
	chainSteps,
	NotOwnerError,
} from "@lib/forms/approval-routes";
import {
	assertEditable,
	assertTransition,
	firstPendingRole,
	type InvalidTransitionError,
} from "@lib/forms/state-machine";
import { assertSubmitGate } from "@lib/forms/submit-gates";
import { prisma } from "@lib/prisma";
import type { ApproverRole, Prisma } from "@prisma/generated/prisma/client";
import type {
	CreateFormSubmission,
	DecideApprovalStep,
	UpdateFormSubmission,
} from "./model";

export type { InvalidTransitionError, NotOwnerError };

const SUBMISSION_INCLUDE = {
	approvalSteps: { orderBy: { sequenceNo: "asc" as const } },
	formType: { select: { code: true, name: true, pdcaStage: true } },
	submittedBy: { select: { id: true, name: true, role: true } },
} as const;

export type FormSubmissionWithSteps = Prisma.FormSubmissionGetPayload<{
	include: typeof SUBMISSION_INCLUDE;
}>;

const APPROVAL_STEP_INCLUDE = { include: SUBMISSION_INCLUDE } as const;

/** Who a user-scoped list query is for — resolved server-side, never spoofable. */
export type ListScope = "mine" | "pending";

/**
 * Translate an inbox scope into a Prisma where-clause for the caller.
 * `mine` → the caller's own submissions; `pending` → submitted records waiting
 * on the caller's role (a `system_admin` sees every pending step).
 */
export function scopeWhere(
	scope: ListScope | undefined,
	caller: { id: string; role: string },
): Prisma.FormSubmissionWhereInput {
	if (scope === "mine") return { submittedByUserId: caller.id };
	if (scope === "pending") {
		if (caller.role === "system_admin") return { status: "submitted" };
		// Non-approvers have no pending inbox — match nothing rather than feed
		// Prisma an invalid enum value.
		if (
			!(
				["program_chair", "dean", "aqau", "vpaa"] as readonly string[]
			).includes(caller.role)
		) {
			return { id: { in: [] } };
		}
		return {
			status: "submitted",
			currentApproverRole: caller.role as ApproverRole,
		};
	}
	return {};
}

function newId(): string {
	return crypto.randomUUID();
}

export class NoPendingApprovalError extends Error {
	constructor(role: ApproverRole) {
		super(`No pending approval step for role ${role}`);
		this.name = "NoPendingApprovalError";
	}
}

export class SubmissionNotFoundError extends Error {
	constructor() {
		super("Form submission not found");
		this.name = "SubmissionNotFoundError";
	}
}

export class SubmissionService {
	async findById(id: string): Promise<FormSubmissionWithSteps | null> {
		return prisma.formSubmission.findUnique({
			where: { id },
			...APPROVAL_STEP_INCLUDE,
		});
	}

	async list(
		where: Prisma.FormSubmissionWhereInput = {},
	): Promise<FormSubmissionWithSteps[]> {
		return prisma.formSubmission.findMany({
			where,
			orderBy: { createdAt: "desc" },
			...APPROVAL_STEP_INCLUDE,
		});
	}

	async create(
		data: CreateFormSubmission,
		userId: string,
	): Promise<FormSubmissionWithSteps> {
		const submission = await prisma.formSubmission.create({
			data: {
				id: newId(),
				formTypeId: data.formTypeId,
				classSectionId: data.classSectionId,
				programId: data.programId,
				termId: data.termId,
				submittedByUserId: userId,
				status: "draft",
				formData: (data.formData ?? {}) as Prisma.InputJsonValue,
			},
			...APPROVAL_STEP_INCLUDE,
		});

		await this.audit(userId, "form_submission.created", submission.id, {
			formTypeId: data.formTypeId,
		});

		return submission;
	}

	async update(
		id: string,
		userId: string,
		callerRole: string,
		data: UpdateFormSubmission,
	): Promise<FormSubmissionWithSteps> {
		const existing = await this.findById(id);
		if (!existing) throw new SubmissionNotFoundError();
		assertEditable(existing.status);
		if (
			callerRole !== "system_admin" &&
			existing.submittedByUserId !== userId
		) {
			throw new NotOwnerError();
		}

		const submission = await prisma.formSubmission.update({
			where: { id },
			data: {
				classSectionId: data.classSectionId,
				programId: data.programId,
				formData: data.formData as Prisma.InputJsonValue,
			},
			...APPROVAL_STEP_INCLUDE,
		});

		await this.audit(userId, "form_submission.updated", id, {
			formData: data.formData,
		});

		return submission;
	}

	async submit(
		id: string,
		userId: string,
		callerRole: string,
	): Promise<FormSubmissionWithSteps> {
		const existing = await this.findById(id);
		if (!existing) throw new SubmissionNotFoundError();
		assertTransition(existing.status, "submitted");

		// Chain is server-derived from the form's registered route
		// (lib/forms/approval-routes.ts) — clients cannot pick it.
		const route = approvalRouteFor(existing.formType.code);
		assertCanSubmit({ id: userId, role: callerRole }, existing, route);
		const steps = chainSteps(route.chain);

		await assertSubmitGate(existing.formTypeId, {
			id: existing.id,
			status: existing.status,
			programId: existing.programId,
			termId: existing.termId,
			formData: (existing.formData ?? {}) as Record<string, unknown>,
		});

		await prisma.$transaction(async (tx) => {
			await tx.approvalStep.deleteMany({ where: { formSubmissionId: id } });
			await tx.approvalStep.createMany({
				data: steps.map((step) => ({
					id: newId(),
					formSubmissionId: id,
					approverRole: step.approverRole,
					sequenceNo: step.sequenceNo,
				})),
			});
			await tx.formSubmission.update({
				where: { id },
				data: {
					status: "submitted",
					currentApproverRole: firstPendingRole(steps),
				},
			});
		});

		const submission = await this.writeThrough(id);
		await this.audit(userId, "form_submission.submitted", id, { steps });

		return submission;
	}

	async decide(
		id: string,
		approverRole: ApproverRole,
		userId: string,
		callerRole: string,
		{ decision, comment }: DecideApprovalStep,
	): Promise<FormSubmissionWithSteps> {
		const existing = await this.findById(id);
		if (!existing) throw new SubmissionNotFoundError();
		// NOTE: RBAC first — the caller must hold the step's role (admin overrides).
		assertCanDecide(callerRole, approverRole);
		assertTransition(
			existing.status,
			decision === "approved" ? "approved" : "returned",
		);

		const pending = existing.approvalSteps
			.filter((step) => step.decision === "pending")
			.sort((a, b) => a.sequenceNo - b.sequenceNo)[0];
		if (!pending || pending.approverRole !== approverRole) {
			throw new NoPendingApprovalError(approverRole);
		}

		await prisma.$transaction(async (tx) => {
			await tx.approvalStep.update({
				where: { id: pending.id },
				data: {
					decision,
					approverUserId: userId,
					comment: comment ?? null,
					decidedAt: new Date(),
				},
			});

			if (decision === "returned") {
				await tx.formSubmission.update({
					where: { id },
					data: { status: "returned", currentApproverRole: null },
				});
				return;
			}

			const next = existing.approvalSteps
				.filter(
					(step) =>
						step.sequenceNo > pending.sequenceNo && step.decision === "pending",
				)
				.sort((a, b) => a.sequenceNo - b.sequenceNo)[0];

			if (next) {
				await tx.formSubmission.update({
					where: { id },
					data: { currentApproverRole: next.approverRole },
				});
			} else {
				await tx.formSubmission.update({
					where: { id },
					data: { status: "approved", currentApproverRole: null },
				});
			}
		});

		const submission = await this.writeThrough(id);
		await this.audit(userId, `form_submission.${decision}`, id, {
			approverRole,
			stepId: pending.id,
			comment,
		});

		return submission;
	}

	async archive(
		id: string,
		userId: string,
		callerRole: string,
	): Promise<FormSubmissionWithSteps> {
		const existing = await prisma.formSubmission.findUnique({ where: { id } });
		if (!existing) throw new SubmissionNotFoundError();
		assertCanArchive(callerRole);
		assertTransition(existing.status, "archived");

		const submission = await prisma.formSubmission.update({
			where: { id },
			data: { status: "archived", currentApproverRole: null },
			...APPROVAL_STEP_INCLUDE,
		});

		await this.audit(userId, "form_submission.archived", id, {});

		return submission;
	}

	private async writeThrough(id: string): Promise<FormSubmissionWithSteps> {
		return prisma.formSubmission.findUniqueOrThrow({
			where: { id },
			...APPROVAL_STEP_INCLUDE,
		});
	}

	private async audit(
		userId: string | null,
		action: string,
		targetRecordId: string,
		details: Record<string, unknown>,
	): Promise<void> {
		await prisma.auditLog.create({
			data: {
				id: newId(),
				userId,
				action,
				moduleAffected: "forms",
				targetRecordId,
				details: details as Prisma.InputJsonValue,
			},
		});
	}
}

export const submissionService = new SubmissionService();
