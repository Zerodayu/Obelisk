import { describe, expect, it } from "bun:test";

import {
	assertCanDirectManagePlos,
	assertCanProposePlos,
	PloForbiddenError,
} from "@v1/plan/compute";

describe("PLO management role guard", () => {
	it("lets the dean author/approve PLOs directly", () => {
		expect(() => assertCanDirectManagePlos("dean")).not.toThrow();
	});

	it("lets the program chair propose PLOs", () => {
		expect(() => assertCanProposePlos("program_chair")).not.toThrow();
	});

	it("rejects every other role", () => {
		for (const role of [
			"faculty",
			"program_chair",
			"aqau",
			"vpaa",
			"system_admin",
			"user",
			undefined,
		]) {
			expect(() => assertCanDirectManagePlos(role)).toThrow(PloForbiddenError);
		}
		for (const role of [
			"faculty",
			"dean",
			"aqau",
			"vpaa",
			"system_admin",
			"user",
			undefined,
		]) {
			expect(() => assertCanProposePlos(role)).toThrow(PloForbiddenError);
		}
	});
});
