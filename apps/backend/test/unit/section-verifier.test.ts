import { describe, expect, it } from "bun:test";

import {
	type AcademicContextForComparison,
	compareSectionToWorkbook,
	extractSchoolYear,
	normalizeSemester,
} from "@v1/ingest/section-verifier";

const BASE_CLASS_SECTION: AcademicContextForComparison = {
	sectionCode: "1A",
	course: {
		code: "IT 101",
		program: {
			code: "BSIT",
		},
	},
	term: {
		schoolYear: "2026-2027",
		semester: "1st Semester",
	},
};

describe("section-verifier: helpers", () => {
	it("extractSchoolYear extracts year pairs from various formats", () => {
		expect(extractSchoolYear("1st Sem, AY 2026-2027")).toBe("2026-2027");
		expect(extractSchoolYear("AY 2025 – 2026")).toBe("2025-2026");
		expect(extractSchoolYear("2026-2027")).toBe("2026-2027");
		expect(extractSchoolYear("No year here")).toBeNull();
		expect(extractSchoolYear(null)).toBeNull();
	});

	it("normalizeSemester standardizes semester indicators", () => {
		expect(normalizeSemester("1st Semester")).toBe("1");
		expect(normalizeSemester("1st Sem")).toBe("1");
		expect(normalizeSemester("1st")).toBe("1");
		expect(normalizeSemester("1")).toBe("1");
		expect(normalizeSemester("First Semester")).toBe("1");

		expect(normalizeSemester("2nd Semester")).toBe("2");
		expect(normalizeSemester("2nd Sem")).toBe("2");
		expect(normalizeSemester("2nd")).toBe("2");
		expect(normalizeSemester("Second")).toBe("2");
		expect(normalizeSemester("2")).toBe("2");

		expect(normalizeSemester("Summer 2026")).toBe("summer");
		expect(normalizeSemester("Midyear")).toBe("summer");
		expect(normalizeSemester(null)).toBeNull();
	});
});

describe("section-verifier: compareSectionToWorkbook", () => {
	it("returns match when section and program match exactly with extraction ok", () => {
		const result = compareSectionToWorkbook(BASE_CLASS_SECTION, {
			section_extraction: "ok",
			section: {
				code: "1A",
				program: "BSIT",
				year_level: 1,
				section_letter: "A",
				raw: "BSIT - 1A",
			},
			setup: {
				course_code: "IT 101",
				course_title: "Introduction to Computing",
				term: "1st Sem, AY 2026-2027",
				program: "BSIT",
			},
		});

		expect(result.status).toBe("match");
		expect(result.mismatches).toHaveLength(0);
		expect(result.warnings).toHaveLength(0);
	});

	it("matches regardless of casing and whitespace differences", () => {
		const result = compareSectionToWorkbook(
			{
				...BASE_CLASS_SECTION,
				sectionCode: " 1a ",
				course: {
					code: " it 101 ",
					program: { code: " bsit " },
				},
			},
			{
				section_extraction: "ok",
				section: {
					code: "1A",
					program: "BSIT",
					year_level: 1,
					section_letter: "A",
					raw: "BSIT - 1A",
				},
				setup: {
					course_code: "IT101",
					term: "1st Semester, AY 2026-2027",
				},
			},
		);

		expect(result.status).toBe("match");
		expect(result.mismatches).toHaveLength(0);
	});

	it("returns mismatch when section code differs", () => {
		const result = compareSectionToWorkbook(BASE_CLASS_SECTION, {
			section_extraction: "ok",
			section: {
				code: "2B",
				program: "BSIT",
				year_level: 2,
				section_letter: "B",
				raw: "BSIT - 2B",
			},
		});

		expect(result.status).toBe("mismatch");
		expect(result.mismatches.length).toBeGreaterThanOrEqual(1);
		expect(result.mismatches[0]).toContain(
			'Workbook section "2B" does not match selected section "1A"',
		);
	});

	it("returns mismatch when program differs (section.program vs course.program.code)", () => {
		const result = compareSectionToWorkbook(BASE_CLASS_SECTION, {
			section_extraction: "ok",
			section: {
				code: "1A",
				program: "BSCS",
				year_level: 1,
				section_letter: "A",
				raw: "BSCS - 1A",
			},
		});

		expect(result.status).toBe("mismatch");
		expect(result.mismatches.length).toBeGreaterThanOrEqual(1);
		expect(result.mismatches[0]).toContain(
			'Workbook program "BSCS" does not match selected program "BSIT"',
		);
	});

	it("does NOT mismatch when setup.program differs but section.program matches", () => {
		const result = compareSectionToWorkbook(BASE_CLASS_SECTION, {
			section_extraction: "ok",
			section: {
				code: "1A",
				program: "BSIT",
				year_level: 1,
				section_letter: "A",
				raw: "BSIT - 1A",
			},
			setup: {
				program: "SOME_OTHER_TEXT", // Should NOT cause mismatch
			},
		});

		expect(result.status).toBe("match");
		expect(result.mismatches).toHaveLength(0);
	});

	it("returns unverified and records warning for each extraction failure status", () => {
		const failureStatuses = [
			"missing_sheet",
			"missing_field",
			"unparseable",
			undefined,
		] as const;

		for (const st of failureStatuses) {
			const result = compareSectionToWorkbook(BASE_CLASS_SECTION, {
				section_extraction: st,
				section: {
					code: "2B", // Even if different, unverified takes precedence
					program: "BSCS",
					year_level: 2,
					section_letter: "B",
					raw: "BSCS - 2B",
				},
			});

			expect(result.status).toBe("unverified");
			expect(result.mismatches).toHaveLength(0);
			expect(result.warnings.some((w) => w.includes("unverified"))).toBe(true);
		}
	});

	it("emits warnings only for course code differences without causing mismatch", () => {
		const result = compareSectionToWorkbook(BASE_CLASS_SECTION, {
			section_extraction: "ok",
			section: {
				code: "1A",
				program: "BSIT",
				year_level: 1,
				section_letter: "A",
				raw: "BSIT - 1A",
			},
			setup: {
				course_code: "IT 102", // Different course!
			},
		});

		expect(result.status).toBe("match");
		expect(result.mismatches).toHaveLength(0);
		expect(result.warnings.some((w) => w.includes("IT 102"))).toBe(true);
	});

	it("emits warnings only for term / semester differences without causing mismatch", () => {
		const result = compareSectionToWorkbook(BASE_CLASS_SECTION, {
			section_extraction: "ok",
			section: {
				code: "1A",
				program: "BSIT",
				year_level: 1,
				section_letter: "A",
				raw: "BSIT - 1A",
			},
			setup: {
				term: "2nd Sem, AY 2027-2028", // Different sem and year
			},
		});

		expect(result.status).toBe("match");
		expect(result.mismatches).toHaveLength(0);
		expect(result.warnings.length).toBeGreaterThanOrEqual(1);
	});

	it("handles null / undefined loaded fields safely", () => {
		const result = compareSectionToWorkbook(BASE_CLASS_SECTION, {
			section_extraction: "missing_sheet",
			section: null,
			setup: null,
		});

		expect(result.status).toBe("unverified");
		expect(result.mismatches).toHaveLength(0);
		expect(result.warnings.length).toBeGreaterThanOrEqual(1);
	});
});
