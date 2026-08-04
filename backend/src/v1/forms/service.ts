import { randomUUID } from "node:crypto";
import {
	assertEditable,
	assertTransition,
	firstPendingRole,
	type InvalidTransitionError,
	validateApprovalChain,
} from "@lib/forms/state-machine";
import { prisma } from "@lib/prisma";
import type {
	ApproverRole,
	FormSubmission,
	Prisma,
} from "@prisma/generated/prisma/client";
import type {
	CreateApprovalStep,
	CreateFormSubmission,
	DecideApprovalStep,
	UpdateFormSubmission,
} from "./model";

export type { InvalidTransitionError };

export type FormSubmissionWithSteps = Prisma.FormSubmissionGetPayload<{
	include: { approvalSteps: { orderBy: { sequenceNo: "asc" } } };
}>;

const APPROVAL_STEP_INCLUDE = {
	include: { approvalSteps: { orderBy: { sequenceNo: "asc" } } },
} as const;

function newId(): string {
	return randomUUID();
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
		where: Partial<
			Pick<FormSubmission, "formTypeId" | "classSectionId" | "status">
		> = {},
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
		data: UpdateFormSubmission,
	): Promise<FormSubmissionWithSteps> {
		const existing = await this.findById(id);
		if (!existing) throw new SubmissionNotFoundError();
		assertEditable(existing.status);

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
		steps: CreateApprovalStep[],
	): Promise<FormSubmissionWithSteps> {
		const existing = await this.findById(id);
		if (!existing) throw new SubmissionNotFoundError();
		assertTransition(existing.status, "submitted");
		validateApprovalChain(steps);

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
		{ decision, comment }: DecideApprovalStep,
	): Promise<FormSubmissionWithSteps> {
		const existing = await this.findById(id);
		if (!existing) throw new SubmissionNotFoundError();
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

	async archive(id: string, userId: string): Promise<FormSubmissionWithSteps> {
		const existing = await prisma.formSubmission.findUnique({ where: { id } });
		if (!existing) throw new SubmissionNotFoundError();
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
