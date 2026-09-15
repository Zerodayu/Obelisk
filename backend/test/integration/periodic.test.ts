import { describe, expect, it } from "bun:test";
import { prisma } from "@lib/prisma";
import { isDbReachable } from "@test/helpers/db-gate";
import {
	alumniTracerService,
	capaPlanService,
	employerSurveyService,
	institutionalReviewService,
	portfolioRoadmapService,
	resourceMonitoringService,
	systemicGapReportService,
} from "@v1/periodic/service";

const db = await isDbReachable();

const IDS = {
	department: "it-per-dept",
	program: "it-per-prog",
	term: "it-per-term",
	user: "it-per-user",
};

async function seedAcademicChain() {
	await prisma.department.create({
		data: {
			id: IDS.department,
			name: "Integration Periodic Dept",
			code: "IT-PER",
		},
	});
	await prisma.program.create({
		data: {
			id: IDS.program,
			departmentId: IDS.department,
			name: "Integration Periodic Program",
			code: "IT-PER-PROG",
		},
	});
	await prisma.academicTerm.upsert({
		where: { id: IDS.term },
		create: {
			id: IDS.term,
			schoolYear: "2098-2099",
			semester: "2nd",
			isActive: false,
		},
		update: {},
	});
	await prisma.user.create({
		data: {
			id: IDS.user,
			name: "Periodic Test User",
			email: "periodic@obelisktest.local",
		},
	});
}

const PERIODIC_FORM_CODES = [
	"resource_monitoring",
	"alumni_tracer",
	"employer_satisfaction_survey",
	"systemic_gap_report",
	"capa_plan",
	"institutional_review",
	"portfolio_roadmap",
	"cohort_tracking",
];

async function resetPeriodicData() {
	await prisma.resourceItemRow.deleteMany({
		where: { resourceMonitorId: { contains: "it-" } },
	});
	await prisma.cqiImplementRow.deleteMany({
		where: { resourceMonitorId: { contains: "it-" } },
	});
	await prisma.portfolioRoadmapRow.deleteMany({
		where: { portfolioRoadmapId: { contains: "it-" } },
	});
	await prisma.portfolioRubricRow.deleteMany({
		where: { portfolioRoadmapId: { contains: "it-" } },
	});
	await prisma.auditLog.deleteMany({
		where: { targetRecordId: { contains: "it-" } },
	});
	await prisma.formSubmission.deleteMany({
		where: { programId: IDS.program },
	});
	await prisma.formType.deleteMany({
		where: { code: { in: PERIODIC_FORM_CODES } },
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
	await prisma.resourceItemRow.deleteMany({
		where: { resourceMonitorId: { in: draftIds } },
	});
	await prisma.cqiImplementRow.deleteMany({
		where: { resourceMonitorId: { in: draftIds } },
	});
	await prisma.portfolioRoadmapRow.deleteMany({
		where: { portfolioRoadmapId: { in: draftIds } },
	});
	await prisma.portfolioRubricRow.deleteMany({
		where: { portfolioRoadmapId: { in: draftIds } },
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

describe.skipIf(!db)("Periodic module (integration)", () => {
	it("F09 resource_monitoring: init → save resource + CQI implement rows → get", async () => {
		await resetPeriodicData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const draft = await resourceMonitoringService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(draft.id);

			const saved = await resourceMonitoringService.save(draft.id, IDS.user, {
				header: {
					program: "BSIT",
					dean: "Dr. Reyes",
					academicYear: "2095-2096",
				},
				resourceItems: [
					{
						name: "Assessment Software",
						phase: "do",
						acquisitionStatus: "acquired",
					},
					{
						name: "Lab Equipment",
						phase: "check",
						acquisitionStatus: "pending",
					},
				],
				cqiImplementRows: [
					{
						interventionDescription: "Faculty training on rubrics",
						implementationStatus: "fully",
					},
				],
			});

			expect(saved.id).toBe(draft.id);
			expect(saved.resourceItems).toHaveLength(2);
			expect(saved.cqiImplementRows).toHaveLength(1);
			expect(saved.header).toMatchObject({ dean: "Dr. Reyes" });
		} finally {
			await cleanup(draftIds);
		}
	});

	it("F20 alumni_tracer: save and retrieve via formData", async () => {
		await resetPeriodicData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const draft = await alumniTracerService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(draft.id);

			const saved = await alumniTracerService.save(draft.id, IDS.user, {
				header: { program: "BSIT", totalRespondents: 80 },
				ploRows: [
					{ ploCode: "PLO1", pctSufficient: 75, alumniAvgRating: 3.2 },
					{ ploCode: "PLO2", pctSufficient: 60, alumniAvgRating: 2.8 },
				],
				employmentIndicators: [
					{
						indicator: "Employment Rate",
						respondents: 80,
						pct: 85,
						benchmark: 80,
					},
				],
			});

			expect(saved.ploRows).toHaveLength(2);
			expect(saved.employmentIndicators).toHaveLength(1);
		} finally {
			await cleanup(draftIds);
		}
	});

	it("F21 employer_satisfaction_survey: save and retrieve via formData", async () => {
		await resetPeriodicData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const draft = await employerSurveyService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(draft.id);

			const saved = await employerSurveyService.save(draft.id, IDS.user, {
				header: { program: "BSIT", employerOrgsSurveyed: 12 },
				employerProfiles: [
					{ organizationName: "Acme Corp", industrySector: "IT" },
				],
				ploRows: [
					{
						ploCode: "PLO1",
						avgRating: 3.5,
						pctSatisfactory: 80,
						benchmarkStatus: "MET",
					},
				],
			});

			expect(saved.employerProfiles).toHaveLength(1);
			expect(saved.ploRows).toHaveLength(1);
			expect(saved.ploRows).toEqual([
				expect.objectContaining({ benchmarkStatus: "MET" }),
			]);
		} finally {
			await cleanup(draftIds);
		}
	});

	it("F26 systemic_gap_report: submit gate blocks without approved cohort_tracking", async () => {
		await resetPeriodicData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const draft = await systemicGapReportService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(draft.id);

			await systemicGapReportService.save(draft.id, IDS.user, {
				header: { program: "BSIT", dean: "Dr. Reyes" },
				cycleRows: [
					{
						ayCycle: "2023-2024 S1",
						ploAttainmentPct: 55,
						status: "NOT_MET",
					},
					{
						ayCycle: "2024-2025 S1",
						ploAttainmentPct: 50,
						status: "NOT_MET",
					},
					{
						ayCycle: "2025-2026 S1",
						ploAttainmentPct: 48,
						status: "NOT_MET",
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
			).rejects.toThrow(/Cohort Tracking/);
		} finally {
			await cleanup(draftIds);
		}
	});

	it("F27 capa_plan: submit gate blocks without approved systemic gap report", async () => {
		await resetPeriodicData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const draft = await capaPlanService.init(IDS.program, IDS.term, IDS.user);
			draftIds.push(draft.id);

			await capaPlanService.save(draft.id, IDS.user, {
				header: {
					program: "BSIT",
					systemicGapReportId: "nonexistent-id",
				},
				actions: [
					{
						description: "Revise curriculum mapping",
						owner: "Dr. Reyes",
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
			).rejects.toThrow(/not approved/);
		} finally {
			await cleanup(draftIds);
		}
	});

	it("F27 capa_plan: max 8 actions validation", async () => {
		await resetPeriodicData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const draft = await capaPlanService.init(IDS.program, IDS.term, IDS.user);
			draftIds.push(draft.id);

			const tooManyActions = Array.from({ length: 9 }, (_, i) => ({
				description: `Action ${i + 1}`,
				owner: "Dr. Reyes",
			}));

			await expect(
				capaPlanService.save(draft.id, IDS.user, {
					actions: tooManyActions,
				}),
			).rejects.toThrow(/maximum of 8/);
		} finally {
			await cleanup(draftIds);
		}
	});

	it("F28 institutional_review: init → save → get", async () => {
		await resetPeriodicData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const draft = await institutionalReviewService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(draft.id);

			const saved = await institutionalReviewService.save(draft.id, IDS.user, {
				header: {
					meetingDate: "2096-07-15",
					qaDirector: "Dr. Admin",
				},
				programReviews: [
					{
						programCode: "BSIT",
						overallPloAttainmentPct: 75,
						ctlSubmitted: true,
						aparComplete: true,
					},
				],
				cqiCompletions: [
					{
						programCode: "BSIT",
						totalPlanned: 10,
						completed: 8,
						completionRatePct: 80,
					},
				],
			});

			expect(saved.programReviews).toHaveLength(1);
			expect(saved.cqiCompletions).toHaveLength(1);
			expect(saved.header).toMatchObject({ qaDirector: "Dr. Admin" });
		} finally {
			await cleanup(draftIds);
		}
	});

	it("F02 portfolio_roadmap: init → save roadmap + rubric rows → get", async () => {
		await resetPeriodicData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const draft = await portfolioRoadmapService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(draft.id);

			const saved = await portfolioRoadmapService.save(draft.id, IDS.user, {
				header: {
					program: "BSIT Portfolio",
					academicYear: "2095-2096",
				},
				roadmapRows: [
					{
						yearLevel: 1,
						milestone: "Foundation",
						description: "Basic skills portfolio",
					},
					{
						yearLevel: 2,
						milestone: "Development",
						description: "Intermediate projects",
					},
					{
						yearLevel: 3,
						milestone: "Application",
						description: "Applied projects",
					},
					{
						yearLevel: 4,
						milestone: "Capstone",
						description: "Capstone exhibition",
					},
				],
				rubricRows: [
					{
						criterionName: "Documentation",
						description: "Quality of written documentation",
						weightPct: 30,
						rubricLevels: [
							{
								level: "Beginning",
								descriptor: "Minimal documentation",
							},
							{
								level: "Proficient",
								descriptor: "Complete documentation",
							},
						],
					},
					{
						criterionName: "Presentation",
						description: "Quality of presentation",
						weightPct: 30,
						rubricLevels: [
							{ level: "Beginning", descriptor: "Poor delivery" },
							{
								level: "Proficient",
								descriptor: "Excellent delivery",
							},
						],
					},
					{
						criterionName: "Technical",
						description: "Technical depth",
						weightPct: 40,
						rubricLevels: [
							{
								level: "Beginning",
								descriptor: "Surface level",
							},
							{
								level: "Proficient",
								descriptor: "Deep understanding",
							},
						],
					},
				],
			});

			expect(saved.roadmapRows).toHaveLength(4);
			expect(saved.rubricRows).toHaveLength(3);
			expect(saved.roadmapRows[0].yearLevel).toBe(1);
			expect(saved.rubricRows[0].criterionName).toBe("Documentation");

			let totalWeight = 0;
			for (const r of saved.rubricRows) {
				totalWeight += Number(r.weightPct);
			}
			expect(totalWeight).toBe(100);
		} finally {
			await cleanup(draftIds);
		}
	});

	it("ensureDraft is idempotent — re-init returns same submission", async () => {
		await resetPeriodicData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			const d1 = await resourceMonitoringService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(d1.id);
			const d2 = await resourceMonitoringService.init(
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
