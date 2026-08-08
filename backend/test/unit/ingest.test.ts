import { describe, expect, it } from "bun:test";
import { normalizeName, parseStudentName } from "@lib/ingest/name-utils";

describe("parseStudentName", () => {
	it("parses comma-separated `Last, First` names", () => {
		expect(parseStudentName("Dela Cruz, Juan")).toEqual({
			lastName: "Dela Cruz",
			firstName: "Juan",
		});
	});

	it("parses `First Last` names", () => {
		expect(parseStudentName("Juan Dela Cruz")).toEqual({
			lastName: "Cruz",
			firstName: "Juan Dela",
		});
	});

	it("trims surrounding whitespace in comma form", () => {
		expect(parseStudentName("  Reyes,  Maria  ")).toEqual({
			lastName: "Reyes",
			firstName: "Maria",
		});
	});

	it("returns an empty firstName when only a lastName is provided", () => {
		expect(parseStudentName("Reyes,")).toEqual({
			lastName: "Reyes",
			firstName: "",
		});
	});

	it("handles a single-name record with an empty firstName", () => {
		expect(parseStudentName("Reyes")).toEqual({
			lastName: "Reyes",
			firstName: "",
		});
	});
});

describe("normalizeName", () => {
	it("lowercases and strips punctuation for loose matching", () => {
		expect(normalizeName("Dela Cruz, Juan")).toBe("delacruzjuan");
		expect(normalizeName("O'Neil, Mary-Anne")).toBe("oneilmaryanne");
	});

	it("removes whitespace entirely", () => {
		expect(normalizeName("  Juan   Dela  Cruz ")).toBe("juandelacruz");
	});

	it("matches identical normalized names regardless of case", () => {
		expect(normalizeName("Juan Dela Cruz")).toBe(
			normalizeName("JUAN DELA CRUZ"),
		);
	});
});
