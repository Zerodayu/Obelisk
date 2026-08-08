import { describe, expect, it } from "bun:test";
import { prisma } from "@lib/prisma";
import type { TypedEtlLoadedData } from "../../src/v1/ingest/service";
import { attainmentService } from "../../src/v1/ingest/service";
import { isDbReachable } from "../helpers/db-gate";

const db = await isDbReachable();

const IDS = {
	department: "it-ingest-dept",
	program: "it-ingest-prog",
	term: "it-ingest-term",
	course: "it-ingest-course",
	classSection: "it-ingest-section",
	existingStudent: "it-ingest-student-existing",
	existingStudentNumber: "IT-INGEST-0001",
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
				schoolYear: "2099-2100",
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
});
