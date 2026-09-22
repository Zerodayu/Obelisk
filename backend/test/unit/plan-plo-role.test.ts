import { describe, expect, it } from "bun:test";
import { assertCanManagePlos, PloForbiddenError } from "@v1/plan/compute";

describe("PLO management role guard", () => {
	it("lets the dean manage PLOs", () => {
		expect(() => assertCanManagePlos("dean")).not.toThrow();
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
			expect(() => assertCanManagePlos(role)).toThrow(PloForbiddenError);
		}
	});
});
