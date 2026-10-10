import { describe, expect, it } from "bun:test";

import { APPROVAL_ROUTES, approvalRouteFor } from "@lib/forms/approval-routes";
import { formMetaFor } from "@lib/forms/form-meta";
import {
	PERMANENT_FORM_CODES,
	RETENTION_FIVE_YEARS,
	retentionClassForCode,
} from "@lib/validators/retention";

/** The 7 headings in the reference doc that carry a deadline line. */
const DEADLINE_CODES = [
	"alumni_tracer",
	"employer_satisfaction_survey",
	"annual_program_report",
	"closing_the_loop",
	"systemic_gap_report",
	"capa_plan",
	"institutional_review",
];

describe("form metadata registry", () => {
	it("returns metadata for every registered form code", () => {
		const codes = Object.keys(APPROVAL_ROUTES);
		expect(codes.length).toBeGreaterThan(0);
		for (const code of codes) {
			const meta = formMetaFor(code);
			expect(meta.retention).toBeDefined();
			expect(meta.responsibleParty.preparers.length).toBeGreaterThan(0);
			expect(meta.responsibleParty.chain.length).toBeGreaterThan(0);
		}
	});

	it("derives retention from the shared validator, not a copy", () => {
		for (const code of Object.keys(APPROVAL_ROUTES)) {
			expect(formMetaFor(code).retention).toBe(retentionClassForCode(code));
		}
		for (const code of PERMANENT_FORM_CODES) {
			expect(formMetaFor(code).retention).toBe("Permanent");
		}
		expect(formMetaFor("course_assessment_report").retention).toBe(
			RETENTION_FIVE_YEARS,
		);
	});

	it("mirrors the canonical approval route as the responsible party", () => {
		for (const code of Object.keys(APPROVAL_ROUTES)) {
			const route = approvalRouteFor(code);
			const party = formMetaFor(code).responsibleParty;
			expect(party.preparers).toEqual(route.preparerRoles);
			expect(party.chain).toEqual(route.chain);
		}
		// Manual line: "Program Chair (with Faculty) → Curriculum Committee → AQAU"
		const cm = formMetaFor("curriculum_map").responsibleParty;
		expect(cm.preparers).toEqual(["program_chair", "faculty"]);
		expect(cm.chain).toEqual(["aqau", "vpaa"]);
	});

	it("carries a deadline for exactly the forms that state one", () => {
		const withDeadline = Object.keys(APPROVAL_ROUTES)
			.filter((code) => formMetaFor(code).deadline !== undefined)
			.sort();
		expect(withDeadline).toEqual([...DEADLINE_CODES].sort());

		expect(formMetaFor("annual_program_report").deadline).toBe("Due June 30");
		expect(formMetaFor("institutional_review").deadline).toBe("Due July 15");
		expect(formMetaFor("employer_satisfaction_survey").deadline).toBe(
			"Biennial",
		);
		// No stated deadline → row omitted rather than padded.
		expect(formMetaFor("course_assessment_report")).not.toHaveProperty(
			"deadline",
		);
	});

	it("falls back to the default route for an unregistered code", () => {
		const meta = formMetaFor("unknown-form");
		expect(meta.retention).toBe(retentionClassForCode("unknown-form"));
		expect(meta.responsibleParty.chain).toEqual(
			approvalRouteFor("unknown-form").chain,
		);
		expect(meta).not.toHaveProperty("deadline");
	});
});
