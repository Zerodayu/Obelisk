/**
 * Pure fixtures for `seed-demo.ts` — no DB access, so the exact shapes are
 * unit-tested without a database (`test/unit/seed-demo.test.ts`).
 *
 * NOTE: the attainment records are replayed to python-server's
 * `/analytics/summary` through `ComputationRun.etlSnapshotJson`, so they must
 * keep the pydantic contract in `apps/python-server/app/schemas/class_record.py`:
 * `direct_clo_attainment_pct` is a 0–1 fraction, `composite_clo_attainment_pct`
 * and `indirect_clo_attainment_pct` are 0–100, and `clo_level` is the 4-tier
 * rubric label.
 */

import type { AttainmentRecord } from "@v1/ingest/service";

export const DEMO_PREFIX = "demo-";
export const DEMO_STUDENT_PREFIX = "DEMO-";

/** One course per cohort, so each year level owns a distinct section. */
export const DEMO_COURSE_BY_YEAR: Record<number, string> = {
	1: "IT 101",
	2: "IT 201",
	3: "IT 301",
	4: "CAP 102",
};

export const DEMO_CLO_CODES = ["CLO1", "CLO2", "CLO3", "CLO4", "CLO5"];

/** Three spring terms — the trend chart needs at least two points per cohort. */
export const DEMO_TERMS = [
	{ id: "demo-term-1", schoolYear: "2023-2024", semester: "1st Semester" },
	{ id: "demo-term-2", schoolYear: "2024-2025", semester: "1st Semester" },
	{ id: "demo-term-3", schoolYear: "2025-2026", semester: "1st Semester" },
] as const;

export interface DemoStudentSeed {
	studentNumber: string;
	firstName: string;
	lastName: string;
	yearLevel: number;
}

const NAMES_BY_YEAR: Array<Array<[string, string]>> = [
	// Y1
	[
		["Santos", "Ana"],
		["Reyes", "Marco"],
		["Cruz", "Liza"],
		["Bautista", "Noel"],
		["Garcia", "Trisha"],
		["Mendoza", "Paolo"],
	],
	// Y2
	[
		["Lim", "Bianca"],
		["Torres", "Miguel"],
		["Ramos", "Ella"],
		["Villanueva", "Carlo"],
		["Aquino", "Joy"],
		["Domingo", "Rafael"],
	],
	// Y3
	[
		["Navarro", "Kim"],
		["Salazar", "Andre"],
		["Fernandez", "Mia"],
		["Ocampo", "Jules"],
		["Alvarez", "Nina"],
		["Castillo", "Ben"],
	],
	// Y4
	[
		["Pascual", "Dana"],
		["Soriano", "Kyle"],
		["Velasco", "Ivy"],
		["Gonzales", "Luis"],
		["Padilla", "Rica"],
		["Mercado", "Tomas"],
	],
];

/** 24 demo students — six per cohort, fixed student numbers for idempotency. */
export const DEMO_STUDENTS: DemoStudentSeed[] = NAMES_BY_YEAR.flatMap(
	(names, yearIndex) =>
		names.map(([lastName, firstName], studentIndex) => ({
			studentNumber: `${DEMO_STUDENT_PREFIX}${yearIndex + 1}${String(
				studentIndex + 1,
			).padStart(2, "0")}`,
			firstName,
			lastName,
			yearLevel: yearIndex + 1,
		})),
);

/** 0–100 composite score; Y1 dips below the 70% floor so gaps/CQI have data. */
export function compositeScoreFor(
	yearLevel: number,
	termIndex: number,
	studentIndex: number,
	cloIndex: number,
): number {
	const base = [62, 68, 72, 76][yearLevel - 1] ?? 68;
	const drift = termIndex * 2;
	const student = ((studentIndex * 5) % 7) - 3;
	const cloOffsets = [-6, 2, -8, 3, -4];
	const studentBonus = studentIndex % 4 === 0 ? 6 : 0;
	const clo = cloOffsets[cloIndex] ?? 0;
	const raw = base + drift + student + clo + studentBonus;
	return Math.round(Math.min(95, Math.max(50, raw)) * 10) / 10;
}

export function cloLevelFor(
	compositePct: number,
): "Exceptional" | "Proficient" | "Basic" | "Below Basic" {
	if (compositePct >= 90) return "Exceptional";
	if (compositePct >= 70) return "Proficient";
	if (compositePct >= 60) return "Basic";
	return "Below Basic";
}

/**
 * Snapshot attainment record. The extra pydantic-only fields are part of the
 * object literal (not the TS `AttainmentRecord`), so the ETL snapshot replayed
 * to python-server validates without dropping keys.
 */
export type DemoAttainment = AttainmentRecord & {
	indirect_clo_attainment_pct: number;
	composite_clo_attainment_pct: number;
	clo_level: "Exceptional" | "Proficient" | "Basic" | "Below Basic";
	is_record_complete: boolean;
	section_completeness_pct: number;
	rule1_met: boolean;
	excluded_reason: null;
	formula_version: string;
};

export function buildAttainments(
	students: DemoStudentSeed[],
	cloCodes: string[],
	termIndex: number,
): DemoAttainment[] {
	return students.flatMap((student, studentIndex) =>
		cloCodes.map((cloCode, cloIndex) => {
			const composite = compositeScoreFor(
				student.yearLevel,
				termIndex,
				studentIndex,
				cloIndex,
			);
			const direct = Math.round((composite / 100) * 10000) / 10000;
			return {
				student_name: `${student.lastName}, ${student.firstName}`,
				student_id: student.studentNumber,
				clo_code: cloCode,
				direct_clo_attainment_pct: direct,
				indirect_clo_attainment_pct: composite,
				composite_clo_attainment_pct: composite,
				met_threshold: composite >= 70,
				clo_level: cloLevelFor(composite),
				is_record_complete: true,
				section_completeness_pct: 1,
				rule1_met: true,
				excluded_reason: null,
				formula_version: "70_30_v1",
				tla_pct: direct,
				at_pct: direct,
				exam_pct: direct,
				output_pct: direct,
			};
		}),
	);
}

/** Header that satisfies python's `ClassRecordHeader` (`extra="forbid"`). */
export function buildHeader(input: {
	courseCode: string;
	courseTitle: string;
	sectionCode: string;
	schoolYear: string;
	semester: string;
	studentCount: number;
}): Record<string, unknown> {
	return {
		course_code: input.courseCode,
		course_title: input.courseTitle,
		course_type: "Major",
		section: input.sectionCode,
		semester_year: `${input.schoolYear} ${input.semester}`,
		instructor_name: "Faculty User",
		no_of_students: input.studentCount,
		threshold: 70,
		grading_system: "AUN-OBE",
	};
}

export type DemoSubmissionStatus =
	| "draft"
	| "submitted"
	| "returned"
	| "approved"
	| "archived";

/**
 * Approval steps for a seeded submission, mirroring what the forms service
 * derives on submit: decisions follow the registry's chain order and the
 * current approver is the first pending rung (null unless `submitted`).
 */
export function approvalStepsFor(
	chain: readonly string[],
	status: DemoSubmissionStatus,
): {
	steps: Array<{
		approverRole: string;
		decision: "pending" | "approved" | "returned";
	}>;
	currentApproverRole: string | null;
} {
	if (status === "draft") {
		return { steps: [], currentApproverRole: null };
	}

	if (status === "returned") {
		return {
			steps: chain.map((approverRole, index) => ({
				approverRole,
				decision: index === 0 ? "returned" : "pending",
			})),
			currentApproverRole: null,
		};
	}

	if (status === "submitted") {
		const pendingIndex = Math.min(1, Math.max(0, chain.length - 1));
		return {
			steps: chain.map((approverRole, index) => ({
				approverRole,
				decision: index < pendingIndex ? "approved" : "pending",
			})),
			currentApproverRole: chain[pendingIndex] ?? null,
		};
	}

	return {
		steps: chain.map((approverRole) => ({
			approverRole,
			decision: "approved" as const,
		})),
		currentApproverRole: null,
	};
}
