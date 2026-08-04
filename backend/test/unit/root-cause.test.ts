import { describe, expect, it } from "bun:test";
import {
	assertRootCauseCategory,
	isRootCauseCategory,
	ROOT_CAUSE_CATEGORIES,
} from "@lib/validators/root-cause";

describe("root-cause validators", () => {
	it("exposes the 6 canonical categories in order", () => {
		expect(ROOT_CAUSE_CATEGORIES).toHaveLength(6);
		expect(ROOT_CAUSE_CATEGORIES).toEqual([
			"1-Curriculum Design",
			"2-Instruction & Pedagogy",
			"3-Assessment Design",
			"4-Student Factors",
			"5-Resources & Tools",
			"6-Industry & Field Alignment",
		]);
	});

	it("validates known categories", () => {
		for (const c of ROOT_CAUSE_CATEGORIES) {
			expect(isRootCauseCategory(c)).toBe(true);
		}
	});

	it("rejects unknown categories", () => {
		expect(isRootCauseCategory("7-Other")).toBe(false);
		expect(isRootCauseCategory("")).toBe(false);
	});

	it("asserts a valid category and throws otherwise", () => {
		expect(() => assertRootCauseCategory("3-Assessment Design")).not.toThrow();
		expect(() => assertRootCauseCategory("bogus")).toThrow();
	});
});
