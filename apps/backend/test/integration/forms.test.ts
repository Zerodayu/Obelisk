import { describe, expect, it } from "bun:test";
import {
	ApprovalForbiddenError,
	NotOwnerError,
} from "@lib/forms/approval-routes";
import { prisma } from "@lib/prisma";
import { isDbReachable } from "@test/helpers/db-gate";
import {
	SubmissionForbiddenError,
	SubmissionNotFoundError,
	scopeWhere,
	submissionService,
} from "@v1/forms/service";

const db = await isDbReachable();

/**
 * Uses three registered form codes so routing is derived from
 * `lib/forms/approval-routes.ts` + `lib/forms/form-tags.ts`:
 *  - `clo_raw_data`            → Record tag — files straight to `approved`, no steps
 *  - `course_assessment_report` → preparers [faculty], chain [program_chair → dean → aqau → vpaa]
 *  - `stakeholder_consultation` → preparers [program_chair, faculty, dean], chain enters at program_chair
 * Approval-bound chains all climb to the VPAA (the final review before archive).
 */
const RAW_DATA_CODE = "clo_raw_data";
const CAR_CODE = "course_assessment_report";
// NOTE: no other test file ensures this form type — seed() can own its row.
const CONSULT_CODE = "stakeholder_consultation";

const IDS = {
	term: "it-forms-term",
	owner: "it-forms-owner",
	other: "it-forms-other",
	chair: "it-forms-chair",
	rawType: "it-forms-type-raw",
	carType: "it-forms-type-car",
	consultType: "it-forms-type-consult",
	// Section fixtures — the `clo_raw_data` submit gate needs a class section
	// with at least one captured attainment row.
	department: "it-forms-dept",
	program: "it-forms-prog",
	course: "it-forms-course",
	classSection: "it-forms-section",
	/** Same course, but no `ComputationRun` — pre-upload state. */
	sectionNoRun: "it-forms-section-norun",
	clo: "it-forms-clo",
	student: "it-forms-student",
	computationRun: "it-forms-run",
	attainment: "it-forms-attainment",
};

async function seed() {
	await prisma.academicTerm.create({
		data: {
			id: IDS.term,
			schoolYear: "2099-2100",
			semester: "1st",
			isActive: false,
		},
	});
	await prisma.department.create({
		data: { id: IDS.department, name: "Forms Dept", code: "IT-FORMS" },
	});
	await prisma.program.create({
		data: {
			id: IDS.program,
			departmentId: IDS.department,
			name: "Forms Program",
			code: "IT-FORMS-PROG",
		},
	});
	await prisma.course.create({
		data: {
			id: IDS.course,
			programId: IDS.program,
			code: "IT-FORMS-101",
			title: "Forms Course",
		},
	});
	await prisma.classSection.create({
		data: {
			id: IDS.classSection,
			courseId: IDS.course,
			termId: IDS.term,
			sectionCode: "F1",
		},
	});
	await prisma.classSection.create({
		data: {
			id: IDS.sectionNoRun,
			courseId: IDS.course,
			termId: IDS.term,
			sectionCode: "F2",
		},
	});
	await prisma.clo.create({
		data: {
			id: IDS.clo,
			courseId: IDS.course,
			code: "CLO1",
			description: "Forms CLO 1",
		},
	});
	await prisma.student.create({
		data: {
			id: IDS.student,
			studentNumber: "IT-FORMS-0001",
			programId: IDS.program,
			firstName: "Forms",
			lastName: "Student",
			anonymizedId: "it-forms-anon",
		},
	});
	await prisma.computationRun.create({
		data: { id: IDS.computationRun, scope: IDS.classSection },
	});
	await prisma.cloAttainment.create({
		data: {
			id: IDS.attainment,
			classSectionId: IDS.classSection,
			cloId: IDS.clo,
			studentId: IDS.student,
			compositeScorePct: 85,
			computationRunId: IDS.computationRun,
		},
	});
	await prisma.user.createMany({
		data: [
			{
				id: IDS.owner,
				name: "Forms Owner",
				email: "forms-owner@obelisk.local",
				role: "faculty",
				// Scoped accounts carry their unit — `submissionService.create`
				// resolves the caller's program from the DB row, never the body.
				programId: IDS.program,
				departmentId: IDS.department,
				isActive: true,
			},
			{
				id: IDS.other,
				name: "Forms Other",
				email: "forms-other@obelisk.local",
				role: "faculty",
				programId: IDS.program,
				departmentId: IDS.department,
				isActive: true,
			},
			{
				id: IDS.chair,
				name: "Forms Chair",
				email: "forms-chair@obelisk.local",
				role: "program_chair",
				programId: IDS.program,
				departmentId: IDS.department,
				isActive: true,
			},
		],
	});
	await prisma.formType.create({
		data: {
			id: IDS.rawType,
			code: RAW_DATA_CODE,
			name: "Per-Student CLO Raw Data Sheet",
			pdcaStage: "DO",
			sequenceNo: 7,
		},
	});
	await prisma.formType.create({
		data: {
			id: IDS.carType,
			code: CAR_CODE,
			name: "Course Assessment Report (CAR)",
			pdcaStage: "CHECK",
			sequenceNo: 13,
		},
	});
	await prisma.formType.create({
		data: {
			id: IDS.consultType,
			code: CONSULT_CODE,
			name: "Stakeholder Consultation Records",
			pdcaStage: "PLAN",
			sequenceNo: 5,
		},
	});
}

async function cleanup() {
	await prisma.formSubmission.deleteMany({
		where: {
			formTypeId: { in: [IDS.rawType, IDS.carType, IDS.consultType] },
		},
	});
	await prisma.formType.deleteMany({
		where: { id: { in: [IDS.rawType, IDS.carType, IDS.consultType] } },
	});
	// Section fixtures — deleting the section cascades the attainment row.
	await prisma.classSection.deleteMany({
		where: { id: { in: [IDS.classSection, IDS.sectionNoRun] } },
	});
	await prisma.computationRun.deleteMany({ where: { id: IDS.computationRun } });
	await prisma.clo.deleteMany({ where: { id: IDS.clo } });
	await prisma.student.deleteMany({ where: { id: IDS.student } });
	await prisma.course.deleteMany({ where: { id: IDS.course } });
	await prisma.program.deleteMany({ where: { id: IDS.program } });
	await prisma.department.deleteMany({ where: { id: IDS.department } });
	await prisma.user.deleteMany({
		where: { id: { in: [IDS.owner, IDS.other, IDS.chair] } },
	});
	await prisma.academicTerm.delete({ where: { id: IDS.term } });
}

describe.skipIf(!db)("forms service (integration)", () => {
	it("derives the chain server-side and enforces workflow RBAC", async () => {
		await seed();
		try {
			// --- submit: server-derived chain -----------------------------------
			// NOTE: program-bound like every real CAR `…/init`; the approval-free
			// `clo_raw_data` path is covered by its own test below.
			const draft = await submissionService.create(
				{
					formTypeId: IDS.carType,
					programId: IDS.program,
					termId: IDS.term,
					formData: { note: "seed" },
				},
				IDS.owner,
			);
			expect(draft.status).toBe("draft");

			// Non-owner with a preparer role cannot submit.
			await expect(
				submissionService.submit(draft.id, IDS.other, "faculty"),
			).rejects.toThrow(NotOwnerError);

			// Owner with a non-preparer role cannot submit.
			await expect(
				submissionService.submit(draft.id, IDS.owner, "dean"),
			).rejects.toThrow(ApprovalForbiddenError);

			// Never submitted yet → no audit row, so no signature date.
			expect(await submissionService.submittedAt(draft.id)).toBeNull();

			const submitted = await submissionService.submit(
				draft.id,
				IDS.owner,
				"faculty",
			);
			expect(submitted.status).toBe("submitted");
			expect(submitted.currentApproverRole).toBe("program_chair");
			// Derived from the registry — the ladder runs chair → dean → aqau → vpaa.
			expect(submitted.formType.code).toBe(CAR_CODE);
			expect(submitted.approvalSteps).toHaveLength(4);
			expect(submitted.approvalSteps.map((s) => s.approverRole)).toEqual([
				"program_chair",
				"dean",
				"aqau",
				"vpaa",
			]);
			expect(submitted.approvalSteps[0].approverRole).toBe("program_chair");
			expect(submitted.approvalSteps[0].sequenceNo).toBe(1);
			// No one has signed yet → the signature row has no printed name.
			expect(submitted.approvalSteps[0].approver).toBeNull();
			// The "Prepared by — date" row reads the audit trail, not `updatedAt`.
			const submittedAt = await submissionService.submittedAt(draft.id);
			expect(submittedAt).not.toBeNull();
			expect(
				Date.now() - new Date(submittedAt as string).getTime(),
			).toBeLessThan(60_000);

			// --- inbox scopes -----------------------------------------------------
			const mine = await submissionService.list(
				scopeWhere("mine", { id: IDS.owner, role: "faculty" }),
			);
			expect(mine.map((s) => s.id)).toContain(draft.id);

			const mineOther = await submissionService.list(
				scopeWhere("mine", { id: IDS.other, role: "faculty" }),
			);
			expect(mineOther.map((s) => s.id)).not.toContain(draft.id);

			// NOTE: an omitted scope defaults to the caller's own rows — the
			// dashboard's `GET /forms` (which sends no `scope`) must not serve
			// another user's submissions to any role, admin included.
			const noScopeOwner = await submissionService.list(
				scopeWhere(undefined, { id: IDS.owner, role: "faculty" }),
			);
			expect(noScopeOwner.map((s) => s.id)).toContain(draft.id);

			const noScopeOther = await submissionService.list(
				scopeWhere(undefined, { id: IDS.other, role: "system_admin" }),
			);
			expect(noScopeOther.map((s) => s.id)).not.toContain(draft.id);

			// `visible` = chain-entitled read: own + every form whose registered
			// chain holds the caller's role (the dashboard's scope).
			// Owner (faculty) still sees their own submission.
			const visibleOwner = await submissionService.list(
				scopeWhere("visible", { id: IDS.owner, role: "faculty" }),
			);
			expect(visibleOwner.map((s) => s.id)).toContain(draft.id);

			// Another faculty member sits in no approver chain → own rows only,
			// so the colleague's submission stays invisible to them.
			const visibleOtherFaculty = await submissionService.list(
				scopeWhere("visible", { id: IDS.other, role: "faculty" }),
			);
			expect(visibleOtherFaculty.map((s) => s.id)).not.toContain(draft.id);

			// The chain runs program_chair → dean → aqau → vpaa, so those roles
			// see a submission they did not prepare (it must reach their step).
			// The program-scoped (chair) and department-scoped (dean) callers
			// carry their unit — the session is what narrows `visible`.
			for (const role of ["program_chair", "dean", "aqau", "vpaa"]) {
				const unit =
					role === "program_chair"
						? { programId: IDS.program }
						: role === "dean"
							? { departmentId: IDS.department }
							: {};
				const visibleApprover = await submissionService.list(
					scopeWhere("visible", { id: IDS.other, role, ...unit }),
				);
				expect(visibleApprover.map((s) => s.id)).toContain(draft.id);
			}

			const pendingChair = await submissionService.list(
				scopeWhere("pending", {
					id: "any",
					role: "program_chair",
					programId: IDS.program,
				}),
			);
			expect(pendingChair.map((s) => s.id)).toContain(draft.id);

			const pendingDean = await submissionService.list(
				scopeWhere("pending", {
					id: "any",
					role: "dean",
					departmentId: IDS.department,
				}),
			);
			expect(pendingDean.map((s) => s.id)).not.toContain(draft.id);

			const pendingAdmin = await submissionService.list(
				scopeWhere("pending", { id: "any", role: "system_admin" }),
			);
			expect(pendingAdmin.map((s) => s.id)).toContain(draft.id);

			// Non-approver roles get an empty pending scope (no invalid enum).
			const pendingFaculty = await submissionService.list(
				scopeWhere("pending", { id: IDS.owner, role: "faculty" }),
			);
			expect(pendingFaculty).toHaveLength(0);

			// Institution-wide `all` scope — the VPAA archive screen's list.
			const allVpaa = await submissionService.list(
				scopeWhere("all", { id: "any", role: "vpaa" }),
			);
			expect(allVpaa.map((s) => s.id)).toContain(draft.id);

			const allAdmin = await submissionService.list(
				scopeWhere("all", { id: "any", role: "system_admin" }),
			);
			expect(allAdmin.map((s) => s.id)).toContain(draft.id);

			// NOTE: a spoofed `scope=all` from any other role matches nothing.
			const allFaculty = await submissionService.list(
				scopeWhere("all", { id: IDS.owner, role: "faculty" }),
			);
			expect(allFaculty).toHaveLength(0);

			// --- decide: role match + admin override ------------------------------
			await expect(
				submissionService.decide(
					draft.id,
					"program_chair",
					IDS.other,
					"faculty",
					{
						decision: "approved",
					},
				),
			).rejects.toThrow(ApprovalForbiddenError);

			const chairApproved = await submissionService.decide(
				draft.id,
				"program_chair",
				IDS.other,
				"system_admin",
				{ decision: "approved", comment: "looks good" },
			);
			// Chair signs first (admin override) → the submission keeps descending.
			expect(chairApproved.status).toBe("submitted");
			expect(chairApproved.currentApproverRole).toBe("dean");
			expect(chairApproved.approvalSteps[0].decision).toBe("approved");
			expect(chairApproved.approvalSteps[0].comment).toBe("looks good");
			// The signature block needs the printed name, not just `approverUserId`.
			expect(chairApproved.approvalSteps[0].approver).toEqual({
				id: IDS.other,
				name: "Forms Other",
				role: "faculty",
			});
			// Later rungs are still unsigned → no approver joined yet.
			expect(chairApproved.approvalSteps[1].approver).toBeNull();
			// Only the current step's role sees it as pending now.
			expect(
				(
					await submissionService.list(
						scopeWhere("pending", {
							id: "any",
							role: "program_chair",
							programId: IDS.program,
						}),
					)
				).map((s) => s.id),
			).not.toContain(draft.id);
			expect(
				(
					await submissionService.list(
						scopeWhere("pending", {
							id: "any",
							role: "dean",
							departmentId: IDS.department,
						}),
					)
				).map((s) => s.id),
			).toContain(draft.id);

			// dean → aqau → vpaa each sign their own step; the VPAA closes it.
			const deanApproved = await submissionService.decide(
				draft.id,
				"dean",
				IDS.other,
				"dean",
				{ decision: "approved" },
			);
			expect(deanApproved.status).toBe("submitted");
			expect(deanApproved.currentApproverRole).toBe("aqau");

			const aqauApproved = await submissionService.decide(
				draft.id,
				"aqau",
				IDS.other,
				"aqau",
				{ decision: "approved" },
			);
			expect(aqauApproved.status).toBe("submitted");
			expect(aqauApproved.currentApproverRole).toBe("vpaa");

			const approved = await submissionService.decide(
				draft.id,
				"vpaa",
				IDS.other,
				"vpaa",
				{ decision: "approved" },
			);
			// Final step (top of the hierarchy) → approved.
			expect(approved.status).toBe("approved");
			expect(approved.currentApproverRole).toBeNull();
			expect(approved.approvalSteps).toHaveLength(4);
			expect(
				approved.approvalSteps.every((s) => s.decision === "approved"),
			).toBe(true);

			// --- archive: role-gated (vpaa/system_admin only) ---------------------
			await expect(
				submissionService.archive(draft.id, IDS.owner, "faculty"),
			).rejects.toThrow(ApprovalForbiddenError);
			// aqau approves forms but may no longer archive.
			await expect(
				submissionService.archive(draft.id, IDS.owner, "aqau"),
			).rejects.toThrow(ApprovalForbiddenError);
			const archived = await submissionService.archive(
				draft.id,
				IDS.owner,
				"vpaa",
			);
			expect(archived.status).toBe("archived");
		} finally {
			await cleanup();
		}
	});

	it("advances a multi-step chain and supports return → resubmit", async () => {
		await seed();
		try {
			// --- multi-step chain advance (CAR: chair → dean → aqau → vpaa) ------
			const car = await submissionService.create(
				// Program-bound, like every real `…/init` — a scoped faculty may
				// only file under its own program.
				{
					formTypeId: IDS.carType,
					programId: IDS.program,
					termId: IDS.term,
					formData: {},
				},
				IDS.owner,
			);
			const submitted = await submissionService.submit(
				car.id,
				IDS.owner,
				"faculty",
			);
			expect(submitted.approvalSteps.map((s) => s.approverRole)).toEqual([
				"program_chair",
				"dean",
				"aqau",
				"vpaa",
			]);
			expect(submitted.currentApproverRole).toBe("program_chair");

			// Dean cannot decide the program_chair step.
			await expect(
				submissionService.decide(car.id, "program_chair", IDS.other, "dean", {
					decision: "approved",
				}),
			).rejects.toThrow(ApprovalForbiddenError);

			const advanced = await submissionService.decide(
				car.id,
				"program_chair",
				IDS.other,
				"program_chair",
				{ decision: "approved" },
			);
			expect(advanced.status).toBe("submitted");
			expect(advanced.currentApproverRole).toBe("dean");

			// Return from the dean step → editable again → resubmit rebuilds the chain.
			const returned = await submissionService.decide(
				car.id,
				"dean",
				IDS.other,
				"dean",
				{ decision: "returned", comment: "fix part 3" },
			);
			expect(returned.status).toBe("returned");
			expect(returned.currentApproverRole).toBeNull();

			// --- update ownership (returned = editable) ----------------------------
			await expect(
				submissionService.update(car.id, IDS.other, "faculty", {
					formData: { hijacked: true },
				}),
			).rejects.toThrow(NotOwnerError);
			const updated = await submissionService.update(
				car.id,
				IDS.owner,
				"faculty",
				{ formData: { fixed: true } },
			);
			expect(updated.formData).toEqual({ fixed: true });

			// Owner edits then resubmits → the chain is rebuilt from scratch.
			const resubmitted = await submissionService.submit(
				car.id,
				IDS.owner,
				"faculty",
			);
			expect(resubmitted.status).toBe("submitted");
			expect(resubmitted.currentApproverRole).toBe("program_chair");
			// Old steps are replaced, not appended.
			expect(resubmitted.approvalSteps).toHaveLength(4);
			expect(
				resubmitted.approvalSteps.every((s) => s.decision === "pending"),
			).toBe(true);
		} finally {
			await cleanup();
		}
	});

	it("blocks self-approval and keeps the owner's own row out of their inbox", async () => {
		await seed();
		try {
			// A chair prepares `stakeholder_consultation` — preparers and rung 1
			// are both `program_chair`, the classic self-approval shape.
			// NOTE: `clo_raw_data` can no longer carry this test — Record-tagged
			// forms file with no steps to decide.
			const draft = await submissionService.create(
				{
					formTypeId: IDS.consultType,
					programId: IDS.program,
					termId: IDS.term,
					formData: { note: "chair-prepared" },
				},
				IDS.chair,
			);
			const submitted = await submissionService.submit(
				draft.id,
				IDS.chair,
				"program_chair",
			);
			expect(submitted.currentApproverRole).toBe("program_chair");

			// The owner's own pending row stays out of THEIR inbox...
			const pendingOwn = await submissionService.list(
				scopeWhere("pending", {
					id: IDS.chair,
					role: "program_chair",
					programId: IDS.program,
				}),
			);
			expect(pendingOwn.map((s) => s.id)).not.toContain(draft.id);
			// ...while the step still shows as pending for everyone else.
			const pendingAny = await submissionService.list(
				scopeWhere("pending", {
					id: "any",
					role: "program_chair",
					programId: IDS.program,
				}),
			);
			expect(pendingAny.map((s) => s.id)).toContain(draft.id);

			// The owner may not sign off on their own row.
			await expect(
				submissionService.decide(
					draft.id,
					"program_chair",
					IDS.chair,
					"program_chair",
					{ decision: "approved" },
				),
			).rejects.toThrow(ApprovalForbiddenError);

			// They may return (withdraw) it back to themselves.
			const returned = await submissionService.decide(
				draft.id,
				"program_chair",
				IDS.chair,
				"program_chair",
				{ decision: "returned", comment: "withdrawing to edit" },
			);
			expect(returned.status).toBe("returned");

			// Resubmitted → another holder of the same role signs it.
			await submissionService.submit(draft.id, IDS.chair, "program_chair");
			const advanced = await submissionService.decide(
				draft.id,
				"program_chair",
				IDS.other,
				"program_chair",
				{ decision: "approved" },
			);
			expect(advanced.status).toBe("submitted");
			expect(advanced.currentApproverRole).toBe("dean");
		} finally {
			await cleanup();
		}
	});

	it("files Setup/Record-tagged forms with no approval chain", async () => {
		await seed();
		try {
			// `clo_raw_data` is Record-tagged — the section's captured scores
			// satisfy the submit gate, and filing skips the chain entirely.
			const draft = await submissionService.create(
				{
					formTypeId: IDS.rawType,
					termId: IDS.term,
					classSectionId: IDS.classSection,
					formData: { note: "record" },
				},
				IDS.owner,
			);
			const filed = await submissionService.submit(
				draft.id,
				IDS.owner,
				"faculty",
			);
			expect(filed.status).toBe("approved");
			expect(filed.currentApproverRole).toBeNull();
			expect(filed.approvalSteps).toHaveLength(0);

			// It never lands in anyone's pending inbox, not even the admin's.
			const pendingAdmin = await submissionService.list(
				scopeWhere("pending", { id: "any", role: "system_admin" }),
			);
			expect(pendingAdmin.map((s) => s.id)).not.toContain(draft.id);

			// The audit trail still records the filing (the "Prepared by" date).
			expect(await submissionService.submittedAt(draft.id)).not.toBeNull();
		} finally {
			await cleanup();
		}
	});

	it("scopes submission reads by visibility and returns section evidence", async () => {
		await seed();
		try {
			const draft = await submissionService.create(
				{
					formTypeId: IDS.rawType,
					termId: IDS.term,
					classSectionId: IDS.classSection,
					formData: { note: "seed" },
				},
				IDS.owner,
			);

			// Owner and a chain role read it; an unrelated faculty member does not.
			expect(
				(
					await submissionService.getForViewer(draft.id, {
						id: IDS.owner,
						role: "faculty",
					})
				).id,
			).toBe(draft.id);
			expect(
				(
					await submissionService.getForViewer(draft.id, {
						id: IDS.chair,
						role: "program_chair",
						programId: IDS.program,
					})
				).id,
			).toBe(draft.id);
			await expect(
				submissionService.getForViewer(draft.id, {
					id: IDS.other,
					role: "faculty",
				}),
			).rejects.toThrow(SubmissionForbiddenError);
			// system_admin bypasses the visibility check.
			expect(
				(
					await submissionService.getForViewer(draft.id, {
						id: IDS.other,
						role: "system_admin",
					})
				).id,
			).toBe(draft.id);
			await expect(
				submissionService.getForViewer("it-forms-missing", {
					id: IDS.owner,
					role: "faculty",
				}),
			).rejects.toThrow(SubmissionNotFoundError);

			// Evidence carries the bound section and its capture summary.
			const evidence = await submissionService.evidence(draft.id, {
				id: IDS.chair,
				role: "program_chair",
				programId: IDS.program,
			});
			expect(evidence.code).toBe(RAW_DATA_CODE);
			expect(evidence.classSection).toMatchObject({
				id: IDS.classSection,
				sectionCode: "F1",
				course: { code: "IT-FORMS-101" },
			});
			expect(evidence.capture).toMatchObject({
				attainmentRows: 1,
				students: 1,
				belowThresholdRows: 0,
				atRiskStudents: 0,
				computationRunId: IDS.computationRun,
			});
			expect(evidence.formData).toEqual({ note: "seed" });
			// `clo_raw_data` resolves the same section justification as the CAR
			// (widened scope) — the resolver ran against the bound section.
			expect(evidence.justification).not.toBeNull();
			expect(evidence.justification?.kind).toBe("car");

			// A section-less submission has nothing to summarize.
			const bare = await submissionService.create(
				{
					formTypeId: IDS.carType,
					programId: IDS.program,
					termId: IDS.term,
					formData: { a: 1 },
				},
				IDS.owner,
			);
			const bareEvidence = await submissionService.evidence(bare.id, {
				id: IDS.owner,
				role: "faculty",
			});
			expect(bareEvidence.code).toBe(CAR_CODE);
			expect(bareEvidence.classSection).toBeNull();
			expect(bareEvidence.capture).toBeNull();
			// Registered code, but a CAR resolver needs a bound section.
			expect(bareEvidence.justification).toBeNull();

			// Bound to a section with no run yet: the resolver explains the
			// missing capture instead of degrading to the generic empty state.
			const noRun = await submissionService.create(
				{
					formTypeId: IDS.rawType,
					termId: IDS.term,
					classSectionId: IDS.sectionNoRun,
					formData: {},
				},
				IDS.owner,
			);
			const noRunEvidence = await submissionService.evidence(noRun.id, {
				id: IDS.owner,
				role: "faculty",
			});
			expect(noRunEvidence.capture).toMatchObject({
				attainmentRows: 0,
				computationRunId: null,
			});
			expect(noRunEvidence.justification).toMatchObject({
				kind: "car",
				rows: [],
				assessmentEvidence: [],
				coverage: null,
				uncoveredPlos: [],
			});
			expect(noRunEvidence.justification?.notes[0]).toContain(
				"No class records captured for this section yet",
			);
		} finally {
			await cleanup();
		}
	});
});
