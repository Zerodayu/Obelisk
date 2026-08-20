import { describe, expect, it } from "bun:test";
import type {
	AnalyticsSubmissionsPayload,
	AnalyticsSummaryResponse,
} from "@lib/ingest/ingest-client";
import { prisma } from "@lib/prisma";
import { isDbReachable } from "@test/helpers/db-gate";
import { attainmentService } from "@v1/ingest/service";
import {
	type AnalyticsSummaryFetcher,
	cloSummaryService,
	cohortTrackingService,
	PloSummaryService,
} from "@v1/rollup/service";

const db = await isDbReachable();

const IDS = {
	department: "it-rollup-dept",
	program: "it-rollup-prog",
	programName: "Integration Test Rollup Program",
	term: "it-rollup-term",
	course: "it-rollup-course",
	section: "it-rollup-section",
	user: "it-rollup-user",
	plo1: "it-rollup-plo-1",
	clo1: "it-rollup-clo-1",
	clo2: "it-rollup-clo-2",
	clo3: "it-rollup-clo-3",
	student1: "it-rollup-stu-1",
	student1Number: "IT-ROLLUP-0001",
	student2: "it-rollup-stu-2",
	student2Number: "IT-ROLLUP-0002",
	student3: "it-rollup-stu-3",
	student3Number: "IT-ROLLUP-0003",
};

function stubFetcher(ploAttainmentFraction = 0.875): {
	fetcher: AnalyticsSummaryFetcher;
	seen: AnalyticsSubmissionsPayload[];
} {
	const seen: AnalyticsSubmissionsPayload[] = [];
	const fetcher: AnalyticsSummaryFetcher = async (payload) => {
		seen.push(payload);
		const response: AnalyticsSummaryResponse = {
			period: { type: "semester", label: payload.period.label },
			department_summary: {},
			program_summary: {
				[IDS.programName]: {
					total_attainment_records: payload.submissions.reduce(
						(sum, submission) => sum + submission.attainments.length,
						0,
					),
					clos: {
						CLO1: {
							mean_attainment_pct: ploAttainmentFraction,
							record_count: 2,
							rule1_met: true,
						},
					},
					plos: {
						PLO1: {
							plo_attainment_direct_only: ploAttainmentFraction,
							plo_completeness_pct: 1,
							plo_rule3_met: true,
							mapped_clos: [
								{
									clo_code: "CLO1",
									mean_attainment_pct: ploAttainmentFraction,
									rule1_met: true,
								},
							],
						},
					},
					program_plo_average: ploAttainmentFraction,
				},
			},
			avp_group_summary: {},
			worst_performing_clos: [],
		};
		return response;
	};
	return { fetcher, seen };
}

async function seedAcademicChain() {
	await prisma.department.create({
		data: {
			id: IDS.department,
			name: "Integration Rollup Dept",
			code: "IT-ROLLUP",
		},
	});
	await prisma.program.create({
		data: {
			id: IDS.program,
			departmentId: IDS.department,
			name: IDS.programName,
			code: "IT-ROLLUP-PROG",
		},
	});
	await prisma.academicTerm.create({
		data: {
			id: IDS.term,
			schoolYear: "2099-2100",
			semester: "1st",
			isActive: false,
		},
	});
	await prisma.course.create({
		data: {
			id: IDS.course,
			programId: IDS.program,
			code: "ROLL-101",
			title: "Rollup Test Course",
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
			description: "Rollup PLO 1",
			targetAttainmentPct: 70,
		},
	});
	await prisma.clo.create({
		data: {
			id: IDS.clo1,
			courseId: IDS.course,
			code: "CLO1",
			description: "Rollup CLO 1",
		},
	});
	await prisma.clo.create({
		data: {
			id: IDS.clo2,
			courseId: IDS.course,
			code: "CLO2",
			description: "Rollup CLO 2",
		},
	});
	await prisma.cloToPloMap.create({
		data: {
			id: "it-rollup-map-1",
			cloId: IDS.clo1,
			ploId: IDS.plo1,
			weight: 1,
		},
	});
	await prisma.cloToPloMap.create({
		data: {
			id: "it-rollup-map-2",
			cloId: IDS.clo2,
			ploId: IDS.plo1,
			weight: 1,
		},
	});
	await prisma.user.create({
		data: {
			id: IDS.user,
			name: "Rollup User",
			email: "rollup@obelisktest.local",
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
			anonymizedId: "it-rollup-anon-1",
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
			anonymizedId: "it-rollup-anon-2",
		},
	});
}

function classRecord() {
	return {
		header: {
			course_code: "ROLL-101",
			section: "T1",
			course_type: "lecture",
			semester_year: "2099-2100 1st",
			no_of_students: 2,
			threshold: 0.7,
		},
		clo_plo_mapping: [
			{ clo_code: "CLO1", plo_code: "PLO1", correlation_strength: 3 },
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

describe.skipIf(!db)("roll-up chain generation (integration)", () => {
	it("F14: assembles the per-section CLO attainment summary and snapshots it", async () => {
		await resetRollupData();
		await seedAcademicChain();
		await seedStudents();
		let computationRunId = "";
		let draftId = "";
		try {
			const summary = await attainmentService.persistAttainment(
				classRecord(),
				IDS.section,
			);
			computationRunId = summary.computationRunId;

			const draft = await cloSummaryService.ensureDraft(IDS.section, IDS.user);
			draftId = draft.id;
			const payload = await cloSummaryService.generate(
				IDS.section,
				undefined,
				IDS.user,
			);

			expect(payload.formSubmissionId).toBe(draftId);
			expect(payload.computationRunId).toBe(computationRunId);
			expect(payload.course.code).toBe("ROLL-101");
			expect(payload.term.schoolYear).toBe("2099-2100");
			expect(payload.summary.totalCount).toBe(2);
			expect(payload.summary.belowCount).toBe(1);
			expect(payload.summary.averagePct).toBe(77.5);

			const clo1 = payload.rows.find((row) => row.cloCode === "CLO1");
			expect(clo1).toMatchObject({
				count: 2,
				belowCount: 0,
				weightedAvgPct: 90,
				status: "MET",
				ploCode: "PLO1",
			});
			const clo2 = payload.rows.find((row) => row.cloCode === "CLO2");
			expect(clo2).toMatchObject({
				count: 2,
				belowCount: 1,
				weightedAvgPct: 65,
				status: "NOT MET",
			});

			const submission = await prisma.formSubmission.findUniqueOrThrow({
				where: { id: draftId },
			});
			const computed = (submission.formData as { computed?: unknown }).computed;
			expect(computed).toBeTruthy();

			const audit = await prisma.auditLog.findFirst({
				where: {
					action: "clo_attainment_summary.generated",
					targetRecordId: draftId,
				},
			});
			expect(audit).toBeTruthy();
			expect(audit?.moduleAffected).toBe("rollup");
		} finally {
			await cleanup(draftId, computationRunId);
		}
	}, 60000);

	it("F15: feeds snapshots to python rollups and persists PloAttainment (exit check)", async () => {
		await resetRollupData();
		await seedAcademicChain();
		await seedStudents();
		let computationRunId = "";
		let draftId = "";
		try {
			const summary = await attainmentService.persistAttainment(
				classRecord(),
				IDS.section,
			);
			computationRunId = summary.computationRunId;

			const { fetcher, seen } = stubFetcher();
			const service = new PloSummaryService(fetcher);

			const draft = await service.ensureDraft(IDS.program, IDS.term, IDS.user);
			draftId = draft.id;
			const payload = await service.generate(IDS.program, IDS.term, IDS.user);

			expect(payload.feed).toEqual({ sections: 1, fed: 1 });
			expect(seen).toHaveLength(1);
			expect(seen[0].submissions[0].program).toBe(IDS.programName);
			expect(seen[0].submissions[0].attainments).toHaveLength(4);

			expect(payload.plos).toHaveLength(1);
			const plo = payload.plos[0];
			expect(plo).toMatchObject({
				ploCode: "PLO1",
				attainedPct: 87.5,
				achieved: true,
				targetAttainmentPct: 70,
				studentsBelowTargetCount: 1,
				completenessPct: 100,
				rule3Met: true,
			});
			expect(payload.summary.averagePct).toBe(87.5);
			expect(payload.summary.belowCount).toBe(0);

			const ploRun = await prisma.computationRun.findFirstOrThrow({
				where: { scope: `plo:${IDS.program}:${IDS.term}` },
			});
			expect(ploRun.formulaVersion).toBe("70_30_v1");

			const persisted = await prisma.ploAttainment.findMany({
				where: { programId: IDS.program, termId: IDS.term },
			});
			expect(persisted).toHaveLength(1);
			expect(Number(persisted[0].attainedPct)).toBe(87.5);
			expect(persisted[0].studentsBelowTargetCount).toBe(1);
			expect(persisted[0].computationRunId).toBe(ploRun.id);
			expect(payload.computationRunId).toBe(ploRun.id);

			const audit = await prisma.auditLog.findFirst({
				where: {
					action: "plo_attainment_summary.generated",
					targetRecordId: draftId,
				},
			});
			expect(audit).toBeTruthy();
		} finally {
			await cleanup(draftId, computationRunId);
			await prisma.ploAttainment.deleteMany({
				where: { programId: IDS.program, termId: IDS.term },
			});
			await prisma.computationRun.deleteMany({
				where: { scope: `plo:${IDS.program}:${IDS.term}` },
			});
		}
	}, 60000);

	it("F16: builds the cohort grid from stored data and audits annotation writes", async () => {
		await resetRollupData();
		await seedAcademicChain();
		await seedStudents();
		let computationRunId = "";
		let draftId = "";
		try {
			const summary = await attainmentService.persistAttainment(
				classRecord(),
				IDS.section,
			);
			computationRunId = summary.computationRunId;

			const { fetcher } = stubFetcher();
			const ploService = new PloSummaryService(fetcher);
			await ploService.generate(IDS.program, IDS.term, IDS.user);

			const draft = await cohortTrackingService.ensureDraft(
				IDS.program,
				IDS.user,
			);
			draftId = draft.id;
			const payload = await cohortTrackingService.generate(
				IDS.program,
				undefined,
				IDS.user,
			);

			expect(payload.formSubmissionId).toBe(draftId);
			expect(payload.lines).toHaveLength(2);

			const yearOne = payload.lines.find((line) => line.yearLevel === 1);
			expect(yearOne?.terms).toHaveLength(1);
			expect(yearOne?.terms[0].rows.map((row) => row.cloCode)).toEqual([
				"CLO1",
				"CLO2",
			]);
			expect(yearOne?.terms[0].averagePct).toBe(87.5);
			expect(yearOne?.trend).toBe("FLAT");

			const yearTwo = payload.lines.find((line) => line.yearLevel === 2);
			expect(yearTwo?.cqiTriggered).toBe(true);
			expect(
				yearTwo?.terms[0].rows.find((row) => row.cloCode === "CLO2"),
			).toMatchObject({
				attainmentPct: 40,
				status: "NOT MET",
			});

			expect(payload.plos).toHaveLength(1);
			expect(payload.plos[0]).toMatchObject({
				ploCode: "PLO1",
				attainmentPct: 87.5,
				achieved: true,
			});

			const saved = await cohortTrackingService.save(draftId, IDS.user, {
				annotations: [
					{
						yearLevel: 2,
						termId: IDS.term,
						cloCode: "CLO2",
						cqiFlag: true,
						followUp: "Retest CLO2 next term",
					},
				],
			});
			expect(saved.annotations).toHaveLength(1);

			const after = await prisma.formSubmission.findUniqueOrThrow({
				where: { id: draftId },
			});
			const annotations = (
				after.formData as { annotations?: { yearLevel: number }[] }
			).annotations;
			expect(annotations?.[0].yearLevel).toBe(2);

			const audit = await prisma.auditLog.findFirst({
				where: {
					action: "cohort_tracking.annotations_saved",
					targetRecordId: draftId,
				},
			});
			expect(audit).toBeTruthy();
			expect(audit?.moduleAffected).toBe("rollup");
		} finally {
			await cleanup(draftId, computationRunId);
			await prisma.ploAttainment.deleteMany({
				where: { programId: IDS.program, termId: IDS.term },
			});
			await prisma.computationRun.deleteMany({
				where: { scope: `plo:${IDS.program}:${IDS.term}` },
			});
		}
	}, 60000);

	const ROLLUP_FORM_CODES = [
		"clo_attainment_summary",
		"plo_attainment_summary",
		"cohort_tracking",
	];

	/** Clears any rows left over by an aborted earlier run (timeouts skip `finally`). */
	async function resetRollupData() {
		await prisma.atRiskFlag.deleteMany({
			where: { studentId: { in: [IDS.student1, IDS.student2, IDS.student3] } },
		});
		await prisma.cloAttainment.deleteMany({
			where: { classSectionId: IDS.section },
		});
		await prisma.ploAttainment.deleteMany({
			where: { programId: IDS.program },
		});
		await prisma.computationRun.deleteMany({
			where: {
				scope: { in: [IDS.section, `plo:${IDS.program}:${IDS.term}`] },
			},
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
		await prisma.formType.deleteMany({
			where: { code: { in: ROLLUP_FORM_CODES } },
		});
	}

	async function cleanup(draftId: string, computationRunId: string) {
		await prisma.auditLog.deleteMany({
			where: { targetRecordId: { in: draftId ? [draftId] : [] } },
		});
		await prisma.formSubmission.deleteMany({
			where: { id: { in: draftId ? [draftId] : [] } },
		});
		await prisma.atRiskFlag.deleteMany({
			where: {
				studentId: { in: [IDS.student1, IDS.student2, IDS.student3] },
			},
		});
		await prisma.cloAttainment.deleteMany({
			where: {
				computationRunId: { in: computationRunId ? [computationRunId] : [] },
			},
		});
		await prisma.computationRun.deleteMany({
			where: { id: { in: computationRunId ? [computationRunId] : [] } },
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
		await prisma.formType.deleteMany({
			where: {
				code: {
					in: [
						"clo_attainment_summary",
						"plo_attainment_summary",
						"cohort_tracking",
					],
				},
			},
		});
	}
});
