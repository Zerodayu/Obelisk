import { describe, expect, it } from "bun:test";
import { prisma } from "@lib/prisma";
import { isDbReachable } from "@test/helpers/db-gate";
import {
	annualProgramReportService,
	closingTheLoopService,
	cqiActionPlanService,
	ploGapAnalysisService,
} from "@v1/cqi/service";
import { submissionService } from "@v1/forms/service";
import { attainmentService } from "@v1/ingest/service";

const db = await isDbReachable();

const IDS = {
	department: "it-cqi-dept",
	program: "it-cqi-prog",
	programName: "Integration Test CQI Program",
	term: "it-cqi-term",
	course: "it-cqi-course",
	section: "it-cqi-section",
	user: "it-cqi-user",
	plo1: "it-cqi-plo-1",
	clo1: "it-cqi-clo-1",
	clo2: "it-cqi-clo-2",
	student1: "it-cqi-stu-1",
	student1Number: "IT-CQI-0001",
	student2: "it-cqi-stu-2",
	student2Number: "IT-CQI-0002",
};

async function seedAcademicChain() {
	await prisma.department.create({
		data: { id: IDS.department, name: "Integration CQI Dept", code: "IT-CQI" },
	});
	await prisma.program.create({
		data: {
			id: IDS.program,
			departmentId: IDS.department,
			name: IDS.programName,
			code: "IT-CQI-PROG",
		},
	});
	await prisma.academicTerm.create({
		data: {
			id: IDS.term,
			schoolYear: "2095-2096",
			semester: "2nd",
			isActive: false,
		},
	});
	await prisma.course.create({
		data: {
			id: IDS.course,
			programId: IDS.program,
			code: "CQI-101",
			title: "CQI Test Course",
		},
	});
	await prisma.classSection.create({
		data: {
			id: IDS.section,
			courseId: IDS.course,
			termId: IDS.term,
			sectionCode: "T1",
		},
	});
	await prisma.plo.create({
		data: {
			id: IDS.plo1,
			programId: IDS.program,
			code: "PLO1",
			description: "CQI PLO 1",
			targetAttainmentPct: 70,
		},
	});
	await prisma.clo.create({
		data: {
			id: IDS.clo1,
			courseId: IDS.course,
			code: "CLO1",
			description: "CQI CLO 1",
		},
	});
	await prisma.clo.create({
		data: {
			id: IDS.clo2,
			courseId: IDS.course,
			code: "CLO2",
			description: "CQI CLO 2",
		},
	});
	await prisma.cloToPloMap.create({
		data: { id: "it-cqi-map-1", cloId: IDS.clo1, ploId: IDS.plo1, weight: 1 },
	});
	await prisma.cloToPloMap.create({
		data: { id: "it-cqi-map-2", cloId: IDS.clo2, ploId: IDS.plo1, weight: 1 },
	});
	await prisma.user.create({
		data: {
			id: IDS.user,
			name: "CQI User",
			email: "cqi@obelisktest.local",
		},
	});
}

async function seedStudents() {
	await prisma.student.create({
		data: {
			id: IDS.student1,
			studentNumber: IDS.student1Number,
			programId: IDS.program,
			yearLevel: 1,
			firstName: "Ana",
			lastName: "Santos",
			anonymizedId: "it-cqi-anon-1",
		},
	});
	await prisma.student.create({
		data: {
			id: IDS.student2,
			studentNumber: IDS.student2Number,
			programId: IDS.program,
			yearLevel: 2,
			firstName: "Bianca",
			lastName: "Lim",
			anonymizedId: "it-cqi-anon-2",
		},
	});
}

function classRecord() {
	return {
		header: {
			course_code: "CQI-101",
			section: "T1",
			course_type: "lecture",
			semester_year: "2095-2096 2nd",
			no_of_students: 2,
			threshold: 0.7,
		},
		clo_plo_mapping: [
			{ clo_code: "CLO1", plo_code: "PLO1", correlation_strength: 3 },
			{ clo_code: "CLO2", plo_code: "PLO1", correlation_strength: 3 },
		],
		attainments: [
			{
				student_name: "Santos, Ana",
				student_id: IDS.student1Number,
				clo_code: "CLO1",
				direct_clo_attainment_pct: 0.85,
				met_threshold: true,
				exam_pct: 0.8,
			},
			{
				student_name: "Santos, Ana",
				student_id: IDS.student1Number,
				clo_code: "CLO2",
				direct_clo_attainment_pct: 0.9,
				met_threshold: true,
				at_pct: 0.9,
			},
			{
				student_name: "Lim, Bianca",
				student_id: IDS.student2Number,
				clo_code: "CLO1",
				direct_clo_attainment_pct: 0.95,
				met_threshold: true,
				tla_pct: 0.95,
			},
			{
				student_name: "Lim, Bianca",
				student_id: IDS.student2Number,
				clo_code: "CLO2",
				direct_clo_attainment_pct: 0.4,
				met_threshold: false,
				output_pct: 0.4,
			},
		],
	};
}

const CQI_FORM_CODES = [
	"plo_gap_analysis",
	"cqi_action_plan",
	"annual_program_report",
	"closing_the_loop",
	"cohort_tracking",
];

/** Clears any rows left over by an aborted earlier run (timeouts skip `finally`). */
async function resetCqiData() {
	await prisma.atRiskFlag.deleteMany({
		where: { studentId: { in: [IDS.student1, IDS.student2] } },
	});
	await prisma.cloAttainment.deleteMany({
		where: { classSectionId: IDS.section },
	});
	await prisma.ploAttainment.deleteMany({ where: { programId: IDS.program } });
	await prisma.computationRun.deleteMany({
		where: {
			scope: { in: [IDS.section, `plo:${IDS.program}:${IDS.term}`] },
		},
	});
	await prisma.gapRow.deleteMany({
		where: { ploGapAnalysisId: { not: undefined } },
	});
	await prisma.cqiEntry.deleteMany({
		where: { cqiActionPlanId: { not: undefined } },
	});
	await prisma.ctlRow.deleteMany({
		where: { closingTheLoopId: { not: undefined } },
	});
	await prisma.formSubmission.deleteMany({
		where: {
			OR: [{ classSectionId: IDS.section }, { programId: IDS.program }],
		},
	});
	await prisma.student.deleteMany({ where: { programId: IDS.program } });
	await prisma.cloToPloMap.deleteMany({
		where: { cloId: { in: [IDS.clo1, IDS.clo2] } },
	});
	await prisma.clo.deleteMany({ where: { courseId: IDS.course } });
	await prisma.plo.deleteMany({ where: { programId: IDS.program } });
	await prisma.classSection.deleteMany({ where: { id: IDS.section } });
	await prisma.course.deleteMany({ where: { programId: IDS.program } });
	await prisma.academicTerm.deleteMany({ where: { id: IDS.term } });
	await prisma.program.deleteMany({ where: { id: IDS.program } });
	await prisma.department.deleteMany({ where: { id: IDS.department } });
	await prisma.user.deleteMany({ where: { id: IDS.user } });
	await prisma.formType.deleteMany({ where: { code: { in: CQI_FORM_CODES } } });
}

async function cleanup(draftIds: string[]) {
	await prisma.auditLog.deleteMany({
		where: { targetRecordId: { in: draftIds } },
	});
	await prisma.ctlRow.deleteMany({
		where: { closingTheLoopId: { in: draftIds } },
	});
	await prisma.cqiEntry.deleteMany({
		where: { cqiActionPlanId: { in: draftIds } },
	});
	await prisma.gapRow.deleteMany({
		where: { ploGapAnalysisId: { in: draftIds } },
	});
	await prisma.formSubmission.deleteMany({ where: { id: { in: draftIds } } });
}

describe.skipIf(!db)("CQI / ACT loop chain (integration)", () => {
	it("exit check: a gap is traced from analysis → CQI plan → loop closure with computed CLOSED", async () => {
		await resetCqiData();
		await seedAcademicChain();
		await seedStudents();
		const draftIds: string[] = [];
		try {
			await attainmentService.persistAttainment(classRecord(), IDS.section);

			// F22: cohort 2 (YL2 avg of 95 and 40 = 67.5) is NOT MET → one gap row.
			const gapDraft = await ploGapAnalysisService.ensureDraft(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(gapDraft.id);
			const gapPayload = await ploGapAnalysisService.generate(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			expect(gapPayload.formSubmissionId).toBe(gapDraft.id);
			expect(gapPayload.plos).toHaveLength(1);
			expect(gapPayload.plos[0]).toMatchObject({
				ploCode: "PLO1",
				programAvgPct: 77.5,
				status: "partial",
				notMetCohorts: 1,
			});
			expect(gapPayload.gapRows).toHaveLength(1);
			const gapRow = gapPayload.gapRows[0];
			expect(gapRow).toMatchObject({
				ploCode: "PLO1",
				cohortYearLevel: 2,
				attainmentPct: 67.5,
				cqiActionPlanEntryId: null,
			});

			const gapAudit = await prisma.auditLog.findFirst({
				where: {
					action: "plo_gap_analysis.generated",
					targetRecordId: gapDraft.id,
				},
			});
			expect(gapAudit?.moduleAffected).toBe("cqi");

			const savedGap = await ploGapAnalysisService.save(gapDraft.id, IDS.user, {
				gapRows: [
					{
						id: gapRow.id,
						rootCauseCategory: "4-Student Factors",
						rootCauseAnalysis: "Remediation gap in cohort 2",
						namedOwner: "Prof A",
					},
				],
				programChairSummary: "Cohort 2 needs targeted remediation.",
			});
			expect(savedGap.gapRows[0].rootCauseCategory).toBe("4-Student Factors");

			// F23: the open gap becomes a planned CQI entry carrying the gap's root cause.
			const planDraft = await cqiActionPlanService.ensureDraft(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(planDraft.id);
			const planPayload = await cqiActionPlanService.generate(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			expect(planPayload.entries).toHaveLength(1);
			const entry = planPayload.entries[0];
			expect(entry).toMatchObject({
				ploCode: "PLO1",
				cohortYearLevel: 2,
				priorAttainmentPct: 67.5,
				evidenceSource: "F22 Gap Analysis Matrix",
				rootCauseCategory: "4-Student Factors",
				status: "planned",
				intervention: "",
			});

			const linked = await prisma.gapRow.findUniqueOrThrow({
				where: { id: gapRow.id },
			});
			expect(linked.cqiActionPlanEntryId).toBe(entry.id);

			await cqiActionPlanService.save(planDraft.id, IDS.user, {
				entries: [
					{
						id: entry.id,
						intervention: "Add directed lab tutorials for cohort 2",
						owner: "Prof A",
						ownerRole: "Faculty",
						timelineAndKpi: "Next term; cohort 2 avg ≥ 85%",
					},
				],
			});
			const tracked = await cqiActionPlanService.track(planDraft.id, IDS.user, {
				entries: [
					{
						id: entry.id,
						interventionImplemented: "yes",
						currentAttainmentPct: 78,
					},
				],
			});
			expect(tracked.updated).toBe(1);

			// F25: CTL opens a row for the tracked entry with all five conditions unmet.
			const ctlDraft = await closingTheLoopService.ensureDraft(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(ctlDraft.id);
			const ctlPayload = await closingTheLoopService.generate(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			expect(ctlPayload.rows).toHaveLength(1);
			expect(ctlPayload.rows[0].loopStatus).toBe("open_not_implemented");

			const closed = await closingTheLoopService.save(ctlDraft.id, IDS.user, {
				rows: [
					{
						id: ctlPayload.rows[0].id,
						gapFindingAndEvidence: "Cohort 2 below the 70% floor on PLO1.",
						interventionImplementedText: "Directed lab tutorials delivered.",
						priorAttainmentPct: 67.5,
						currentAttainmentPct: 78,
						conditions12Met: true,
						condition3Met: true,
						condition4Met: true,
						condition5Met: true,
					},
				],
				identify: {
					c1PriorCycleKpisAchieved: "Cohort 2 reached 78%.",
					c2PreviouslyMetDeclining: "",
					c3ExternalShifts: "",
					c4ProactiveImprovements: "Extend tutorials to cohort 1.",
				},
			});
			expect(closed.rows).toBe(1);

			const persisted = await prisma.ctlRow.findUniqueOrThrow({
				where: { id: ctlPayload.rows[0].id },
			});
			expect(persisted.loopStatus).toBe("closed");
			expect(persisted.condition5Met).toBe(true);

			const entryDb = await prisma.cqiEntry.findUniqueOrThrow({
				where: { id: entry.id },
			});
			expect(entryDb.status).toBe("tracked");
			expect(entryDb.interventionImplemented).toBe("yes");
			expect(Number(entryDb.currentAttainmentPct)).toBe(78);

			const ctlAudit = await prisma.auditLog.findFirst({
				where: {
					action: "closing_the_loop.rows_saved",
					targetRecordId: ctlDraft.id,
				},
			});
			expect(ctlAudit?.moduleAffected).toBe("cqi");
		} finally {
			await cleanup(draftIds);
		}
	}, 60000);

	it("loop status is hard-computed: any unmet condition stays OPEN, CLOSED only when all five hold", async () => {
		await resetCqiData();
		await seedAcademicChain();
		await seedStudents();
		const draftIds: string[] = [];
		try {
			await attainmentService.persistAttainment(classRecord(), IDS.section);

			const gapDraft = await ploGapAnalysisService.ensureDraft(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(gapDraft.id);
			await ploGapAnalysisService.generate(IDS.program, IDS.term, IDS.user);

			const planDraft = await cqiActionPlanService.ensureDraft(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(planDraft.id);
			const planPayload = await cqiActionPlanService.generate(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			await cqiActionPlanService.track(planDraft.id, IDS.user, {
				entries: [
					{
						id: planPayload.entries[0].id,
						interventionImplemented: "yes",
						currentAttainmentPct: 80,
					},
				],
			});

			const ctlDraft = await closingTheLoopService.ensureDraft(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(ctlDraft.id);
			const ctlPayload = await closingTheLoopService.generate(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			const rowId = ctlPayload.rows[0].id;

			// Conditions 1-4 met, condition 5 still unmet → must be OPEN (Re-assess).
			await closingTheLoopService.save(ctlDraft.id, IDS.user, {
				rows: [
					{
						id: rowId,
						interventionImplementedText: "Tutorials delivered.",
						conditions12Met: true,
						condition3Met: true,
						condition4Met: true,
						condition5Met: false,
					},
				],
			});
			const openRow = await prisma.ctlRow.findUniqueOrThrow({
				where: { id: rowId },
			});
			expect(openRow.loopStatus).toBe("open_reassess");

			// Softening condition 5 to true while keeping others → still not CLOSED.
			await closingTheLoopService.save(ctlDraft.id, IDS.user, {
				rows: [
					{
						id: rowId,
						conditions12Met: true,
						condition3Met: true,
						condition4Met: true,
						condition5Met: true,
					},
				],
			});
			const closedRow = await prisma.ctlRow.findUniqueOrThrow({
				where: { id: rowId },
			});
			expect(closedRow.loopStatus).toBe("closed");
		} finally {
			await cleanup(draftIds);
		}
	}, 60000);

	it("APAR validation gate: blocks submission when the Cohort Tracking Sheet is not attached", async () => {
		await resetCqiData();
		await seedAcademicChain();
		await seedStudents();
		const draftIds: string[] = [];
		const cohortSubmissionId = "it-cqi-approved-cohort";
		try {
			await attainmentService.persistAttainment(classRecord(), IDS.section);

			// Back the gate's approved-cohort-tracking requirement.
			const cohortType =
				(await prisma.formType.findUnique({
					where: { code: "cohort_tracking" },
				})) ??
				(await prisma.formType.create({
					data: {
						id: "it-cqi-cohort-form-type",
						code: "cohort_tracking",
						name: "Cohort CLO/PLO Attainment Tracking Sheet",
						pdcaStage: "CHECK",
						sequenceNo: 16,
					},
				}));
			await prisma.formSubmission.create({
				data: {
					id: cohortSubmissionId,
					formTypeId: cohortType.id,
					programId: IDS.program,
					termId: IDS.term,
					status: "approved",
					formData: {},
				},
			});

			const apar = await annualProgramReportService.ensureDraft(
				IDS.program,
				IDS.user,
			);
			draftIds.push(apar.id);
			const payload = await annualProgramReportService.generate(
				IDS.program,
				undefined,
				IDS.user,
			);
			expect(payload.dueDate).toBe("June 30, 2096");
			expect(payload.program.code).toBe("IT-CQI-PROG");
			const y1 = payload.kpis.find(
				(kpi) => kpi.code === "y1_cohort_clo_attainment",
			);
			expect(y1?.value).toBe(87.5);
			expect(y1?.status).toBe("MET");
			const y2 = payload.kpis.find(
				(kpi) => kpi.code === "y2_cohort_clo_attainment",
			);
			expect(y2?.value).toBe(67.5);
			expect(y2?.status).toBe("NOT MET");

			// Blocked: cohort tracking attachment missing.
			await annualProgramReportService.save(apar.id, IDS.user, {
				attachments: { clo_attainment_summary_s1: true },
			});
			await expect(
				submissionService.submit(apar.id, IDS.user, [
					{ approverRole: "program_chair", sequenceNo: 1 },
					{ approverRole: "dean", sequenceNo: 2 },
				]),
			).rejects.toThrow(/Cohort Tracking Sheet/);

			const after = await prisma.formSubmission.findUniqueOrThrow({
				where: { id: apar.id },
			});
			expect(after.status).toBe("draft");

			// Allowed once the cohort tracking sheet is attached.
			await annualProgramReportService.save(apar.id, IDS.user, {
				attachments: { cohort_tracking: true, closing_the_loop: true },
			});
			const submitted = await submissionService.submit(apar.id, IDS.user, [
				{ approverRole: "program_chair", sequenceNo: 1 },
				{ approverRole: "dean", sequenceNo: 2 },
			]);
			expect(submitted.status).toBe("submitted");
			expect(submitted.currentApproverRole).toBe("program_chair");

			const steps = await prisma.approvalStep.findMany({
				where: { formSubmissionId: apar.id },
			});
			expect(steps).toHaveLength(2);
		} finally {
			await cleanup([...draftIds, cohortSubmissionId]);
		}
	}, 60000);
});
