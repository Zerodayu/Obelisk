import { runApprovalEffects } from "@lib/forms/approval-effects";
import {
	APPROVAL_ROUTES,
	APPROVER_ROLES,
	approvalRouteFor,
	assertCanArchive,
	assertCanDecide,
	assertCanSubmit,
	assertNotSelfApproval,
	chainSteps,
	NotOwnerError,
} from "@lib/forms/approval-routes";
import { needsApproval } from "@lib/forms/form-tags";
import {
	resolveJustification,
	type SubmissionJustification,
} from "@lib/forms/justification";
import {
	assertEditable,
	assertTransition,
	firstPendingRole,
	type InvalidTransitionError,
} from "@lib/forms/state-machine";
import { assertSubmitGate } from "@lib/forms/submit-gates";
import { prisma } from "@lib/prisma";
import { ARCHIVE_ROLES } from "@lib/role-access";
import {
	assertClassSectionInScope,
	assertSubmissionInScope,
	assertTargetInScope,
	type NormalizedCaller,
	type ScopeCaller,
	scopeCaller,
	submissionUnitWhere,
	unitScopeForUser,
	unitScopeOf,
} from "@lib/unit-scope";
import type { ApproverRole, Prisma } from "@prisma/generated/prisma/client";
import type {
	CreateFormSubmission,
	DecideApprovalStep,
	UpdateFormSubmission,
} from "./model";

export type { InvalidTransitionError, NotOwnerError };

const SUBMISSION_INCLUDE = {
	// The approver is joined so the approval screen can render the manual's
	// signature block ("Approved by <Printed Name> · <role> — date"). Step rows
	// carry only `approverUserId` before this join; `decide()` already writes it.
	approvalSteps: {
		orderBy: { sequenceNo: "asc" as const },
		include: {
			approver: { select: { id: true, name: true, role: true } },
		},
	},
	formType: { select: { code: true, name: true, pdcaStage: true } },
	submittedBy: { select: { id: true, name: true, role: true } },
} as const;

export type FormSubmissionWithSteps = Prisma.FormSubmissionGetPayload<{
	include: typeof SUBMISSION_INCLUDE;
}>;

const APPROVAL_STEP_INCLUDE = { include: SUBMISSION_INCLUDE } as const;

/** Who a user-scoped list query is for — resolved server-side, never spoofable. */
export type ListScope = "mine" | "visible" | "pending" | "all";

/**
 * Translate an inbox scope into a Prisma where-clause for the caller.
 * `mine` — and **no scope at all** — → the caller's own submissions; `visible`
 * → the chain-entitled read (own + every form whose server-derived chain
 * contains the caller's role, i.e. the data of the roles at or below theirs
 * that must reach their step); `pending` → submitted records waiting on the
 * caller's role (a `system_admin` sees every pending step); `all` → every
 * submission, for the archive roles only (vpaa/system_admin).
 *
 * NOTE: an absent scope used to fall through to an unscoped read so the
 * dashboard status donut could show institution-wide totals to anyone — it is
 * now per-user like `mine`, so no caller can list another user's submissions
 * by omitting the parameter. Institution-wide reads stay explicit via
 * `scope=all` (archive roles only) or implicit through `scope=visible` for the
 * roles that sit in (nearly) every chain.
 *
 * **Unit narrowing** (`lib/unit-scope.ts`): whatever the inbox scope resolves
 * to is additionally intersected with the caller's unit — a `program_chair`
 * never sees another program's rows and a `dean` never sees another
 * department's, even for the chain-entitled `visible`/`pending` scopes.
 */
export function scopeWhere(
	scope: ListScope | undefined,
	caller: ScopeCaller,
): Prisma.FormSubmissionWhereInput {
	const c = scopeCaller(caller);
	const base = inboxWhere(scope, c);
	const unit = submissionUnitWhere(unitScopeOf(c));
	return Object.keys(unit).length > 0 ? { AND: [base, unit] } : base;
}

/** The role/ownership half of `scopeWhere` — the unit clause is added by it. */
function inboxWhere(
	scope: ListScope | undefined,
	caller: NormalizedCaller,
): Prisma.FormSubmissionWhereInput {
	if (scope === "visible") {
		// NOTE: archive roles are in every chain anyway — short-circuit to the
		// institution-wide list (`vpaa` is the final rung of every chain,
		// `system_admin` overrides everything in `canReadSubmission`).
		if (ARCHIVE_ROLES.includes(caller.role)) return {};
		// NOTE: chain-entitled visibility — own submissions plus every form
		// whose registered chain contains the caller's role. Chains are
		// contiguous from their entry role up to `vpaa`
		// (lib/forms/approval-routes.ts#ascendToVpaa), so this is exactly "the
		// data of the roles at or below mine that has to reach my step":
		// faculty (never an approver) sees only its own, program_chair sees
		// everything entered at/below chair, and so on up. It mirrors
		// `canReadSubmission`, so a list can never expose a row that the
		// per-record read would refuse.
		const codes = Object.keys(APPROVAL_ROUTES);
		const ownChain = codes.filter((code) =>
			APPROVAL_ROUTES[code]?.chain.some((role) => role === caller.role),
		);
		const clauses: Prisma.FormSubmissionWhereInput[] = [
			{ submittedByUserId: caller.id },
			{ formType: { code: { in: ownChain } } },
		];
		// NOTE: an unregistered code falls back to DEFAULT_APPROVAL_ROUTE (the
		// full approver chain) in `approvalRouteFor` — mirror that here so a
		// form type missing from the registry lists exactly as it reads.
		if ((APPROVER_ROLES as readonly string[]).includes(caller.role)) {
			clauses.push({ formType: { code: { notIn: codes } } });
		}
		return { OR: clauses };
	}
	if (scope === "all") {
		// NOTE: the institution-wide list backs the VPAA archive screen — a
		// spoofed `scope=all` from any other role matches nothing instead of
		// leaking other users' submissions.
		if (!ARCHIVE_ROLES.includes(caller.role)) {
			return { id: { in: [] } };
		}
		return {};
	}
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
			// NOTE: the owner cannot decide their own row
			// (assertNotSelfApproval) — keep it out of their inbox rather than
			// offering a dead Approve button.
			NOT: { submittedByUserId: caller.id },
		};
	}
	// NOTE: `mine` and the no-scope default — the caller's own submissions only.
	return { submittedByUserId: caller.id };
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

/** 403 — caller may read neither this submission nor its evidence. */
export class SubmissionForbiddenError extends Error {
	constructor() {
		super("You may not view this submission");
		this.name = "SubmissionForbiddenError";
	}
}

/**
 * What a submission is *about*, for the approval screen: the stored payload
 * plus the bound class section and its captured class-record summary. Counts
 * only — a reviewer outside the capture roles must still be able to read it.
 */
export interface SubmissionEvidence {
	code: string;
	classSectionId: string | null;
	formData: Record<string, unknown>;
	/**
	 * Bloom's / I-P-D / assessment evidence as read-only text, resolved by the
	 * form code's registered resolver (`lib/forms/justification.ts`). Null when
	 * the code carries no pedagogical data.
	 */
	justification: SubmissionJustification | null;
	classSection: {
		id: string;
		sectionCode: string;
		course: { code: string; title: string };
		term: { schoolYear: string; semester: string };
	} | null;
	capture: {
		attainmentRows: number;
		students: number;
		belowThresholdRows: number;
		atRiskStudents: number;
		computationRunId: string | null;
		runAt: string | null;
	} | null;
}

/**
 * May `caller` read this submission? The owner, a `system_admin`, or a role in
 * the form's server-derived chain — chain-derived rather than status-derived so
 * a shared draft still opens for the approvers who will see it.
 */
function canViewSubmission(
	submission: Pick<FormSubmissionWithSteps, "submittedByUserId" | "formType">,
	caller: { id: string; role: string },
): boolean {
	if (submission.submittedByUserId === caller.id) return true;
	if (caller.role === "system_admin") return true;
	const route = approvalRouteFor(submission.formType.code);
	return (route.chain as readonly string[]).includes(caller.role);
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

	/**
	 * `GET /forms/:id` — visibility-checked read used by the approval screen.
	 * Throws `SubmissionNotFoundError` (unknown id) or
	 * `SubmissionForbiddenError` (no rights) instead of leaking the record.
	 *
	 * Beyond the chain/owner read rule, the row must also sit inside the
	 * caller's **unit** (`lib/unit-scope.ts`) — `UnitScopeError` (403) when
	 * another program/department prepared it.
	 */
	async getForViewer(
		id: string,
		caller: ScopeCaller,
	): Promise<FormSubmissionWithSteps> {
		const submission = await this.findById(id);
		if (!submission) throw new SubmissionNotFoundError();
		const c = scopeCaller(caller);
		if (!canViewSubmission(submission, c)) {
			throw new SubmissionForbiddenError();
		}
		await assertSubmissionInScope(unitScopeOf(c), id);
		return submission;
	}

	/**
	 * When this submission was last submitted for approval — the date the
	 * approval screen's "Prepared by … — <date>" signature row prints.
	 *
	 * Read from the audit trail (`form_submission.submitted`) rather than
	 * `FormSubmission.updatedAt`, which every later approve/return bumps.
	 * `null` for a submission that has never entered the chain (draft), so the
	 * caller falls back to `createdAt`.
	 */
	async submittedAt(id: string): Promise<string | null> {
		const row = await prisma.auditLog.findFirst({
			where: { action: "form_submission.submitted", targetRecordId: id },
			orderBy: { createdAt: "desc" },
			select: { createdAt: true },
		});
		return row?.createdAt.toISOString() ?? null;
	}

	/**
	 * `GET /forms/:id/evidence` — the submission's payload plus the bound class
	 * section, its capture summary (attainment rows, distinct students,
	 * below-threshold rows, at-risk students, latest run), and the form code's
	 * registered pedagogical justification (Bloom's / I-P-D / assessment
	 * evidence — `lib/forms/justification.ts`).
	 */
	async evidence(id: string, caller: ScopeCaller): Promise<SubmissionEvidence> {
		const submission = await this.getForViewer(id, caller);
		const classSectionId = submission.classSectionId;
		const formData = (submission.formData ?? {}) as Record<string, unknown>;

		// NOTE: started before the capture counts — the CAR resolver
		// re-assembles the form, which is the slow half of this read.
		const justificationPromise = resolveJustification(
			submission.formType.code,
			{ submissionId: submission.id, classSectionId, formData },
		);

		let classSection: SubmissionEvidence["classSection"] = null;
		let capture: SubmissionEvidence["capture"] = null;

		if (classSectionId) {
			classSection = await prisma.classSection.findUnique({
				where: { id: classSectionId },
				select: {
					id: true,
					sectionCode: true,
					course: { select: { code: true, title: true } },
					term: { select: { schoolYear: true, semester: true } },
				},
			});
			const [
				attainmentRows,
				students,
				belowThresholdRows,
				atRiskStudents,
				run,
			] = await Promise.all([
				prisma.cloAttainment.count({ where: { classSectionId } }),
				// groupBy().length — `count({ distinct })` types collapse to never
				// on this Prisma version.
				prisma.cloAttainment
					.groupBy({ by: ["studentId"], where: { classSectionId } })
					.then((rows) => rows.length),
				prisma.cloAttainment.count({
					where: { classSectionId, isBelowThreshold: true },
				}),
				prisma.atRiskFlag.count({
					where: { cloAttainment: { classSectionId } },
				}),
				prisma.computationRun.findFirst({
					where: { scope: classSectionId },
					orderBy: { runAt: "desc" },
					select: { id: true, runAt: true },
				}),
			]);
			capture = {
				attainmentRows,
				students,
				belowThresholdRows,
				atRiskStudents,
				computationRunId: run?.id ?? null,
				runAt: run?.runAt.toISOString() ?? null,
			};
		}

		return {
			code: submission.formType.code,
			classSectionId,
			formData,
			justification: await justificationPromise,
			classSection,
			capture,
		};
	}

	async create(
		data: CreateFormSubmission,
		userId: string,
	): Promise<FormSubmissionWithSteps> {
		// NOTE: unit check resolves the caller's scope from the **DB row**
		// (never the request body) — a faculty/chair may only file under its own
		// program, a dean under its department, and a program-less submission
		// (`programId` + section both absent) belongs to the institution roles.
		// This one choke point covers every `POST /forms` *and* every module
		// `…/init` draft, which all create through here.
		await assertTargetInScope(await unitScopeForUser(userId), {
			programId: data.programId,
			classSectionId: data.classSectionId,
		});

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

		// Unit re-check: an owner may not re-file their draft under another
		// program (or move it onto a section outside their unit).
		const unit = await unitScopeForUser(userId);
		if (data.classSectionId) {
			await assertClassSectionInScope(unit, data.classSectionId);
		}
		await assertTargetInScope(unit, {
			programId: data.programId ?? existing.programId,
			classSectionId: data.classSectionId ?? existing.classSectionId,
		});

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

		// Chain is server-derived from the form's registered route
		// (lib/forms/approval-routes.ts) — clients cannot pick it.
		const route = approvalRouteFor(existing.formType.code);
		assertCanSubmit({ id: userId, role: callerRole }, existing, route);
		// NOTE: Setup/Record-tagged forms are filed, not approved — no steps,
		// straight to `approved` (see lib/forms/form-tags.ts).
		const approvalFree = !needsApproval(existing.formType.code);
		assertTransition(
			existing.status,
			approvalFree ? "approved" : "submitted",
		);
		const steps = approvalFree ? [] : chainSteps(route.chain);

		await assertSubmitGate(existing.formTypeId, {
			id: existing.id,
			status: existing.status,
			programId: existing.programId,
			termId: existing.termId,
			classSectionId: existing.classSectionId,
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
				data: approvalFree
					? { status: "approved", currentApproverRole: null }
					: {
							status: "submitted",
							currentApproverRole: firstPendingRole(steps),
						},
			});
		});

		const submission = await this.writeThrough(id);
		await this.audit(userId, "form_submission.submitted", id, {
			steps,
			approvalFree,
		});

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
		// NOTE: then ownership — nobody signs off on their own row. Applies to
		// `approved` only: the owner returning (withdrawing) their own
		// submission grants no approval and keeps a stuck draft recoverable.
		if (decision === "approved") {
			assertNotSelfApproval({ id: userId, role: callerRole }, existing);
		}
		// NOTE: then the **unit** — a program_chair/dean may only sign off on
		// rows of its own program/department (`UnitScopeError` otherwise). A
		// signer outside the owner's unit is possible (system_admin override).
		await assertSubmissionInScope(await unitScopeForUser(userId), id);
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

		// Audit details contributed by a registered approval effect (e.g.
		// `action_taken` → { flagsCleared }) — captured inside the transaction,
		// written to the audit log after it commits.
		let effectDetails: Record<string, unknown> = {};

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
				// Final approval → run the form's registered effect in the same
				// transaction (lib/forms/approval-effects.ts).
				effectDetails = await runApprovalEffects(tx, {
					id: existing.id,
					formTypeCode: existing.formType.code,
					classSectionId: existing.classSectionId,
					formData: (existing.formData ?? {}) as Record<string, unknown>,
				});
			}
		});

		const submission = await this.writeThrough(id);
		await this.audit(userId, `form_submission.${decision}`, id, {
			approverRole,
			stepId: pending.id,
			comment,
			...effectDetails,
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
