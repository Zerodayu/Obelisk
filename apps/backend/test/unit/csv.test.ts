import { describe, expect, it } from "bun:test";
import {
	csvCell,
	csvPercent,
	detectDelimiter,
	parseCsv,
} from "@lib/ingest/csv";

describe("detectDelimiter", () => {
	it("prefers comma when both present", () => {
		expect(detectDelimiter("a,b\tc")).toBe(",");
	});

	it("detects tab-separated headers", () => {
		expect(detectDelimiter("a\tb\tc")).toBe("\t");
	});

	it("falls back to comma for single-cell headers", () => {
		expect(detectDelimiter("student_name")).toBe(",");
	});
});

describe("parseCsv", () => {
	it("parses comma-separated rows", () => {
		expect(parseCsv("a,b,c\n1,2,3")).toEqual([
			["a", "b", "c"],
			["1", "2", "3"],
		]);
	});

	it("auto-detects and parses tab-separated input", () => {
		expect(parseCsv("student_name\tCLO1\nDoe, John\t85")).toEqual([
			["student_name", "CLO1"],
			["Doe, John", "85"],
		]);
	});

	it("handles quoted fields containing the delimiter and quotes", () => {
		expect(parseCsv('a,"b,c","d""e"')).toEqual([["a", "b,c", 'd"e']]);
	});

	it("handles CRLF line endings", () => {
		expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
			["a", "b"],
			["1", "2"],
		]);
	});

	it("skips blank lines", () => {
		expect(parseCsv("a,b\n\n1,2\n")).toEqual([
			["a", "b"],
			["1", "2"],
		]);
	});

	it("returns [] for empty or whitespace-only input", () => {
		expect(parseCsv("")).toEqual([]);
		expect(parseCsv("   \n  ")).toEqual([]);
	});
});

describe("csvCell", () => {
	it("trims and collapses blank cells to undefined", () => {
		expect(csvCell("  Doe  ")).toBe("Doe");
		expect(csvCell("   ")).toBeUndefined();
		expect(csvCell(undefined)).toBeUndefined();
	});
});

describe("csvPercent", () => {
	it("parses 0–100 scale values", () => {
		expect(csvPercent("85")).toBe(85);
		expect(csvPercent("0")).toBe(0);
		expect(csvPercent("100")).toBe(100);
	});

	it("normalizes 0–1 fraction values (ETL output style)", () => {
		expect(csvPercent("0.85")).toBe(85);
		expect(csvPercent("0.7")).toBe(70);
	});

	it("rejects out-of-range and non-numeric cells", () => {
		expect(csvPercent("101")).toBeUndefined();
		expect(csvPercent("-5")).toBeUndefined();
		expect(csvPercent("abc")).toBeUndefined();
		expect(csvPercent("")).toBeUndefined();
		expect(csvPercent(undefined)).toBeUndefined();
	});
});
