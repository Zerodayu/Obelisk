import { describe, expect, it } from "bun:test";

import { approvalRouteFor } from "@lib/forms/approval-routes";
import {
	approvalStepsFor,
	buildAttainments,
	buildHeader,
	cloLevelFor,
	DEMO_CLO_CODES,
	DEMO_STUDENTS,
} from "@prisma/seed-demo-fixtures";

describe("seed-demo fixtures", () => {
	it("builds six students per cohort with unique student numbers", () => {
		expect(DEMO_STUDENTS).toHaveLength(24);
		for (const yearLevel of [1, 2, 3, 4]) {
			expect(
				DEMO_STUDENTS.filter((student) => student.yearLevel === yearLevel),
			).toHaveLength(6);
		}
		expect(new Set(DEMO_STUDENTS.map((s) => s.studentNumber)).size).toBe(24);
	});

	it("emits attainment records that satisfy python's snapshot contract", () => {
		const students = DEMO_STUDENTS.filter((s) => s.yearLevel === 1);
		const records = buildAttainments(students, DEMO_CLO_CODES, 0);

		expect(records).toHaveLength(students.length * DEMO_CLO_CODES.length);
		for (const record of records) {
			expect(typeof record.student_id).toBe("string");
			expect(record.clo_code.startsWith("CLO")).toBe(true);
			// Direct is a 0–1 fraction; composite/indirect are 0–100.
			expect(record.direct_clo_attainment_pct).toBeGreaterThanOrEqual(0);
			expect(record.direct_clo_attainment_pct).toBeLessThanOrEqual(1);
			expect(record.composite_clo_attainment_pct).toBeGreaterThanOrEqual(50);
			expect(record.composite_clo_attainment_pct).toBeLessThanOrEqual(95);
			expect(record.met_threshold).toBe(
				record.composite_clo_attainment_pct >= 70,
			);
			expect(record.clo_level).toBe(
				cloLevelFor(record.composite_clo_attainment_pct),
			);
			expect(record.is_record_complete).toBe(true);
			expect(record.rule1_met).toBe(true);
			expect(record.section_completeness_pct).toBe(1);
			expect(record.formula_version).toBe("70_30_v1");
		}
	});

	it("builds a header with exactly the pydantic ClassRecordHeader keys", () => {
		const header = buildHeader({
			courseCode: "IT 101",
			courseTitle: "Introduction to Computing",
			sectionCode: "Y1",
			schoolYear: "2025-2026",
			semester: "1st Semester",
			studentCount: 6,
		});
		expect(Object.keys(header).sort()).toEqual(
			[
				"course_code",
				"course_title",
				"course_type",
				"section",
				"semester_year",
				"instructor_name",
				"no_of_students",
				"threshold",
				"grading_system",
			].sort(),
		);
		expect(header.no_of_students).toBe(6);
	});

	it("derives approval steps in registry chain order", () => {
		const route = approvalRouteFor("course_assessment_report");
		const submitted = approvalStepsFor(route.chain, "submitted");
		expect(submitted.steps.map((step) => step.approverRole)).toEqual([
			...route.chain,
		]);
		expect(submitted.steps[0].decision).toBe("approved");
		expect(
			submitted.steps.slice(1).every((s) => s.decision === "pending"),
		).toBe(true);
		expect(submitted.currentApproverRole).toBe(route.chain[1]);

		const returned = approvalStepsFor(route.chain, "returned");
		expect(returned.steps[0].decision).toBe("returned");
		expect(returned.currentApproverRole).toBeNull();

		const approved = approvalStepsFor(route.chain, "approved");
		expect(approved.steps.every((step) => step.decision === "approved")).toBe(
			true,
		);
		expect(approved.currentApproverRole).toBeNull();

		expect(approvalStepsFor(route.chain, "draft")).toEqual({
			steps: [],
			currentApproverRole: null,
		});
	});
});
