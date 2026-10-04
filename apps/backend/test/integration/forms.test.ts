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
 * Uses two registered form codes so the approval chain is derived from
 * `lib/forms/approval-routes.ts`:
 *  - `clo_raw_data`            → preparers [faculty], chain [program_chair]
 *  - `course_assessment_report` → preparers [faculty], chain [program_chair, dean, aqau]
 */
const RAW_DATA_CODE = "clo_raw_data";
const CAR_CODE = "course_assessment_report";

const IDS = {
	term: "it-forms-term",
	owner: "it-forms-owner",
	other: "it-forms-other",
	chair: "it-forms-chair",
	rawType: "it-forms-type-raw",
	carType: "it-forms-type-car",
	// Section fixtures — the `clo_raw_data` submit gate needs a class section
	// with at least one captured attainment row.
	department: "it-forms-dept",
	program: "it-forms-prog",
	course: "it-forms-course",
	classSection: "it-forms-section",
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
				isActive: true,
			},
			{
				id: IDS.other,
				name: "Forms Other",
				email: "forms-other@obelisk.local",
				role: "faculty",
				isActive: true,
			},
			{
				id: IDS.chair,
				name: "Forms Chair",
				email: "forms-chair@obelisk.local",
				role: "program_chair",
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
}

async function cleanup() {
	await prisma.formSubmission.deleteMany({
		where: { formTypeId: { in: [IDS.rawType, IDS.carType] } },
	});
	await prisma.formType.deleteMany({
		where: { id: { in: [IDS.rawType, IDS.carType] } },
	});
	// Section fixtures — deleting the section cascades the attainment row.
	await prisma.classSection.deleteMany({ where: { id: IDS.classSection } });
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
			const draft = await submissionService.create(
				{
					formTypeId: IDS.rawType,
					termId: IDS.term,
					classSectionId: IDS.classSection,
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

			const submitted = await submissionService.submit(
				draft.id,
				IDS.owner,
				"faculty",
			);
			expect(submitted.status).toBe("submitted");
			expect(submitted.currentApproverRole).toBe("program_chair");
			// Derived from the registry — one step for clo_raw_data.
			expect(submitted.formType.code).toBe(RAW_DATA_CODE);
			expect(submitted.approvalSteps).toHaveLength(1);
			expect(submitted.approvalSteps[0].approverRole).toBe("program_chair");
			expect(submitted.approvalSteps[0].sequenceNo).toBe(1);

			// --- inbox scopes -----------------------------------------------------
			const mine = await submissionService.list(
				scopeWhere("mine", { id: IDS.owner, role: "faculty" }),
			);
			expect(mine.map((s) => s.id)).toContain(draft.id);

			const mineOther = await submissionService.list(
				scopeWhere("mine", { id: IDS.other, role: "faculty" }),
			);
			expect(mineOther.map((s) => s.id)).not.toContain(draft.id);

			const pendingChair = await submissionService.list(
				scopeWhere("pending", { id: "any", role: "program_chair" }),
			);
			expect(pendingChair.map((s) => s.id)).toContain(draft.id);

			const pendingDean = await submissionService.list(
				scopeWhere("pending", { id: "any", role: "dean" }),
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

			const approved = await submissionService.decide(
				draft.id,
				"program_chair",
				IDS.other,
				"system_admin",
				{ decision: "approved", comment: "looks good" },
			);
			// Single-step chain → approved immediately.
			expect(approved.status).toBe("approved");
			expect(approved.approvalSteps[0].decision).toBe("approved");
			expect(approved.approvalSteps[0].comment).toBe("looks good");

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
			// --- multi-step chain advance (CAR: chair → dean → aqau) --------------
			const car = await submissionService.create(
				{ formTypeId: IDS.carType, termId: IDS.term, formData: {} },
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
			expect(resubmitted.approvalSteps).toHaveLength(3);
			expect(
				resubmitted.approvalSteps.every((s) => s.decision === "pending"),
			).toBe(true);
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

			// A section-less submission has nothing to summarize.
			const bare = await submissionService.create(
				{ formTypeId: IDS.carType, termId: IDS.term, formData: { a: 1 } },
				IDS.owner,
			);
			const bareEvidence = await submissionService.evidence(bare.id, {
				id: IDS.owner,
				role: "faculty",
			});
			expect(bareEvidence.code).toBe(CAR_CODE);
			expect(bareEvidence.classSection).toBeNull();
			expect(bareEvidence.capture).toBeNull();
		} finally {
			await cleanup();
		}
	});
});
