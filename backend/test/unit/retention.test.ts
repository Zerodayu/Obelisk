import { describe, expect, it } from "bun:test";
import {
	PERMANENT_FORM_CODES,
	RETENTION_FIVE_YEARS,
	RETENTION_PERMANENT,
	retentionClassForCode,
} from "@lib/validators/retention";

describe("retention validators", () => {
	it("exposes the two retention classes", () => {
		expect(RETENTION_FIVE_YEARS).toBe("5 years");
		expect(RETENTION_PERMANENT).toBe("Permanent");
	});

	it("maps longitudinal/audit forms to Permanent", () => {
		expect(PERMANENT_FORM_CODES).toEqual([
			"cohort_tracking",
			"annual_program_report",
			"closing_the_loop",
			"systemic_gap_report",
			"capa_plan",
			"institutional_review",
		]);
		for (const code of PERMANENT_FORM_CODES) {
			expect(retentionClassForCode(code)).toBe(RETENTION_PERMANENT);
		}
	});

	it("defaults everything else to 5 years", () => {
		expect(retentionClassForCode("clo_raw_data")).toBe(RETENTION_FIVE_YEARS);
		expect(retentionClassForCode("course_assessment_report")).toBe(
			RETENTION_FIVE_YEARS,
		);
		expect(retentionClassForCode("unknown-form")).toBe(RETENTION_FIVE_YEARS);
	});
});
