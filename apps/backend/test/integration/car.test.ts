import { describe, expect, it } from "bun:test";

import { prisma } from "@lib/prisma";
import { isDbReachable } from "@test/helpers/db-gate";
import { carService } from "@v1/car/service";
import { submissionService } from "@v1/forms/service";
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
			classSection2: "it-car-section-2",
			user: "it-car-user",
			formType: "it-car-form-type",
		};

		try {
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
			// The faculty account comes after its program — scoped accounts
			// carry their unit, which `carService` reads from the DB row.
			await prisma.user.create({
				data: {
					id: ids.user,
					name: "CAR Faculty",
					email: "car@ingest.test",
					role: "faculty",
					programId: ids.program,
					departmentId: ids.department,
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
			await prisma.clo.create({
				data: {
					id: "it-car-clo-3",
					courseId: ids.course,
					code: "CLO3",
					description: "CLO 3",
				},
			});
			// NOTE: DB map is P1's IPD/weight source until faculty saves them (testing_results 6.4)
			await prisma.cloToPloMap.create({
				data: {
					id: "it-car-map-1",
					cloId: "it-car-clo-1",
					ploId: "it-car-plo-1",
					stage: "i",
					weight: 0.8,
				},
			});
			// NOTE: no facultyId — P1 facultyName must fall back to the run's ETL snapshot (testing_results 6.5)
			await prisma.classSection.create({
				data: {
					id: ids.classSection2,
					courseId: ids.course,
					termId: ids.term,
					sectionCode: "C2",
				},
			});

			let computationRunId = "";

			const summary = await attainmentService.persistAttainment(
				{
					header: {},
					clo_plo_mapping: {},
					// NOTE: snapshot feeds P1 year level/faculty fallbacks (testing_results 6.5)
					section: {
						code: "C1",
						program: "IT-CAR-PROG",
						year_level: 3,
						section_letter: "1",
						raw: "IT-CAR-PROG C1",
					},
					setup: { faculty_name: "ETL Snapshot Faculty" },
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
						{
							// NOTE: no breakdown pcts — P2 must drop this row (testing_results 6.6)
							student_name: "Doe, John",
							student_id: null,
							clo_code: "CLO3",
							direct_clo_attainment_pct: 0.85,
							met_threshold: true,
							tla_pct: null,
							at_pct: null,
							exam_pct: null,
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
				// NOTE: ingest now upserts one Enrollment per student (testing_results 6.5)
				noEnrolled: 2,
				noCompleted: 2,
			});
			expect(car.part1.facultyName).toBe("CAR Faculty");
			// NOTE: section faculty wins over the ETL snapshot faculty
			expect(car.part1.facultyName).not.toBe("ETL Snapshot Faculty");
			// NOTE: no saved formData → year level comes from the run's ETL snapshot (testing_results 6.5)
			expect(car.part1.yearLevel).toBe(3);
			expect(car.part1.cloPloMapping.map((r) => r.cloCode)).toEqual([
				"CLO1",
				"CLO2",
				"CLO3",
			]);
			// NOTE: DB CloToPloMap fills P1 IPD/weight before any save (testing_results 6.4)
			const clo1Row = car.part1.cloPloMapping.find((r) => r.cloCode === "CLO1");
			expect(clo1Row?.ploCode).toBe("PLO1");
			expect(clo1Row?.ipdStage).toBe("i");
			expect(clo1Row?.weightInGradePct).toBe(80);

			// Part 2 — assessment-type means (ETL fractions x100 saved directly).
			const exams = Object.fromEntries(
				car.part2.exams.map((r) => [r.cloCode, r]),
			);
			expect(exams.CLO1.attainmentPct).toBe(100);
			expect(exams.CLO1.belowBenchmark).toBe(false);
			expect(exams.CLO2.attainmentPct).toBe(40);
			expect(exams.CLO2.belowBenchmark).toBe(true);
			// NOTE: all-null breakdown rows are dropped from every P2 list (testing_results 6.6)
			for (const list of [
				car.part2.exams,
				car.part2.rubric,
				car.part2.perfTasks,
				car.part2.portfolio,
			]) {
				expect(list.map((r) => r.cloCode)).not.toContain("CLO3");
			}
			// NOTE: one Enrollment per resolved student, written at ingest (testing_results 6.5)
			expect(
				await prisma.enrollment.count({
					where: { classSectionId: ids.classSection },
				}),
			).toBe(2);

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

			// Saved P1 edits win over both the ETL snapshot and the DB map (6.4).
			await carService.save(draft.id, ids.user, {
				part1: {
					yearLevel: 1,
					cloPloMapping: [
						{ cloCode: "CLO1", ipdStage: "d", weightInGradePct: 45 },
					],
				},
			});
			const p1regen = await carService.generateFromSubmission(draft.id);
			expect(p1regen.part1.yearLevel).toBe(1);
			const savedRow = p1regen.part1.cloPloMapping.find(
				(r) => r.cloCode === "CLO1",
			);
			expect(savedRow?.ipdStage).toBe("d");
			expect(savedRow?.weightInGradePct).toBe(45);

			// The approval screen's justification reuses that same assembled
			// Part 1/2 — Bloom's / I-P-D / assessment evidence as prose
			// (testing_results §2), not the raw formData.
			const carEvidence = await submissionService.evidence(draft.id, {
				id: ids.user,
				role: "faculty",
			});
			expect(carEvidence.justification?.kind).toBe("car");
			const jrow = carEvidence.justification?.rows.find(
				(r) => r.cloCode === "CLO1",
			);
			expect(jrow).toMatchObject({
				ipdStage: "d",
				weightInGradePct: 45,
			});
			expect(
				carEvidence.justification?.notes.some((n) =>
					n.includes("Demonstration (D)"),
				),
			).toBe(true);
			// Part 2 is flattened into one row per CLO × assessment type.
			expect(
				carEvidence.justification?.assessmentEvidence.length,
			).toBeGreaterThan(0);

			// Section2: all-null breakdowns → empty P2 + snapshot-only P1 fields.
			const summary2 = await attainmentService.persistAttainment(
				{
					header: {},
					clo_plo_mapping: {},
					section: {
						code: "C2",
						program: "IT-CAR-PROG",
						year_level: 2,
						section_letter: "2",
						raw: "IT-CAR-PROG C2",
					},
					setup: { faculty_name: "ETL Snapshot Faculty" },
					attainments: [
						{
							student_name: "Doe, John",
							student_id: null,
							clo_code: "CLO1",
							direct_clo_attainment_pct: 0.9,
							met_threshold: true,
							tla_pct: null,
							at_pct: null,
							exam_pct: null,
							output_pct: null,
						},
					],
				},
				ids.classSection2,
				ids.user,
			);
			await carService.ensureDraft(
				ids.classSection2,
				ids.user,
				summary2.computationRunId,
			);
			const car2 = await carService.generate(
				ids.classSection2,
				summary2.computationRunId,
			);
			// NOTE: no breakdown data anywhere → every P2 list is empty so the frontend can show its empty state (testing_results 6.6)
			expect(car2.part2.exams).toEqual([]);
			expect(car2.part2.rubric).toEqual([]);
			expect(car2.part2.perfTasks).toEqual([]);
			expect(car2.part2.portfolio).toEqual([]);
			// NOTE: section has no faculty → P1 falls back to the run's ETL snapshot (testing_results 6.5)
			expect(car2.part1.facultyName).toBe("ETL Snapshot Faculty");
			expect(car2.part1.yearLevel).toBe(2);
		} finally {
			await prisma.auditLog.deleteMany({ where: { moduleAffected: "car" } });
			await prisma.formSubmission.deleteMany({
				where: { formType: { code: "course_assessment_report" } },
			});
			await prisma.atRiskFlag.deleteMany({
				where: { student: { programId: ids.program } },
			});
			await prisma.cloAttainment.deleteMany({
				where: {
					classSectionId: { in: [ids.classSection, ids.classSection2] },
				},
			});
			await prisma.computationRun.deleteMany({
				where: { scope: { in: [ids.classSection, ids.classSection2] } },
			});
			// NOTE: enrollment rows cascade off student/classSection deletes
			await prisma.student.deleteMany({ where: { programId: ids.program } });
			await prisma.clo.deleteMany({ where: { courseId: ids.course } });
			await prisma.plo.deleteMany({ where: { programId: ids.program } });
			await prisma.classSection.deleteMany({
				where: { id: { in: [ids.classSection, ids.classSection2] } },
			});
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
