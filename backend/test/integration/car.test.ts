import { describe, expect, it } from "bun:test";
import { prisma } from "@lib/prisma";
import { isDbReachable } from "@test/helpers/db-gate";
import { carService } from "@v1/car/service";
import { attainmentService } from "@v1/ingest/service";

const db = await isDbReachable();

describe.skipIf(!db)("CAR generation (integration)", () => {
	it("rolls up stored attainment into all 7 parts without manual re-entry", async () => {
		const ids = {
			department: "it-car-dept",
			program: "it-car-prog",
			term: "it-car-term",
			course: "it-car-course",
			classSection: "it-car-section",
			user: "it-car-user",
			formType: "it-car-form-type",
		};

		try {
			await prisma.user.create({
				data: {
					id: ids.user,
					name: "CAR Faculty",
					email: "car@ingest.test",
					role: "faculty",
				},
			});
			await prisma.department.create({
				data: { id: ids.department, name: "CAR Dept", code: "IT-CAR" },
			});
			await prisma.program.create({
				data: {
					id: ids.program,
					departmentId: ids.department,
					name: "CAR Program",
					code: "IT-CAR-PROG",
				},
			});
			await prisma.academicTerm.create({
				data: {
					id: ids.term,
					schoolYear: "2096-2097",
					semester: "2nd",
					isActive: false,
				},
			});
			await prisma.course.create({
				data: {
					id: ids.course,
					programId: ids.program,
					code: "CAR-101",
					title: "CAR Test Course",
				},
			});
			await prisma.classSection.create({
				data: {
					id: ids.classSection,
					courseId: ids.course,
					termId: ids.term,
					sectionCode: "C1",
					facultyId: ids.user,
				},
			});
			await prisma.plo.create({
				data: {
					id: "it-car-plo-1",
					programId: ids.program,
					code: "PLO1",
					description: "PLO 1",
				},
			});
			await prisma.clo.create({
				data: {
					id: "it-car-clo-1",
					courseId: ids.course,
					code: "CLO1",
					description: "CLO 1",
				},
			});
			await prisma.clo.create({
				data: {
					id: "it-car-clo-2",
					courseId: ids.course,
					code: "CLO2",
					description: "CLO 2",
				},
			});

			let computationRunId = "";

			const summary = await attainmentService.persistAttainment(
				{
					header: {},
					clo_plo_mapping: {},
					attainments: [
						{
							student_name: "Doe, John",
							student_id: null,
							clo_code: "CLO1",
							direct_clo_attainment_pct: 0.85,
							met_threshold: true,
							tla_pct: null,
							at_pct: 0.6,
							exam_pct: 1.0,
							output_pct: null,
						},
						{
							student_name: "Doe, John",
							student_id: null,
							clo_code: "CLO2",
							direct_clo_attainment_pct: 0.55,
							met_threshold: false,
							tla_pct: 0.5,
							at_pct: 0.6,
							exam_pct: 0.4,
							output_pct: null,
						},
						{
							student_name: "Reyes, Maria",
							student_id: null,
							clo_code: "CLO1",
							direct_clo_attainment_pct: 0.9,
							met_threshold: true,
							tla_pct: null,
							at_pct: 0.8,
							exam_pct: 1.0,
							output_pct: null,
						},
						{
							student_name: "Reyes, Maria",
							student_id: null,
							clo_code: "CLO2",
							direct_clo_attainment_pct: 0.6,
							met_threshold: false,
							tla_pct: 0.5,
							at_pct: 0.7,
							exam_pct: 0.4,
							output_pct: null,
						},
					],
				},
				ids.classSection,
				ids.user,
			);

			computationRunId = summary.computationRunId;

			// Ensure a CAR form type is available, then create a draft + generate.
			const draft = await carService.ensureDraft(
				ids.classSection,
				ids.user,
				computationRunId,
			);
			const car = await carService.generate(ids.classSection, computationRunId);

			expect(car.classSectionId).toBe(ids.classSection);
			expect(car.formSubmissionId).toBe(draft.id);

			// Part 1 — course/section metadata + counts.
			expect(car.part1).toMatchObject({
				courseCode: "CAR-101",
				courseTitle: "CAR Test Course",
				sectionCode: "C1",
				programCode: "IT-CAR-PROG",
				schoolYear: "2096-2097",
				semester: "2nd",
				noEnrolled: 0,
				noCompleted: 2,
			});
			expect(car.part1.facultyName).toBe("CAR Faculty");
			expect(car.part1.cloPloMapping.map((r) => r.cloCode)).toEqual([
				"CLO1",
				"CLO2",
			]);

			// Part 2 — assessment-type means (ETL fractions x100 saved directly).
			const exams = Object.fromEntries(
				car.part2.exams.map((r) => [r.cloCode, r]),
			);
			expect(exams.CLO1.attainmentPct).toBe(100);
			expect(exams.CLO1.belowBenchmark).toBe(false);
			expect(exams.CLO2.attainmentPct).toBe(40);
			expect(exams.CLO2.belowBenchmark).toBe(true);

			// Part 3 — consolidated rows grouped by cohort (no yearLevel → null).
			expect(car.part3).toHaveLength(1);
			const [cohort] = car.part3;
			expect(cohort.yearLevel).toBeNull();
			const rows = Object.fromEntries(cohort.rows.map((r) => [r.cloCode, r]));
			// CLO1: composite mean (85+90)/2 = 87.5; CLO2: (55+60)/2 = 57.5.
			expect(rows.CLO1.weightedAvgPct).toBe(87.5);
			expect(rows.CLO1.status).toBe("MET");
			expect(rows.CLO1.level).toBe("Exceptional");
			expect(rows.CLO2.weightedAvgPct).toBe(57.5);
			expect(rows.CLO2.status).toBe("NOT MET");
			expect(rows.CLO2.level).toBe("Below Basic");

			// Part 4 — at-risk watchlist = students with any below-threshold CLO.
			const atRisk = Object.fromEntries(
				car.part4.rows.map((r) => [r.studentName, r]),
			);
			expect(car.part4.count).toBe(2);
			expect(atRisk["Doe, John"].atRiskClos.map((c) => c.cloCode)).toEqual([
				"CLO2",
			]);
			expect(atRisk["Reyes, Maria"].atRiskClos.map((c) => c.cloCode)).toEqual([
				"CLO2",
			]);

			// Part 5 — one CQI row per below-benchmark CLO.
			expect(car.part5.map((e) => e.cloCode)).toEqual(["CLO2"]);
			expect(car.part5[0].attainmentPct).toBe(57.5);
			expect(car.part5[0].rootCauseCategory).toBeDefined();

			// Parts 6/7 — defaults until saved.
			expect(car.part6.teachingStrategies).toEqual([]);
			expect(car.part7.programChairDisposition).toBeNull();

			// Save Part 5 CQI entries, then generate-on-read merges them.
			await carService.save(draft.id, ids.user, {
				part5: [
					{
						cloCode: "CLO2",
						rootCauseCategory: "3-Assessment Design",
						intervention: "Add formative feedback before midterm",
						owner: "Faculty",
						timelineAndKpi: "Sem 2 · bump to 75%",
					},
				],
			});
			const regen = await carService.generateFromSubmission(draft.id);
			expect(regen.part5[0]).toMatchObject({
				cloCode: "CLO2",
				rootCauseCategory: "3-Assessment Design",
				intervention: "Add formative feedback before midterm",
			});
		} finally {
			await prisma.auditLog.deleteMany({ where: { moduleAffected: "car" } });
			await prisma.formSubmission.deleteMany({
				where: { formType: { code: "course_assessment_report" } },
			});
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
			await prisma.plo.deleteMany({ where: { programId: ids.program } });
			await prisma.classSection.delete({ where: { id: ids.classSection } });
			await prisma.course.delete({ where: { id: ids.course } });
			await prisma.academicTerm.delete({ where: { id: ids.term } });
			await prisma.program.delete({ where: { id: ids.program } });
			await prisma.department.delete({ where: { id: ids.department } });
			await prisma.user.delete({ where: { id: ids.user } });
			await prisma.formType.deleteMany({
				where: { code: "course_assessment_report" },
			});
		}
	}, 60000);
});
