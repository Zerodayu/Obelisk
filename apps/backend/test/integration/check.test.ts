import { describe, expect, it } from "bun:test";
import { prisma } from "@lib/prisma";
import { isDbReachable } from "@test/helpers/db-gate";
import {
	capstonePanelEvaluationService,
	cloPerceptionSurveyService,
	exhibitionFeedbackService,
	midCycleAttainmentService,
	peerObservationService,
	portfolioAssessmentService,
	studentExitSurveyService,
} from "@v1/check/service";

const db = await isDbReachable();

const IDS = {
	department: "it-check-dept",
	program: "it-check-prog",
	term: "it-check-term",
	user: "it-check-user",
};

async function seedAcademicChain() {
	await prisma.department.create({
		data: {
			id: IDS.department,
			name: "Integration Check Dept",
			code: "IT-CHK",
		},
	});
	await prisma.program.create({
		data: {
			id: IDS.program,
			departmentId: IDS.department,
			name: "Integration Check Program",
			code: "IT-CHK-PROG",
		},
	});
	await prisma.academicTerm.upsert({
		where: { id: IDS.term },
		create: {
			id: IDS.term,
			schoolYear: "2097-2098",
			semester: "2nd",
			isActive: false,
		},
		update: {},
	});
	await prisma.user.create({
		data: {
			id: IDS.user,
			name: "Check Test User",
			email: "check@obelisktest.local",
		},
	});
}

const CHECK_FORM_CODES = [
	"mid_cycle_attainment",
	"peer_observation",
	"exhibition_feedback",
	"clo_perception_survey",
	"student_exit_survey",
	"portfolio_assessment_record",
	"capstone_panel_evaluation",
];

async function resetCheckData() {
	await prisma.midCycleCohortRow.deleteMany({
		where: { midCycleAttainmentId: { contains: "it-" } },
	});
	await prisma.exhibitionGuestRow.deleteMany({
		where: { exhibitionFeedbackId: { contains: "it-" } },
	});
	await prisma.portfolioCriterionRow.deleteMany({
		where: { portfolioAssessmentId: { contains: "it-" } },
	});
	await prisma.capstonePanelistRow.deleteMany({
		where: { capstonePanelEvalId: { contains: "it-" } },
	});
	await prisma.auditLog.deleteMany({
		where: { targetRecordId: { contains: "it-" } },
	});
	await prisma.formSubmission.deleteMany({
		where: { programId: IDS.program },
	});
	await prisma.formType.deleteMany({
		where: { code: { in: CHECK_FORM_CODES } },
	});
	await prisma.user.deleteMany({ where: { id: IDS.user } });
	await prisma.academicTerm.deleteMany({ where: { id: IDS.term } });
	await prisma.program.deleteMany({ where: { id: IDS.program } });
	await prisma.department.deleteMany({ where: { id: IDS.department } });
}

async function cleanup(draftIds: string[]) {
	await prisma.auditLog.deleteMany({
		where: { targetRecordId: { in: draftIds } },
	});
	await prisma.midCycleCohortRow.deleteMany({
		where: { midCycleAttainmentId: { in: draftIds } },
	});
	await prisma.exhibitionGuestRow.deleteMany({
		where: { exhibitionFeedbackId: { in: draftIds } },
	});
	await prisma.portfolioCriterionRow.deleteMany({
		where: { portfolioAssessmentId: { in: draftIds } },
	});
	await prisma.capstonePanelistRow.deleteMany({
		where: { capstonePanelEvalId: { in: draftIds } },
	});
	await prisma.formSubmission.deleteMany({
		where: { id: { in: draftIds } },
	});
}

async function fetchSubmissionForGate(submissionId: string) {
	const row = await prisma.formSubmission.findUnique({
		where: { id: submissionId },
		select: {
			id: true,
			formTypeId: true,
			status: true,
			programId: true,
			termId: true,
			formData: true,
		},
	});
	if (!row) throw new Error("submission not found");
	return {
		...row,
		formData: (row.formData ?? {}) as Record<string, unknown>,
	};
}

describe.skipIf(!db)("CHECK module (integration)", () => {
	it("F08 mid_cycle_attainment: init → save header + cohort rows → get", async () => {
		await resetCheckData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const draft = await midCycleAttainmentService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(draft.id);

			const saved = await midCycleAttainmentService.save(draft.id, IDS.user, {
				header: {
					courseTitle: "Test Course",
					courseCode: "TC-101",
					academicYear: "2095-2096",
				},
				cohortRows: [
					{
						yearLevel: 1,
						cloCode: "CLO1",
						attainmentPct: 75,
						studentCount: 30,
						belowTargetCount: 5,
					},
					{
						yearLevel: 2,
						cloCode: "CLO1",
						attainmentPct: 65,
						studentCount: 25,
						belowTargetCount: 10,
					},
				],
			});

			expect(saved.id).toBe(draft.id);
			expect(saved.status).toBe("draft");
			expect(saved.header).toMatchObject({ courseTitle: "Test Course" });
			expect(saved.cohortRows).toHaveLength(2);
			expect(saved.cohortRows[0].cloCode).toBe("CLO1");

			const audit = await prisma.auditLog.findFirst({
				where: {
					action: "mid_cycle_attainment.saved",
					targetRecordId: draft.id,
				},
			});
			expect(audit?.moduleAffected).toBe("check");
		} finally {
			await cleanup(draftIds);
		}
	});

	it("F10 peer_observation: init → save header + criteria → get", async () => {
		await resetCheckData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const draft = await peerObservationService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(draft.id);

			const saved = await peerObservationService.save(draft.id, IDS.user, {
				header: {
					facultyObserved: "Dr. Smith",
					course: "CS 101",
					observer: "Dr. Jones",
				},
				criteria: {
					obeSyllabusAlignment: "fully_aligned",
					bloomsLevel: "appropriate",
					cloAssessmentMapping: "clearly_evident",
					rubricUse: "used_aligned",
					formativeFeedback: "specific_clo_ref",
					activeExperientialLearning: "yes",
					studentEngagement: "high",
				},
				strengths: "Excellent OBE alignment",
				areasForImprovement: "More formative assessments",
			});

			expect(saved.id).toBe(draft.id);
			expect(saved.header).toMatchObject({ facultyObserved: "Dr. Smith" });
			expect(saved.criteria).toMatchObject({
				obeSyllabusAlignment: "fully_aligned",
				studentEngagement: "high",
			});
			expect(saved.strengths).toBe("Excellent OBE alignment");
		} finally {
			await cleanup(draftIds);
		}
	});

	it("F11 exhibition_feedback: submit gate blocks < 3 guests, passes with ≥3", async () => {
		await resetCheckData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const draft = await exhibitionFeedbackService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(draft.id);

			await exhibitionFeedbackService.save(draft.id, IDS.user, {
				header: { exhibitionTitle: "Capstone Expo" },
				guests: [
					{ guestName: "Guest A", ploRatings: { PLO1: 8 } },
					{ guestName: "Guest B", ploRatings: { PLO1: 7 } },
				],
			});

			await prisma.formSubmission.update({
				where: { id: draft.id },
				data: { status: "submitted" },
			});

			const { assertSubmitGate } = await import("@lib/forms/submit-gates");
			const submission = await fetchSubmissionForGate(draft.id);
			await expect(
				assertSubmitGate(submission.formTypeId, submission),
			).rejects.toThrow(/at least 3 industry guests/);

			await prisma.formSubmission.update({
				where: { id: draft.id },
				data: { status: "draft" },
			});

			await exhibitionFeedbackService.save(draft.id, IDS.user, {
				guests: [
					{ guestName: "Guest A", ploRatings: { PLO1: 8 } },
					{ guestName: "Guest B", ploRatings: { PLO1: 7 } },
					{ guestName: "Guest C", ploRatings: { PLO1: 9 } },
				],
			});

			const guestCount = await prisma.exhibitionGuestRow.count({
				where: { exhibitionFeedbackId: draft.id },
			});
			expect(guestCount).toBe(3);
		} finally {
			await cleanup(draftIds);
		}
	});

	it("F12 clo_perception_survey: init → save cloRows → get", async () => {
		await resetCheckData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const draft = await cloPerceptionSurveyService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(draft.id);

			const saved = await cloPerceptionSurveyService.save(draft.id, IDS.user, {
				header: {
					courseTitle: "CS 101",
					totalRespondents: 40,
					responseRatePct: 80,
				},
				cloRows: [
					{
						cloCode: "CLO1",
						statement: "Analyze problems",
						rating1Count: 2,
						rating2Count: 3,
						rating3Count: 10,
						rating4Count: 15,
						rating5Count: 10,
						directAttainmentPct: 72,
					},
				],
				divergenceNotes: "No significant divergence",
			});

			expect(saved.cloRows).toHaveLength(1);
			expect(saved.cloRows).toEqual([
				expect.objectContaining({ cloCode: "CLO1", rating4Count: 15 }),
			]);
			expect(saved.divergenceNotes).toBe("No significant divergence");
		} finally {
			await cleanup(draftIds);
		}
	});

	it("F17 student_exit_survey: init → save ploRows → get", async () => {
		await resetCheckData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const draft = await studentExitSurveyService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(draft.id);

			const saved = await studentExitSurveyService.save(draft.id, IDS.user, {
				header: {
					program: "BSIT",
					totalEnrolled: 120,
					totalRespondents: 100,
					responseRatePct: 83,
				},
				ploRows: [
					{
						ploCode: "PLO1",
						y1AvgRating: 3.5,
						y2AvgRating: 3.8,
						y3AvgRating: 4.0,
						y4AvgRating: 4.2,
					},
				],
			});

			expect(saved.ploRows).toHaveLength(1);
			expect(saved.ploRows).toEqual([
				expect.objectContaining({ ploCode: "PLO1" }),
			]);
		} finally {
			await cleanup(draftIds);
		}
	});

	it("F18 portfolio_assessment_record: init → save criteria rows → get", async () => {
		await resetCheckData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const draft = await portfolioAssessmentService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(draft.id);

			const saved = await portfolioAssessmentService.save(draft.id, IDS.user, {
				header: {
					studentName: "Juan Dela Cruz",
					studentId: "STU-001",
					portfolioEvent: "Formal Review",
				},
				criteriaRows: [
					{
						cloCode: "CLO1",
						criterionName: "Documentation",
						maxScore: 5,
						assessor1Score: 4,
						assessor2Score: 3,
						consensusScore: 3.5,
					},
					{
						cloCode: "CLO2",
						criterionName: "Presentation",
						maxScore: 5,
						assessor1Score: 5,
						assessor2Score: 4,
						consensusScore: 4.5,
					},
				],
			});

			expect(saved.criteriaRows).toHaveLength(2);
			expect(saved.criteriaRows[0].criterionName).toBe("Documentation");
		} finally {
			await cleanup(draftIds);
		}
	});

	it("F19 capstone_panel_evaluation: submit gate blocks < 2 faculty + 1 industry", async () => {
		await resetCheckData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const draft = await capstonePanelEvaluationService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(draft.id);

			await capstonePanelEvaluationService.save(draft.id, IDS.user, {
				header: {
					studentName: "Test Student",
					capstoneTitle: "AI System",
				},
				panelistRows: [
					{
						panelistName: "Dr. A",
						panelistRole: "faculty",
						ploRatings: { PLO1: 8 },
					},
					{
						panelistName: "Mr. B",
						panelistRole: "industry",
						ploRatings: { PLO1: 7 },
					},
				],
			});

			await prisma.formSubmission.update({
				where: { id: draft.id },
				data: { status: "submitted" },
			});

			const { assertSubmitGate } = await import("@lib/forms/submit-gates");
			const submission = await fetchSubmissionForGate(draft.id);
			await expect(
				assertSubmitGate(submission.formTypeId, submission),
			).rejects.toThrow(/at least 2 faculty/);

			await prisma.formSubmission.update({
				where: { id: draft.id },
				data: { status: "draft" },
			});

			await capstonePanelEvaluationService.save(draft.id, IDS.user, {
				panelistRows: [
					{
						panelistName: "Dr. A",
						panelistRole: "faculty",
						ploRatings: { PLO1: 8 },
					},
					{
						panelistName: "Dr. C",
						panelistRole: "faculty",
						ploRatings: { PLO1: 9 },
					},
					{
						panelistName: "Mr. B",
						panelistRole: "industry",
						ploRatings: { PLO1: 7 },
					},
				],
			});

			const panelists = await prisma.capstonePanelistRow.findMany({
				where: { capstonePanelEvalId: draft.id },
			});
			const faculty = panelists.filter((p) => p.panelistRole === "faculty");
			const industry = panelists.filter((p) => p.panelistRole === "industry");
			expect(faculty.length).toBeGreaterThanOrEqual(2);
			expect(industry.length).toBeGreaterThanOrEqual(1);
		} finally {
			await cleanup(draftIds);
		}
	});

	it("ensureDraft is idempotent — re-init returns same submission", async () => {
		await resetCheckData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const d1 = await peerObservationService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(d1.id);
			const d2 = await peerObservationService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			expect(d2.id).toBe(d1.id);
		} finally {
			await cleanup(draftIds);
		}
	});
});
