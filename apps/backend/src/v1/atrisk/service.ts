import { registerApprovalEffect } from "@lib/forms/approval-effects";
import { EDITABLE_STATUSES } from "@lib/forms/state-machine";
import { registerSubmitGate, SubmitGateError } from "@lib/forms/submit-gates";
import { prisma } from "@lib/prisma";
import {
	assertClassSectionInScope,
	atRiskFlagUnitWhere,
	type UnitScope,
	unitScopeForUser,
} from "@lib/unit-scope";
import type { Prisma } from "@prisma/generated/prisma/client";
import { submissionService } from "@v1/forms/service";

import type { SaveActionTaken } from "./model";

// --- Form type -----------------------------------------------------------------

export const ACTION_TAKEN_CODE = "action_taken";

const ACTION_TAKEN_META = {
	name: "Action-Taken Record (At-Risk Students)",
	sequenceNo: 35,
} as const;

/**
 * Race-safe `FormType` ensure (same pattern as `ensureCqiFormType` /
 * `ensureCheckFormType`) — created lazily on first init, never seeded.
 */
export async function ensureActionTakenFormType(): Promise<string> {
	const existing = await prisma.formType.findUnique({
		where: { code: ACTION_TAKEN_CODE },
		select: { id: true },
	});
	if (existing) return existing.id;

	try {
		const created = await prisma.formType.create({
			data: {
				id: crypto.randomUUID(),
				code: ACTION_TAKEN_CODE,
				name: ACTION_TAKEN_META.name,
				pdcaStage: "ACT",
				sequenceNo: ACTION_TAKEN_META.sequenceNo,
			},
			select: { id: true },
		});
		return created.id;
	} catch {
		const retried = await prisma.formType.findUnique({
			where: { code: ACTION_TAKEN_CODE },
			select: { id: true },
		});
		if (retried) return retried.id;
		throw new Error(`Failed to ensure the ${ACTION_TAKEN_CODE} form type`);
	}
}

// --- Errors --------------------------------------------------------------------

export class AtRiskSectionNotFoundError extends Error {
	constructor(classSectionId: string) {
		super(`Class section '${classSectionId}' not found`);
		this.name = "AtRiskSectionNotFoundError";
	}
}

export class ActionTakenSubmissionNotFoundError extends Error {
	constructor(id: string) {
		super(`Action-taken submission '${id}' not found`);
		this.name = "ActionTakenSubmissionNotFoundError";
	}
}

export class ActionTakenInvalidEditError extends Error {
	constructor() {
		super(
			"Action-taken content may only be edited while the submission is draft or returned.",
		);
		this.name = "ActionTakenInvalidEditError";
	}
}

// --- Helpers -------------------------------------------------------------------

/** Pull the selected `Student.id`s out of a submission's formData. */
function selectedStudentIds(formData: Record<string, unknown>): string[] {
	const raw = formData.studentIds;
	if (!Array.isArray(raw)) return [];
	return raw.filter((id): id is string => typeof id === "string");
}

// --- Service -------------------------------------------------------------------

export class AtRiskService {
	/**
	 * `GET /atrisk/flags` — the at-risk watchlist: one row per `AtRiskFlag`
	 * with the student and the CLO the flag points at, optionally scoped to a
	 * class section (via `cloAttainment.classSectionId`).
	 *
	 * `unit` narrows it to the caller's program/department (`lib/unit-scope.ts`)
	 * — flags on students of another unit are never listed, and a foreign
	 * `classSectionId` filter is refused outright with 403.
	 */
	async listFlags(unit: UnitScope, classSectionId?: string) {
		if (classSectionId) {
			await assertClassSectionInScope(unit, classSectionId);
		}
		return prisma.atRiskFlag.findMany({
			where: {
				AND: [
					atRiskFlagUnitWhere(unit),
					classSectionId ? { cloAttainment: { classSectionId } } : {},
				],
			},
			include: {
				student: {
					select: {
						id: true,
						studentNumber: true,
						firstName: true,
						lastName: true,
					},
				},
				cloAttainment: {
					select: {
						classSectionId: true,
						clo: { select: { code: true } },
					},
				},
			},
			orderBy: { flaggedAt: "desc" },
		});
	}

	/**
	 * `POST /atrisk/action/init` — open (or reuse) the action-taken draft for
	 * a class section. Term and program are resolved from the section so the
	 * client only picks the section. Reuses the newest draft/returned/submitted
	 * submission; an approved/archived one is left alone and a fresh draft is
	 * created (the flags it cleared are gone for good).
	 */
	async init(classSectionId: string, userId: string): Promise<{ id: string }> {
		// NOTE: unit check before the reuse lookup — otherwise a scoped caller
		// could adopt (and then be handed the id of) another unit's draft.
		await assertClassSectionInScope(
			await unitScopeForUser(userId),
			classSectionId,
		);

		const section = await prisma.classSection.findUnique({
			where: { id: classSectionId },
			include: { course: { select: { programId: true } } },
		});
		if (!section) throw new AtRiskSectionNotFoundError(classSectionId);

		const formTypeId = await ensureActionTakenFormType();
		const existing = await prisma.formSubmission.findFirst({
			where: {
				formTypeId,
				classSectionId,
				status: { in: [...EDITABLE_STATUSES, "submitted"] },
			},
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
		if (existing) return { id: existing.id };

		const created = await submissionService.create(
			{
				formTypeId,
				classSectionId,
				programId: section.course.programId,
				termId: section.termId,
				formData: {},
			},
			userId,
		);
		return { id: created.id };
	}

	/** `GET /atrisk/action/:id` — full submission (steps + formData). */
	async get(id: string) {
		const submission = await submissionService.findById(id);
		if (!submission || submission.formType.code !== ACTION_TAKEN_CODE) {
			throw new ActionTakenSubmissionNotFoundError(id);
		}
		return submission;
	}

	/**
	 * `PUT /atrisk/action/:id` — save the student selection + intervention
	 * note. Draft/returned only, owner (or system_admin) only — same rules as
	 * the generic `PUT /forms/:id`, re-enforced here because this endpoint
	 * owns the formData shape for this form.
	 */
	async save(
		id: string,
		userId: string,
		callerRole: string,
		body: SaveActionTaken,
	) {
		const existing = await prisma.formSubmission.findUnique({
			where: { id },
			select: { status: true, formType: { select: { code: true } } },
		});
		if (!existing || existing.formType.code !== ACTION_TAKEN_CODE) {
			throw new ActionTakenSubmissionNotFoundError(id);
		}
		if (
			!EDITABLE_STATUSES.includes(
				existing.status as (typeof EDITABLE_STATUSES)[number],
			)
		) {
			throw new ActionTakenInvalidEditError();
		}

		// NOTE: no explicit unit assert here — `submissionService.update` only
		// accepts the owner (or `system_admin`, which is institution-wide), so a
		// foreign draft can't reach this point; the target program/section it
		// writes to is unit-checked there too.

		return submissionService.update(id, userId, callerRole, {
			formData: {
				studentIds: body.studentIds,
				actionTaken: body.actionTaken,
			},
		});
	}
}

export const atRiskService = new AtRiskService();

// --- Submit gate ---------------------------------------------------------------

// A submission that names no students (or records no intervention) has no
// effect when approved — block it before the chain starts.
registerSubmitGate(ACTION_TAKEN_CODE, async (submission) => {
	if (selectedStudentIds(submission.formData).length === 0) {
		throw new SubmitGateError(
			ACTION_TAKEN_CODE,
			"Action-Taken blocked: select at least one at-risk student before submitting.",
		);
	}
	if (
		typeof submission.formData.actionTaken !== "string" ||
		!submission.formData.actionTaken.trim()
	) {
		throw new SubmitGateError(
			ACTION_TAKEN_CODE,
			"Action-Taken blocked: describe the action taken before submitting.",
		);
	}
});

// --- Approval effect -----------------------------------------------------------

/**
 * On **final** approval, clear the `AtRiskFlag` rows of the students the form
 * selected — scoped to the form's class section (flags reach their section
 * only through `cloAttainment`), so a student flagged in another section
 * stays flagged. Runs inside the approval transaction
 * (`lib/forms/approval-effects.ts`), so approval and clear commit together.
 */
registerApprovalEffect(ACTION_TAKEN_CODE, async (tx, submission) => {
	const studentIds = selectedStudentIds(submission.formData);
	if (studentIds.length === 0) return { flagsCleared: 0 };

	const where: Prisma.AtRiskFlagWhereInput = {
		studentId: { in: studentIds },
		...(submission.classSectionId
			? { cloAttainment: { classSectionId: submission.classSectionId } }
			: {}),
	};
	const result = await tx.atRiskFlag.deleteMany({ where });
	return { flagsCleared: result.count };
});
