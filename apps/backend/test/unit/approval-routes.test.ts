import { describe, expect, it } from "bun:test";
import {
	APPROVAL_ROUTES,
	ApprovalForbiddenError,
	ARCHIVE_ROLES,
	approvalRouteFor,
	assertCanArchive,
	assertCanDecide,
	assertCanSubmit,
	chainSteps,
	DEFAULT_APPROVAL_ROUTE,
	NotOwnerError,
} from "@lib/forms/approval-routes";
import {
	APPROVAL_CHAIN,
	validateApprovalChain,
} from "@lib/forms/state-machine";

/** Every stable form code from the catalog (backend/SYSTEM-DESIGN.md §5). */
const ALL_FORM_CODES = [
	"curriculum_map",
	"portfolio_roadmap",
	"assessment_calendar",
	"target_setting_matrix",
	"stakeholder_consultation",
	"assessment_budget",
	"clo_raw_data",
	"mid_cycle_attainment",
	"resource_monitoring",
	"peer_observation",
	"exhibition_feedback",
	"clo_perception_survey",
	"course_assessment_report",
	"clo_attainment_summary",
	"plo_attainment_summary",
	"cohort_tracking",
	"student_exit_survey",
	"portfolio_assessment_record",
	"capstone_panel_evaluation",
	"alumni_tracer",
	"employer_satisfaction_survey",
	"plo_gap_analysis",
	"cqi_action_plan",
	"annual_program_report",
	"closing_the_loop",
	"systemic_gap_report",
	"capa_plan",
	"institutional_review",
];

const VALID_USER_ROLES = [
	"user",
	"faculty",
	"program_chair",
	"dean",
	"aqau",
	"vpaa",
	"system_admin",
];

describe("approval routes registry", () => {
	it("covers every stable form code", () => {
		for (const code of ALL_FORM_CODES) {
			expect(APPROVAL_ROUTES[code]).toBeDefined();
		}
	});

	it("registers only valid roles in every route", () => {
		for (const [code, route] of Object.entries(APPROVAL_ROUTES)) {
			expect(route.chain.length).toBeGreaterThan(0);
			for (const role of route.chain) {
				expect(APPROVAL_CHAIN).toContain(role);
			}
			expect(route.preparerRoles.length).toBeGreaterThan(0);
			for (const role of route.preparerRoles) {
				expect(VALID_USER_ROLES).toContain(role);
			}
			// Chains must ascend the canonical order (skipping allowed).
			expect(() => validateApprovalChain(chainSteps(route.chain))).not.toThrow(
				`${code} chain must be ascending`,
			);
		}
	});

	it("falls back to the full canonical chain for unknown codes", () => {
		const route = approvalRouteFor("some_future_form");
		expect(route).toBe(DEFAULT_APPROVAL_ROUTE);
		expect(route.chain).toEqual(["program_chair", "dean", "aqau", "vpaa"]);
	});

	it("materializes steps with 1-based sequence numbers", () => {
		expect(chainSteps(["dean", "aqau"])).toEqual([
			{ approverRole: "dean", sequenceNo: 1 },
			{ approverRole: "aqau", sequenceNo: 2 },
		]);
	});

	it("uses the manual's chain for representative forms", () => {
		// "Faculty → Program Chair"
		expect(approvalRouteFor("clo_raw_data").chain).toEqual(["program_chair"]);
		// "Faculty → Program Chair → AQAU"
		expect(approvalRouteFor("course_assessment_report").chain).toEqual([
			"program_chair",
			"dean",
			"aqau",
		]);
		// "Dean → VPAA (copy AQAU)" — AQAU is copied only, not a step.
		expect(approvalRouteFor("assessment_budget").chain).toEqual(["vpaa"]);
		// "Program Chair → Dean → VPAA"
		expect(approvalRouteFor("annual_program_report").chain).toEqual([
			"dean",
			"vpaa",
		]);
	});
});

describe("workflow authorization", () => {
	it("lets only the step's role decide (admin overrides)", () => {
		expect(() =>
			assertCanDecide("program_chair", "program_chair"),
		).not.toThrow();
		expect(() => assertCanDecide("dean", "program_chair")).toThrow(
			ApprovalForbiddenError,
		);
		expect(() => assertCanDecide("faculty", "program_chair")).toThrow(
			ApprovalForbiddenError,
		);
		expect(() => assertCanDecide("system_admin", "vpaa")).not.toThrow();
	});

	it("requires owner + preparer role to submit", () => {
		const route = approvalRouteFor("clo_raw_data"); // preparers: faculty, program_chair
		const owner = { id: "u1", role: "faculty" };

		expect(() =>
			assertCanSubmit(owner, { submittedByUserId: "u1" }, route),
		).not.toThrow();

		// Wrong preparer role.
		expect(() =>
			assertCanSubmit(
				{ id: "u1", role: "dean" },
				{ submittedByUserId: "u1" },
				route,
			),
		).toThrow(ApprovalForbiddenError);

		// Right role, not the owner.
		expect(() =>
			assertCanSubmit(owner, { submittedByUserId: "someone-else" }, route),
		).toThrow(NotOwnerError);

		// system_admin bypasses both checks.
		expect(() =>
			assertCanSubmit(
				{ id: "admin", role: "system_admin" },
				{ submittedByUserId: "someone-else" },
				route,
			),
		).not.toThrow();
	});

	it("restricts archiving to vpaa/system_admin", () => {
		expect(ARCHIVE_ROLES).toEqual(["vpaa", "system_admin"]);
		expect(() => assertCanArchive("vpaa")).not.toThrow();
		expect(() => assertCanArchive("system_admin")).not.toThrow();
		expect(() => assertCanArchive("aqau")).toThrow(ApprovalForbiddenError);
		expect(() => assertCanArchive("faculty")).toThrow(ApprovalForbiddenError);
		expect(() => assertCanArchive("dean")).toThrow(ApprovalForbiddenError);
	});

	it("lets faculty and program chairs prepare class records", () => {
		expect(approvalRouteFor("clo_raw_data").preparerRoles).toEqual([
			"faculty",
			"program_chair",
		]);
	});
});
