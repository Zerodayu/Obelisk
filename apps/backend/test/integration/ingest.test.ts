import { describe, expect, it } from "bun:test";

import { prisma } from "@lib/prisma";
import { isDbReachable } from "@test/helpers/db-gate";
import { submissionService } from "@v1/forms/service";
import type { TypedEtlLoadedData } from "@v1/ingest/service";
import {
	attainmentService,
	CLO_RAW_DATA_CODE,
	ClassSectionNotFoundError,
	ingestService,
	SectionBindingMismatchError,
	SectionMismatchError,
} from "@v1/ingest/service";

const db = await isDbReachable();

const IDS = {
	department: "it-ingest-dept",
	program: "it-ingest-prog",
	term: "it-ingest-term",
	course: "it-ingest-course",
	classSection: "it-ingest-section",
	existingStudent: "it-ingest-student-existing",
	existingStudentNumber: "IT-INGEST-0001",
	userA: "it-ingest-user-a",
	userB: "it-ingest-user-b",
};

describe.skipIf(!db)("ingest attainment persistence (integration)", () => {
	it("persists ETL attainment results, auto-creating students and at-risk flags", async () => {
		await prisma.department.create({
			data: {
				id: IDS.department,
				name: "Integration Test Dept",
				code: "IT-INGEST",
			},
		});
		await prisma.program.create({
			data: {
				id: IDS.program,
				departmentId: IDS.department,
				name: "Integration Test Program",
				code: "IT-INGEST-PROG",
			},
		});
		await prisma.academicTerm.create({
			data: {
				id: IDS.term,
				schoolYear: "2093-2094",
				semester: "1st",
				isActive: false,
			},
		});
		await prisma.course.create({
			data: {
				id: IDS.course,
				programId: IDS.program,
				code: "IT-101",
				title: "Integration Test Course",
			},
		});
		await prisma.classSection.create({
			data: {
				id: IDS.classSection,
				courseId: IDS.course,
				termId: IDS.term,
				sectionCode: "T1",
			},
		});
		await prisma.clo.create({
			data: {
				id: "it-ingest-clo-1",
				courseId: IDS.course,
				code: "CLO1",
				description: "CLO 1",
			},
		});
		await prisma.clo.create({
			data: {
				id: "it-ingest-clo-2",
				courseId: IDS.course,
				code: "CLO2",
				description: "CLO 2",
			},
		});
		await prisma.clo.create({
			data: {
				id: "it-ingest-clo-3",
				courseId: IDS.course,
				code: "CLO3",
				description: "CLO 3",
			},
		});
		await prisma.student.create({
			data: {
				id: IDS.existingStudent,
				studentNumber: IDS.existingStudentNumber,
				programId: IDS.program,
				firstName: "John",
				lastName: "Doe",
				anonymizedId: "it-ingest-anon-existing",
			},
		});

		const etlLoadedData: TypedEtlLoadedData = {
			header: {},
			clo_plo_mapping: {},
			attainments: [
				{
					student_name: "Doe, John",
					student_id: IDS.existingStudentNumber,
					clo_code: "CLO1",
					direct_clo_attainment_pct: 0.85,
					met_threshold: true,
				},
				{
					student_name: "Reyes, Maria",
					student_id: null,
					clo_code: "CLO2",
					direct_clo_attainment_pct: 0.9,
					met_threshold: true,
				},
				{
					student_name: "Doe, John",
					student_id: IDS.existingStudentNumber,
					clo_code: "CLO3",
					direct_clo_attainment_pct: 0.55,
					met_threshold: false,
				},
				{
					student_name: "Reyes, Maria",
					student_id: null,
					clo_code: "CLO999",
					direct_clo_attainment_pct: 0.8,
					met_threshold: true,
				},
			],
		};

		let computationRunId = "";
		const createdStudentIds: string[] = [];

		try {
			const summary = await attainmentService.persistAttainment(
				etlLoadedData,
				IDS.classSection,
			);

			expect(summary.studentsProcessed).toBe(4);
			expect(summary.studentsCreated).toBe(1);
			expect(summary.cloAttainmentsCreated).toBe(3);
			expect(summary.atRiskFlagsCreated).toBe(1);
			expect(summary.cloMatchFailures).toHaveLength(1);
			expect(summary.cloMatchFailures[0]).toMatchObject({
				cloCode: "CLO999",
				studentName: "Reyes, Maria",
			});

			computationRunId = summary.computationRunId;
			expect(computationRunId).toBeTruthy();

			const computationRun = await prisma.computationRun.findUniqueOrThrow({
				where: { id: computationRunId },
			});
			expect(Number(computationRun.directWeight)).toBe(0.7);
			expect(Number(computationRun.indirectWeight)).toBe(0.3);
			expect(computationRun.formulaVersion).toBe("70_30_v1");
			expect(computationRun.scope).toBe(IDS.classSection);

			const newStudent = await prisma.student.findFirstOrThrow({
				where: {
					programId: IDS.program,
					firstName: "Maria",
					lastName: "Reyes",
				},
			});
			createdStudentIds.push(newStudent.id);

			const belowThreshold = await prisma.cloAttainment.findFirstOrThrow({
				where: { computationRunId, clo: { code: "CLO3" } },
			});
			expect(Number(belowThreshold.directScorePct)).toBe(55);
			expect(belowThreshold.isBelowThreshold).toBe(true);

			const atRiskFlag = await prisma.atRiskFlag.findFirst({
				where: { cloAttainmentId: belowThreshold.id },
			});
			expect(atRiskFlag?.studentId).toBe(IDS.existingStudent);
			expect(atRiskFlag?.reason).toContain("CLO3");

			// NOTE: one Enrollment per resolved student so CAR P1 noEnrolled is non-zero (testing_results 6.5)
			const enrollments = await prisma.enrollment.findMany({
				where: { classSectionId: IDS.classSection },
			});
			expect(enrollments).toHaveLength(2);
			expect(new Set(enrollments.map((e) => e.studentId)).size).toBe(2);
		} finally {
			await prisma.atRiskFlag.deleteMany({
				where: {
					studentId: { in: [IDS.existingStudent, ...createdStudentIds] },
				},
			});
			await prisma.cloAttainment.deleteMany({
				where: { computationRunId },
			});
			await prisma.computationRun.deleteMany({
				where: { id: computationRunId },
			});
			await prisma.student.deleteMany({
				where: { programId: IDS.program },
			});
			await prisma.clo.deleteMany({ where: { courseId: IDS.course } });
			await prisma.classSection.delete({ where: { id: IDS.classSection } });
			await prisma.course.delete({ where: { id: IDS.course } });
			await prisma.academicTerm.delete({ where: { id: IDS.term } });
			await prisma.program.delete({ where: { id: IDS.program } });
			await prisma.department.delete({ where: { id: IDS.department } });
		}
	});

	it("throws ClassSectionNotFoundError if classSectionId does not exist during persistence", async () => {
		const nonExistentId = "non-existent-section-id-12345";
		const etlLoadedData: TypedEtlLoadedData = {
			header: {},
			clo_plo_mapping: {},
			attainments: [],
		};

		await expect(
			attainmentService.persistAttainment(etlLoadedData, nonExistentId),
		).rejects.toThrow(ClassSectionNotFoundError);
	});

	it("throws SectionMismatchError when section extraction is ok and section does not match", async () => {
		await prisma.department.create({
			data: {
				id: IDS.department,
				name: "Integration Test Dept",
				code: "IT-INGEST",
			},
		});
		await prisma.program.create({
			data: {
				id: IDS.program,
				departmentId: IDS.department,
				name: "Integration Test Program",
				code: "IT-INGEST-PROG",
			},
		});
		await prisma.academicTerm.create({
			data: {
				id: IDS.term,
				schoolYear: "2093-2094",
				semester: "1st",
				isActive: false,
			},
		});
		await prisma.course.create({
			data: {
				id: IDS.course,
				programId: IDS.program,
				code: "IT-101",
				title: "Integration Test Course",
			},
		});
		await prisma.classSection.create({
			data: {
				id: IDS.classSection,
				courseId: IDS.course,
				termId: IDS.term,
				sectionCode: "1A",
			},
		});

		const etlLoadedData: TypedEtlLoadedData = {
			header: {},
			clo_plo_mapping: {},
			attainments: [],
			section_extraction: "ok",
			section: {
				code: "2B", // Different from 1A!
				program: "IT-INGEST-PROG",
				year_level: 2,
				section_letter: "B",
				raw: "IT-INGEST-PROG 2B",
			},
		};

		try {
			await expect(
				attainmentService.persistAttainment(etlLoadedData, IDS.classSection),
			).rejects.toThrow(SectionMismatchError);
		} finally {
			await prisma.classSection.delete({ where: { id: IDS.classSection } });
			await prisma.course.delete({ where: { id: IDS.course } });
			await prisma.academicTerm.delete({ where: { id: IDS.term } });
			await prisma.program.delete({ where: { id: IDS.program } });
			await prisma.department.delete({ where: { id: IDS.department } });
		}
	});

	it("rejects polling when query classSectionId does not match bound uploadRecord classSectionId", async () => {
		await prisma.user.create({
			data: { id: IDS.userA, name: "User A", email: "a@ingest.test" },
		});
		await prisma.department.create({
			data: {
				id: IDS.department,
				name: "Integration Test Dept",
				code: "IT-INGEST",
			},
		});
		await prisma.program.create({
			data: {
				id: IDS.program,
				departmentId: IDS.department,
				name: "Integration Test Program",
				code: "IT-INGEST-PROG",
			},
		});
		await prisma.academicTerm.create({
			data: {
				id: IDS.term,
				schoolYear: "2093-2094",
				semester: "1st",
				isActive: false,
			},
		});
		await prisma.course.create({
			data: {
				id: IDS.course,
				programId: IDS.program,
				code: "IT-101",
				title: "Integration Test Course",
			},
		});
		await prisma.classSection.create({
			data: {
				id: IDS.classSection,
				courseId: IDS.course,
				termId: IDS.term,
				sectionCode: "1A",
			},
		});

		const uploadRecord = await prisma.uploadRecord.create({
			data: {
				id: "it-binding-test-upload",
				userId: IDS.userA,
				classSectionId: IDS.classSection,
				etlJobId: "it-binding-job-1234",
				filename: "test.xlsx",
				status: "queued",
			},
		});

		try {
			await expect(
				ingestService.getJobStatus(
					"it-binding-job-1234",
					"different-section-id-9999",
					IDS.userA,
				),
			).rejects.toThrow(SectionBindingMismatchError);
		} finally {
			await prisma.uploadRecord.delete({ where: { id: uploadRecord.id } });
			await prisma.classSection.delete({ where: { id: IDS.classSection } });
			await prisma.course.delete({ where: { id: IDS.course } });
			await prisma.academicTerm.delete({ where: { id: IDS.term } });
			await prisma.program.delete({ where: { id: IDS.program } });
			await prisma.department.delete({ where: { id: IDS.department } });
			await prisma.user.delete({ where: { id: IDS.userA } });
		}
	});

	it("listHistory returns only the current user's uploads, newest first", async () => {
		await prisma.user.create({
			data: { id: IDS.userA, name: "User A", email: "a@ingest.test" },
		});
		await prisma.user.create({
			data: { id: IDS.userB, name: "User B", email: "b@ingest.test" },
		});
		await prisma.department.create({
			data: {
				id: IDS.department,
				name: "Integration Test Dept",
				code: "IT-INGEST",
			},
		});
		await prisma.program.create({
			data: {
				id: IDS.program,
				departmentId: IDS.department,
				name: "Integration Test Program",
				code: "IT-INGEST-PROG",
			},
		});
		await prisma.academicTerm.create({
			data: {
				id: IDS.term,
				schoolYear: "2093-2094",
				semester: "1st",
				isActive: false,
			},
		});
		await prisma.course.create({
			data: {
				id: IDS.course,
				programId: IDS.program,
				code: "IT-101",
				title: "Integration Test Course",
			},
		});
		await prisma.classSection.create({
			data: {
				id: IDS.classSection,
				courseId: IDS.course,
				termId: IDS.term,
				sectionCode: "T1",
			},
		});

		const recordIds: string[] = [];
		const older = await prisma.uploadRecord.create({
			data: {
				id: "it-ingest-upload-older",
				userId: IDS.userA,
				classSectionId: IDS.classSection,
				filename: "older.csv",
				status: "completed",
				createdAt: new Date("2020-01-01T00:00:00Z"),
				summary: {
					studentsProcessed: 4,
					studentsCreated: 1,
					cloAttainmentsCreated: 3,
					atRiskFlagsCreated: 1,
					cloMatchFailures: [],
				},
			},
		});
		recordIds.push(older.id);
		const newer = await prisma.uploadRecord.create({
			data: {
				id: "it-ingest-upload-newer",
				userId: IDS.userA,
				classSectionId: IDS.classSection,
				filename: "newer.xlsx",
				status: "failed",
				error: "CLO code 'CLO999' not found",
			},
		});
		recordIds.push(newer.id);
		await prisma.uploadRecord.create({
			data: {
				id: "it-ingest-upload-other-user",
				userId: IDS.userB,
				classSectionId: IDS.classSection,
				filename: "other.csv",
				status: "queued",
			},
		});
		recordIds.push("it-ingest-upload-other-user");

		try {
			const history = await ingestService.listHistory(IDS.userA);

			expect(history).toHaveLength(2);
			expect(history.map((r) => r.id)).toEqual([
				"it-ingest-upload-newer",
				"it-ingest-upload-older",
			]);
			expect(history[0].filename).toBe("newer.xlsx");
			expect(history[0].status).toBe("failed");
			expect(history[0].error).toContain("CLO999");
			expect(history[1].status).toBe("completed");
			expect(history[1].summary).toMatchObject({
				studentsProcessed: 4,
				cloAttainmentsCreated: 3,
			});
			expect(history[0].classSection).toMatchObject({
				sectionCode: "T1",
				course: { code: "IT-101", title: "Integration Test Course" },
				term: { schoolYear: "2093-2094", semester: "1st" },
			});
		} finally {
			await prisma.uploadRecord.deleteMany({
				where: { id: { in: recordIds } },
			});
			await prisma.classSection.delete({ where: { id: IDS.classSection } });
			await prisma.course.delete({ where: { id: IDS.course } });
			await prisma.academicTerm.delete({ where: { id: IDS.term } });
			await prisma.program.delete({ where: { id: IDS.program } });
			await prisma.department.delete({ where: { id: IDS.department } });
			await prisma.user.deleteMany({
				where: { id: { in: [IDS.userA, IDS.userB] } },
			});
		}
	});

	it("updateScores edits scores, recomputes threshold, and reconciles at-risk flags", async () => {
		const ids = {
			department: "it-edit-dept",
			program: "it-edit-prog",
			term: "it-edit-term",
			course: "it-edit-course",
			classSection: "it-edit-section",
			student: "it-edit-student",
			clo1: "it-edit-clo-1",
			clo2: "it-edit-clo-2",
			run: "it-edit-run",
		};

		try {
			await prisma.user.create({
				data: {
					id: "it-edit-user",
					name: "Edit User",
					email: "edit@ingest.test",
				},
			});
			await prisma.department.create({
				data: { id: ids.department, name: "Edit Dept", code: "IT-EDIT" },
			});
			await prisma.program.create({
				data: {
					id: ids.program,
					departmentId: ids.department,
					name: "Edit Program",
					code: "IT-EDIT-PROG",
				},
			});
			await prisma.academicTerm.create({
				data: {
					id: ids.term,
					schoolYear: "2098-2099",
					semester: "2nd",
					isActive: false,
				},
			});
			await prisma.course.create({
				data: {
					id: ids.course,
					programId: ids.program,
					code: "EDIT-101",
					title: "Edit Course",
				},
			});
			await prisma.classSection.create({
				data: {
					id: ids.classSection,
					courseId: ids.course,
					termId: ids.term,
					sectionCode: "E1",
				},
			});
			await prisma.clo.create({
				data: {
					id: ids.clo1,
					courseId: ids.course,
					code: "CLO1",
					description: "CLO 1",
				},
			});
			await prisma.clo.create({
				data: {
					id: ids.clo2,
					courseId: ids.course,
					code: "CLO2",
					description: "CLO 2",
				},
			});
			await prisma.student.create({
				data: {
					id: ids.student,
					studentNumber: "IT-EDIT-0001",
					programId: ids.program,
					firstName: "Jane",
					lastName: "Smith",
					anonymizedId: "it-edit-anon",
				},
			});
			await prisma.computationRun.create({
				data: {
					id: ids.run,
					scope: ids.classSection,
					formulaVersion: "70_30_v1",
					directWeight: 0.7,
					indirectWeight: 0.3,
				},
			});

			const a1 = await prisma.cloAttainment.create({
				data: {
					id: "it-edit-attain-1",
					classSectionId: ids.classSection,
					cloId: ids.clo1,
					studentId: ids.student,
					directScorePct: 55,
					compositeScorePct: 55,
					isBelowThreshold: true,
					computationRunId: ids.run,
				},
			});
			const a2 = await prisma.cloAttainment.create({
				data: {
					id: "it-edit-attain-2",
					classSectionId: ids.classSection,
					cloId: ids.clo2,
					studentId: ids.student,
					directScorePct: 90,
					compositeScorePct: 90,
					isBelowThreshold: false,
					computationRunId: ids.run,
				},
			});
			const flag = await prisma.atRiskFlag.create({
				data: {
					id: "it-edit-flag",
					studentId: ids.student,
					cloAttainmentId: a1.id,
					reason: "Below institutional threshold on CLO1: 55.0%",
				},
			});

			// Raise CLO1 55 → 85 (flag should be pruned); lower CLO2 90 → 50 (flag created).
			const summary = await attainmentService.updateScores(
				ids.classSection,
				[
					{ attainmentId: a1.id, directScorePct: 85 },
					{ attainmentId: a2.id, directScorePct: 50 },
				],
				"it-edit-user",
			);

			expect(summary.updated).toBe(2);
			expect(summary.flagsCreated).toBe(1);
			expect(summary.flagsRemoved).toBe(1);
			expect(summary.failures).toEqual([]);

			const [edited1, edited2] = await Promise.all([
				prisma.cloAttainment.findUniqueOrThrow({ where: { id: a1.id } }),
				prisma.cloAttainment.findUniqueOrThrow({ where: { id: a2.id } }),
			]);
			expect(Number(edited1.directScorePct)).toBe(85);
			expect(edited1.isBelowThreshold).toBe(false);
			expect(Number(edited2.directScorePct)).toBe(50);
			expect(edited2.isBelowThreshold).toBe(true);

			// At-risk flag moved from CLO1 (pruned) to CLO2 (created).
			const oldFlag = await prisma.atRiskFlag.findUnique({
				where: { id: flag.id },
			});
			const newFlag = await prisma.atRiskFlag.findFirst({
				where: { cloAttainmentId: a2.id },
			});
			expect(oldFlag).toBeNull();
			expect(newFlag?.studentId).toBe(ids.student);

			// Roster reflects the new state.
			const roster = await attainmentService.listAttainments(ids.classSection);
			const byClo = Object.fromEntries(roster.map((r) => [r.cloCode, r]));
			expect(byClo.CLO1).toMatchObject({
				directScorePct: 85,
				isBelowThreshold: false,
				atRisk: false,
			});
			expect(byClo.CLO2).toMatchObject({
				directScorePct: 50,
				isBelowThreshold: true,
				atRisk: true,
			});

			// Audit trail written.
			const audit = await prisma.auditLog.findFirst({
				where: { action: "clo_raw_data.scores_updated" },
				orderBy: { createdAt: "desc" },
			});
			expect(audit?.targetRecordId).toBe(ids.classSection);
		} finally {
			await prisma.auditLog.deleteMany({
				where: { moduleAffected: "ingest" },
			});
			await prisma.atRiskFlag.deleteMany({
				where: { studentId: ids.student },
			});
			await prisma.cloAttainment.deleteMany({
				where: { computationRunId: ids.run },
			});
			await prisma.computationRun.delete({ where: { id: ids.run } });
			await prisma.student.delete({ where: { id: ids.student } });
			await prisma.clo.deleteMany({ where: { courseId: ids.course } });
			await prisma.classSection.delete({ where: { id: ids.classSection } });
			await prisma.course.delete({ where: { id: ids.course } });
			await prisma.academicTerm.delete({ where: { id: ids.term } });
			await prisma.program.delete({ where: { id: ids.program } });
			await prisma.department.delete({ where: { id: ids.department } });
			await prisma.user.delete({ where: { id: "it-edit-user" } });
		}
	});

	it("reimportScores upserts a wide roster CSV and reconciles at-risk flags", async () => {
		const ids = {
			department: "it-reimport-dept",
			program: "it-reimport-prog",
			term: "it-reimport-term",
			course: "it-reimport-course",
			classSection: "it-reimport-section",
			student: "it-reimport-student",
			clo1: "it-reimport-clo-1",
			clo2: "it-reimport-clo-2",
			run: "it-reimport-run",
		};

		try {
			await prisma.department.create({
				data: { id: ids.department, name: "Reimport Dept", code: "IT-REIMP" },
			});
			await prisma.program.create({
				data: {
					id: ids.program,
					departmentId: ids.department,
					name: "Reimport Program",
					code: "IT-REIMP-PROG",
				},
			});
			await prisma.academicTerm.create({
				data: {
					id: ids.term,
					schoolYear: "2097-2098",
					semester: "1st",
					isActive: false,
				},
			});
			await prisma.course.create({
				data: {
					id: ids.course,
					programId: ids.program,
					code: "REIMP-101",
					title: "Reimport Course",
				},
			});
			await prisma.classSection.create({
				data: {
					id: ids.classSection,
					courseId: ids.course,
					termId: ids.term,
					sectionCode: "R1",
				},
			});
			await prisma.clo.create({
				data: {
					id: ids.clo1,
					courseId: ids.course,
					code: "CLO1",
					description: "CLO 1",
				},
			});
			await prisma.clo.create({
				data: {
					id: ids.clo2,
					courseId: ids.course,
					code: "CLO2",
					description: "CLO 2",
				},
			});
			await prisma.student.create({
				data: {
					id: ids.student,
					studentNumber: "JM-REIMP-0001",
					programId: ids.program,
					firstName: "Ana",
					lastName: "Cruz",
					anonymizedId: "it-reimport-anon",
				},
			});
			await prisma.computationRun.create({
				data: {
					id: ids.run,
					scope: ids.classSection,
					formulaVersion: "70_30_v1",
					directWeight: 0.7,
					indirectWeight: 0.3,
				},
			});
			// Existing below-threshold attainment on CLO1 for the seeded student.
			const existing = await prisma.cloAttainment.create({
				data: {
					id: "it-reimport-attain",
					classSectionId: ids.classSection,
					cloId: ids.clo1,
					studentId: ids.student,
					directScorePct: 45,
					compositeScorePct: 45,
					isBelowThreshold: true,
					computationRunId: ids.run,
				},
			});
			await prisma.atRiskFlag.create({
				data: {
					id: "it-reimport-flag-existing",
					studentId: ids.student,
					cloAttainmentId: existing.id,
					reason: "Below institutional threshold",
				},
			});

			const csv = new File(
				[
					"student_name,student_id,CLO1,CLO2\n" +
						'"Cruz, Ana",JM-REIMP-0001,80,55\n' +
						'"Dizon, Ben",,72,68\n',
				],
				"roster.csv",
				{ type: "text/csv" },
			);

			const summary = await attainmentService.reimportScores(
				csv,
				ids.classSection,
				ids.run,
			);

			// Existing student updated (45 → 80); new student created; all 4 cells mapped.
			expect(summary.studentsCreated).toBe(1);
			expect(summary.attainmentsUpdated).toBe(1);
			expect(summary.attainmentsCreated).toBe(3);
			// CLO1 recovers (flag pruned); CLO2 of Ana and both of Ben drop below 70 (flags created).
			expect(summary.flagsRemoved).toBe(1);
			expect(summary.flagsCreated).toBeGreaterThanOrEqual(2);
			expect(summary.skipped).toEqual([]);

			const all = await prisma.cloAttainment.findMany({
				where: { computationRunId: ids.run },
				include: {
					student: { select: { firstName: true, lastName: true } },
					clo: { select: { code: true } },
					atRiskFlags: { select: { id: true } },
				},
			});
			const key = (r: (typeof all)[number]) =>
				`${r.clo.code}:${r.student.lastName}`;
			const byKey = new Map(all.map((r) => [key(r), r]));
			const expectRow = (k: string) => {
				const row = byKey.get(k);
				if (!row) throw new Error(`Missing roster row ${k}`);
				return row;
			};

			const anaClo1 = expectRow("CLO1:Cruz");
			expect(Number(anaClo1.directScorePct)).toBe(80);
			expect(anaClo1.isBelowThreshold).toBe(false);
			expect(anaClo1.atRiskFlags).toHaveLength(0);

			const anaClo2 = expectRow("CLO2:Cruz");
			expect(Number(anaClo2.directScorePct)).toBe(55);
			expect(anaClo2.isBelowThreshold).toBe(true);
			expect(anaClo2.atRiskFlags).toHaveLength(1);

			const benClo1 = expectRow("CLO1:Dizon");
			expect(Number(benClo1.directScorePct)).toBe(72);
			expect(benClo1.isBelowThreshold).toBe(false);

			const benClo2 = expectRow("CLO2:Dizon");
			expect(Number(benClo2.directScorePct)).toBe(68);
			expect(benClo2.isBelowThreshold).toBe(true);
			expect(benClo2.atRiskFlags).toHaveLength(1);
		} finally {
			await prisma.auditLog.deleteMany({
				where: { moduleAffected: "ingest" },
			});
			await prisma.atRiskFlag.deleteMany({
				where: { student: { programId: ids.program } },
			});
			await prisma.cloAttainment.deleteMany({
				where: { computationRunId: ids.run },
			});
			await prisma.computationRun.delete({ where: { id: ids.run } });
			await prisma.student.deleteMany({ where: { programId: ids.program } });
			await prisma.clo.deleteMany({ where: { courseId: ids.course } });
			await prisma.classSection.delete({ where: { id: ids.classSection } });
			await prisma.course.delete({ where: { id: ids.course } });
			await prisma.academicTerm.delete({ where: { id: ids.term } });
			await prisma.program.delete({ where: { id: ids.program } });
			await prisma.department.delete({ where: { id: ids.department } });
		}
	});

	it("initSubmission creates/reuses the clo_raw_data draft and the submit gate blocks an empty section", async () => {
		const ids = {
			department: "it-sub-dept",
			program: "it-sub-prog",
			term: "it-sub-term",
			course: "it-sub-course",
			classSection: "it-sub-section",
			user: "it-sub-user",
			chair: "it-sub-chair",
			// NOTE: role fixtures kept for symmetry with the other submit tests —
			// `clo_raw_data` files as a record now, so no approver ever signs it.
			dean: "it-sub-dean",
			aqau: "it-sub-aqau",
			vpaa: "it-sub-vpaa",
		};
		const approverIds = [ids.chair, ids.dean, ids.aqau, ids.vpaa];

		// NOTE: only delete the form type when this test created it — another
		// test file may own the `clo_raw_data` row (same rule as atrisk.test).
		const preexistingType = await prisma.formType.findUnique({
			where: { code: CLO_RAW_DATA_CODE },
			select: { id: true },
		});

		try {
			await prisma.department.create({
				data: {
					id: ids.department,
					name: "Submission Test Dept",
					code: "IT-SUB",
				},
			});
			await prisma.program.create({
				data: {
					id: ids.program,
					departmentId: ids.department,
					name: "Submission Test Program",
					code: "IT-SUB-PROG",
				},
			});
			await prisma.academicTerm.create({
				data: {
					id: ids.term,
					schoolYear: "2095-2096",
					semester: "1st",
					isActive: false,
				},
			});
			await prisma.course.create({
				data: {
					id: ids.course,
					programId: ids.program,
					code: "IT-SUB-101",
					title: "Submission Test Course",
				},
			});
			await prisma.classSection.create({
				data: {
					id: ids.classSection,
					courseId: ids.course,
					termId: ids.term,
					sectionCode: "S1",
				},
			});
			await prisma.user.createMany({
				data: [
					{
						id: ids.user,
						name: "Submission Faculty",
						email: "it-sub-faculty@obelisk.local",
						role: "faculty",
						programId: ids.program,
						departmentId: ids.department,
						isActive: true,
					},
					{
						id: ids.chair,
						name: "Submission Chair",
						email: "it-sub-chair@obelisk.local",
						role: "program_chair",
						programId: ids.program,
						departmentId: ids.department,
						isActive: true,
					},
					{
						id: ids.dean,
						name: "Submission Dean",
						email: "it-sub-dean@obelisk.local",
						role: "dean",
						programId: ids.program,
						departmentId: ids.department,
						isActive: true,
					},
					{
						id: ids.aqau,
						name: "Submission AQAU",
						email: "it-sub-aqau@obelisk.local",
						role: "aqau",
						isActive: true,
					},
					{
						id: ids.vpaa,
						name: "Submission VPAA",
						email: "it-sub-vpaa@obelisk.local",
						role: "vpaa",
						isActive: true,
					},
				],
			});
			await prisma.clo.create({
				data: {
					id: "it-sub-clo",
					courseId: ids.course,
					code: "CLO1",
					description: "Submission CLO 1",
				},
			});

			// Nothing captured and nothing submitted yet.
			expect(await ingestService.getSubmission(ids.classSection)).toEqual({
				formSubmissionId: null,
			});

			// --- init: draft with term/program resolved from the section --------
			const first = await ingestService.initSubmission(
				ids.classSection,
				ids.user,
			);
			const created = await prisma.formSubmission.findUniqueOrThrow({
				where: { id: first.formSubmissionId },
				include: { formType: true },
			});
			expect(created.status).toBe("draft");
			expect(created.formType.code).toBe(CLO_RAW_DATA_CODE);
			expect(created.classSectionId).toBe(ids.classSection);
			expect(created.termId).toBe(ids.term);
			expect(created.programId).toBe(ids.program);
			expect(created.submittedByUserId).toBe(ids.user);
			expect(await ingestService.getSubmission(ids.classSection)).toEqual({
				formSubmissionId: first.formSubmissionId,
			});

			// --- init is idempotent ----------------------------------------------
			const second = await ingestService.initSubmission(
				ids.classSection,
				ids.user,
			);
			expect(second.formSubmissionId).toBe(first.formSubmissionId);

			// --- gate: a section with no captured scores cannot be submitted ------
			await expect(
				submissionService.submit(first.formSubmissionId, ids.user, "faculty"),
			).rejects.toThrow(/upload a class record for this section/);

			// --- capture the class record → the form files as a record -----------
			await attainmentService.persistAttainment(
				{
					header: {},
					clo_plo_mapping: {},
					attainments: [
						{
							student_name: "Cruz, Ana",
							student_id: "IT-SUB-0001",
							clo_code: "CLO1",
							direct_clo_attainment_pct: 0.85,
							met_threshold: true,
						},
					],
				},
				ids.classSection,
				ids.user,
			);
			const filed = await submissionService.submit(
				first.formSubmissionId,
				ids.user,
				"faculty",
			);
			// NOTE: `clo_raw_data` is Record-tagged — no approval chain, it
			// files straight to `approved` with zero steps.
			expect(filed.status).toBe("approved");
			expect(filed.currentApproverRole).toBeNull();
			expect(filed.approvalSteps).toHaveLength(0);

			// --- approved → the next init opens a fresh draft (re-upload path) ----
			const afterApproval = await ingestService.initSubmission(
				ids.classSection,
				ids.user,
			);
			expect(afterApproval.formSubmissionId).not.toBe(first.formSubmissionId);
			expect(await ingestService.getSubmission(ids.classSection)).toEqual({
				formSubmissionId: afterApproval.formSubmissionId,
			});

			// --- unknown section → 404-shaped error --------------------------------
			await expect(
				ingestService.getSubmission("it-sub-missing"),
			).rejects.toThrow(ClassSectionNotFoundError);
			await expect(
				ingestService.initSubmission("it-sub-missing", ids.user),
			).rejects.toThrow(ClassSectionNotFoundError);
		} finally {
			await prisma.formSubmission.deleteMany({
				where: { classSectionId: ids.classSection },
			});
			await prisma.auditLog.deleteMany({
				where: { userId: { in: [ids.user, ...approverIds] } },
			});
			if (!preexistingType) {
				await prisma.formType.deleteMany({
					where: { code: CLO_RAW_DATA_CODE },
				});
			}
			await prisma.atRiskFlag.deleteMany({
				where: { student: { programId: ids.program } },
			});
			await prisma.cloAttainment.deleteMany({
				where: { classSectionId: ids.classSection },
			});
			await prisma.computationRun.deleteMany({
				where: { scope: ids.classSection },
			});
			await prisma.student.deleteMany({ where: { programId: ids.program } });
			await prisma.clo.deleteMany({ where: { courseId: ids.course } });
			await prisma.classSection.delete({ where: { id: ids.classSection } });
			await prisma.course.delete({ where: { id: ids.course } });
			await prisma.academicTerm.delete({ where: { id: ids.term } });
			await prisma.program.delete({ where: { id: ids.program } });
			await prisma.department.delete({ where: { id: ids.department } });
			await prisma.user.deleteMany({
				where: { id: { in: [ids.user, ...approverIds] } },
			});
		}
	});

	it("buildPreview summarises a finished ETL job without writing anything", async () => {
		await prisma.department.create({
			data: {
				id: IDS.department,
				name: "Integration Test Dept",
				code: "IT-INGEST",
			},
		});
		await prisma.program.create({
			data: {
				id: IDS.program,
				departmentId: IDS.department,
				name: "Integration Test Program",
				code: "IT-INGEST-PROG",
			},
		});
		await prisma.academicTerm.create({
			data: {
				id: IDS.term,
				schoolYear: "2093-2094",
				semester: "1st",
				isActive: false,
			},
		});
		await prisma.course.create({
			data: {
				id: IDS.course,
				programId: IDS.program,
				code: "IT-101",
				title: "Integration Test Course",
			},
		});
		await prisma.classSection.create({
			data: {
				id: IDS.classSection,
				courseId: IDS.course,
				termId: IDS.term,
				sectionCode: "T1",
			},
		});
		await prisma.clo.create({
			data: {
				id: "it-ingest-clo-1",
				courseId: IDS.course,
				code: "CLO1",
				description: "CLO 1",
			},
		});

		const etlLoadedData: TypedEtlLoadedData = {
			header: {},
			clo_plo_mapping: {},
			attainments: [
				{
					student_name: "Doe, John",
					student_id: "IT-INGEST-0001",
					clo_code: "CLO1",
					direct_clo_attainment_pct: 0.85,
					met_threshold: true,
				},
				{
					student_name: "Reyes, Maria",
					student_id: null,
					clo_code: "CLO1",
					direct_clo_attainment_pct: 0.55,
					met_threshold: false,
				},
				{
					student_name: "Reyes, Maria",
					student_id: null,
					clo_code: "CLO999",
					direct_clo_attainment_pct: 0.8,
					met_threshold: true,
				},
			],
		};

		try {
			const preview = await attainmentService.buildPreview(
				etlLoadedData,
				IDS.classSection,
			);

			expect(preview.students).toBe(2);
			expect(preview.rows).toBe(3);
			expect(preview.atRisk).toBe(1);
			expect(preview.unmatchedClos).toEqual([{ cloCode: "CLO999", rows: 1 }]);
			// NOTE: no section info in the fixture → unverified, never a blocking mismatch.
			expect(preview.verification.status).toBe("unverified");

			// NOTE: the preview must stay read-only — only saveJob persists.
			expect(
				await prisma.computationRun.count({
					where: { scope: IDS.classSection },
				}),
			).toBe(0);
			expect(
				await prisma.cloAttainment.count({
					where: { classSectionId: IDS.classSection },
				}),
			).toBe(0);
		} finally {
			await prisma.clo.deleteMany({ where: { courseId: IDS.course } });
			await prisma.classSection.delete({ where: { id: IDS.classSection } });
			await prisma.course.delete({ where: { id: IDS.course } });
			await prisma.academicTerm.delete({ where: { id: IDS.term } });
			await prisma.program.delete({ where: { id: IDS.program } });
			await prisma.department.delete({ where: { id: IDS.department } });
		}
	});

	it("discardJob marks a queued upload discarded and leaves a saved one alone", async () => {
		await prisma.user.create({
			data: { id: IDS.userA, name: "User A", email: "a@ingest.test" },
		});
		await prisma.department.create({
			data: {
				id: IDS.department,
				name: "Integration Test Dept",
				code: "IT-INGEST",
			},
		});
		await prisma.program.create({
			data: {
				id: IDS.program,
				departmentId: IDS.department,
				name: "Integration Test Program",
				code: "IT-INGEST-PROG",
			},
		});
		await prisma.academicTerm.create({
			data: {
				id: IDS.term,
				schoolYear: "2093-2094",
				semester: "1st",
				isActive: false,
			},
		});
		await prisma.course.create({
			data: {
				id: IDS.course,
				programId: IDS.program,
				code: "IT-101",
				title: "Integration Test Course",
			},
		});
		await prisma.classSection.create({
			data: {
				id: IDS.classSection,
				courseId: IDS.course,
				termId: IDS.term,
				sectionCode: "T1",
			},
		});

		const queued = await prisma.uploadRecord.create({
			data: {
				id: "it-ingest-upload-queued",
				userId: IDS.userA,
				classSectionId: IDS.classSection,
				etlJobId: "it-ingest-queued-job-1",
				filename: "queued.xlsx",
				status: "queued",
			},
		});
		const saved = await prisma.uploadRecord.create({
			data: {
				id: "it-ingest-upload-already-saved",
				userId: IDS.userA,
				classSectionId: IDS.classSection,
				etlJobId: "it-ingest-saved-job-1",
				filename: "saved.xlsx",
				status: "completed",
				summary: {
					studentsProcessed: 4,
					cloAttainmentsCreated: 3,
					atRiskFlagsCreated: 0,
					cloMatchFailures: [],
				},
			},
		});

		try {
			await expect(
				ingestService.discardJob("it-ingest-queued-job-1", IDS.classSection),
			).resolves.toEqual({ status: "discarded" });
			expect(
				(
					await prisma.uploadRecord.findUniqueOrThrow({
						where: { id: queued.id },
					})
				).status,
			).toBe("discarded");

			// NOTE: a discard never downgrades an upload that was already saved.
			await expect(
				ingestService.discardJob("it-ingest-saved-job-1", IDS.classSection),
			).resolves.toEqual({ status: "discarded" });
			expect(
				(
					await prisma.uploadRecord.findUniqueOrThrow({
						where: { id: saved.id },
					})
				).status,
			).toBe("completed");

			await expect(
				ingestService.discardJob("it-ingest-queued-job-1", "other-section"),
			).rejects.toThrow(SectionBindingMismatchError);
		} finally {
			await prisma.uploadRecord.deleteMany({
				where: { id: { in: [queued.id, saved.id] } },
			});
			await prisma.classSection.delete({ where: { id: IDS.classSection } });
			await prisma.course.delete({ where: { id: IDS.course } });
			await prisma.academicTerm.delete({ where: { id: IDS.term } });
			await prisma.program.delete({ where: { id: IDS.program } });
			await prisma.department.delete({ where: { id: IDS.department } });
			await prisma.user.delete({ where: { id: IDS.userA } });
		}
	});

	it("saveJob replays a stored summary idempotently without re-persisting", async () => {
		await prisma.user.create({
			data: { id: IDS.userA, name: "User A", email: "a@ingest.test" },
		});
		await prisma.department.create({
			data: {
				id: IDS.department,
				name: "Integration Test Dept",
				code: "IT-INGEST",
			},
		});
		await prisma.program.create({
			data: {
				id: IDS.program,
				departmentId: IDS.department,
				name: "Integration Test Program",
				code: "IT-INGEST-PROG",
			},
		});
		await prisma.academicTerm.create({
			data: {
				id: IDS.term,
				schoolYear: "2093-2094",
				semester: "1st",
				isActive: false,
			},
		});
		await prisma.course.create({
			data: {
				id: IDS.course,
				programId: IDS.program,
				code: "IT-101",
				title: "Integration Test Course",
			},
		});
		await prisma.classSection.create({
			data: {
				id: IDS.classSection,
				courseId: IDS.course,
				termId: IDS.term,
				sectionCode: "T1",
			},
		});
		await prisma.uploadRecord.create({
			data: {
				id: "it-ingest-upload-replay",
				userId: IDS.userA,
				classSectionId: IDS.classSection,
				etlJobId: "it-ingest-replay-job-1",
				filename: "saved.xlsx",
				status: "completed",
				summary: {
					studentsProcessed: 4,
					studentsCreated: 1,
					cloAttainmentsCreated: 3,
					atRiskFlagsCreated: 1,
					cloMatchFailures: [],
				},
			},
		});

		try {
			// NOTE: a saved job answers from the UploadRecord — no python call, no writes.
			const result = await ingestService.saveJob(
				"it-ingest-replay-job-1",
				IDS.classSection,
				IDS.userA,
			);

			expect(result.status).toBe("completed");
			expect(result).toMatchObject({
				persistence: { studentsProcessed: 4, cloAttainmentsCreated: 3 },
			});
			expect(
				await prisma.cloAttainment.count({
					where: { classSectionId: IDS.classSection },
				}),
			).toBe(0);
		} finally {
			await prisma.uploadRecord.deleteMany({
				where: { id: "it-ingest-upload-replay" },
			});
			await prisma.classSection.delete({ where: { id: IDS.classSection } });
			await prisma.course.delete({ where: { id: IDS.course } });
			await prisma.academicTerm.delete({ where: { id: IDS.term } });
			await prisma.program.delete({ where: { id: IDS.program } });
			await prisma.department.delete({ where: { id: IDS.department } });
			await prisma.user.delete({ where: { id: IDS.userA } });
		}
	});
});
