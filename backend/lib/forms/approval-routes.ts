import type { ApproverRole, UserRole } from "@prisma/generated/prisma/enums";
import {
	APPROVAL_CHAIN,
	type ApprovalStepInput,
	validateApprovalChain,
} from "./state-machine";

/**
 * Per-form approval routing + workflow authorization.
 *
 * Each stable form code maps to an {@link ApprovalRoute}: the roles allowed to
 * prepare (submit) the form and the ordered approval chain it descends when
 * submitted. The chains are derived from the JMCFI OBE manual's per-form
 * "Prepared by: X → Y" lines (see `../JMCFI-WIN-OBE-Forms-Digitization-
 * Reference.md`). Parties in the manual that are not `ApproverRole` values
 * (Curriculum Committee, PAC, President, panels) or are only copied/informed
 * (e.g. "copy AQAU") are collapsed out of the chain — they review offline and
 * are not approval steps.
 *
 * The service layer derives `ApprovalStep` rows from this registry on submit;
 * clients never choose the chain. Authorization for the workflow actions
 * (submit / decide / archive) lives here too, so the controller stays thin.
 */

/** Roles that may appear in an approval chain (`ApproverRole` enum values). */
export const APPROVER_ROLES = APPROVAL_CHAIN;

/** Institutional roles that may prepare (submit) forms. */
const INSTITUTIONAL_ROLES = [
	"faculty",
	"program_chair",
	"dean",
	"aqau",
	"vpaa",
] as const satisfies readonly UserRole[];

/** Roles allowed to archive an approved submission. */
export const ARCHIVE_ROLES: readonly string[] = [
	"aqau",
	"vpaa",
	"system_admin",
];

export interface ApprovalRoute {
	/** Roles allowed to prepare/submit this form (`UserRole` values). */
	preparerRoles: readonly UserRole[];
	/** Ordered approval chain — ascending canonical order, may skip roles. */
	chain: readonly ApproverRole[];
}

/**
 * Registry keyed by `FormType.code`. The manual's "Prepared by" party becomes
 * `preparerRoles`; everything after the preparer that is an `ApproverRole`
 * becomes the `chain`.
 */
export const APPROVAL_ROUTES: Record<string, ApprovalRoute> = {
	// --- PLAN-phase setup ------------------------------------------------------
	curriculum_map: {
		// "Program Chair (with Faculty) → Curriculum Committee → AQAU"
		preparerRoles: ["program_chair", "faculty"],
		chain: ["aqau"],
	},
	portfolio_roadmap: {
		// "Program Chair (with Faculty) → Dean → AQAU | Portfolio programs only"
		preparerRoles: ["program_chair", "faculty"],
		chain: ["dean", "aqau"],
	},
	assessment_calendar: {
		// "Program Chair → Dean → AQAU"
		preparerRoles: ["program_chair"],
		chain: ["dean", "aqau"],
	},
	target_setting_matrix: {
		// "Program Chair/Dean → AQAU"
		preparerRoles: ["program_chair", "dean"],
		chain: ["aqau"],
	},
	stakeholder_consultation: {
		// "Program Office/Dean → Program Chair"
		preparerRoles: ["program_chair", "faculty", "dean"],
		chain: ["program_chair"],
	},
	assessment_budget: {
		// "Dean → VPAA (copy AQAU)"
		preparerRoles: ["dean"],
		chain: ["vpaa"],
	},

	// --- DO / data capture -----------------------------------------------------
	clo_raw_data: {
		// "Faculty → Program Chair"
		preparerRoles: ["faculty"],
		chain: ["program_chair"],
	},
	mid_cycle_attainment: {
		// "Faculty → Program Chair"
		preparerRoles: ["faculty"],
		chain: ["program_chair"],
	},
	resource_monitoring: {
		// "Dean/Program Chair → VPAA"
		preparerRoles: ["dean", "program_chair"],
		chain: ["vpaa"],
	},
	peer_observation: {
		// "Program Chair/Senior Faculty → Program Chair" — same-role chain is
		// sanctioned by the manual (the chair may review a senior faculty's form).
		preparerRoles: ["program_chair", "faculty"],
		chain: ["program_chair"],
	},
	exhibition_feedback: {
		// "Program Chair/Industry Liaison → Program Chair"
		preparerRoles: ["program_chair", "faculty"],
		chain: ["program_chair"],
	},
	clo_perception_survey: {
		// "Program Office → Program Chair"
		preparerRoles: ["program_chair", "faculty"],
		chain: ["program_chair"],
	},

	// --- CHECK / roll-up chain -------------------------------------------------
	course_assessment_report: {
		// "Faculty → Program Chair → AQAU"
		preparerRoles: ["faculty"],
		chain: ["program_chair", "dean", "aqau"],
	},
	clo_attainment_summary: {
		// "Faculty → Program Chair"
		preparerRoles: ["faculty"],
		chain: ["program_chair"],
	},
	plo_attainment_summary: {
		// "Program Chair → Dean → AQAU"
		preparerRoles: ["program_chair"],
		chain: ["dean", "aqau"],
	},
	cohort_tracking: {
		// "Program Chair → AQAU"
		preparerRoles: ["program_chair"],
		chain: ["aqau"],
	},
	student_exit_survey: {
		// "Program Office → Program Chair"
		preparerRoles: ["program_chair", "faculty"],
		chain: ["program_chair"],
	},
	portfolio_assessment_record: {
		// "Faculty Panel → AQAU (copy Program Chair)"
		preparerRoles: ["faculty", "program_chair"],
		chain: ["aqau"],
	},
	capstone_panel_evaluation: {
		// "Panel Members → Program Chair → AQAU"
		preparerRoles: ["faculty", "program_chair"],
		chain: ["program_chair", "aqau"],
	},
	alumni_tracer: {
		// "Research/Alumni Office → Program Chair → Dean"
		preparerRoles: ["program_chair", "faculty"],
		chain: ["program_chair", "dean"],
	},
	employer_satisfaction_survey: {
		// "Industry Liaison → Program Chair → Dean"
		preparerRoles: ["program_chair", "faculty"],
		chain: ["program_chair", "dean"],
	},

	// --- ACT / CQI loop --------------------------------------------------------
	plo_gap_analysis: {
		// "Program Chair → Dean"
		preparerRoles: ["program_chair"],
		chain: ["dean"],
	},
	cqi_action_plan: {
		// "Program Chair → Dean (approval) → AQAU"
		preparerRoles: ["program_chair"],
		chain: ["dean", "aqau"],
	},
	annual_program_report: {
		// "Program Chair → Dean → VPAA | Due June 30"
		preparerRoles: ["program_chair"],
		chain: ["dean", "vpaa"],
	},
	closing_the_loop: {
		// "Program Chair → AQAU"
		preparerRoles: ["program_chair"],
		chain: ["aqau"],
	},
	systemic_gap_report: {
		// "Dean → PAC + VPAA (copy AQAU)" — PAC is not an ApproverRole; AQAU is
		// copied only, so the chain is VPAA alone.
		preparerRoles: ["dean"],
		chain: ["vpaa"],
	},
	capa_plan: {
		// "Dean/VPAA → AQAU"
		preparerRoles: ["dean", "vpaa"],
		chain: ["aqau"],
	},
	institutional_review: {
		// "VPAA/QA Office → President" — no President role exists, mapped to VPAA.
		preparerRoles: ["aqau", "vpaa"],
		chain: ["vpaa"],
	},
};

/**
 * Fallback for form codes without an explicit route: any institutional role
 * may prepare, and the submission descends the full canonical chain (the
 * state machine allows later approvers to skip intermediate steps).
 */
export const DEFAULT_APPROVAL_ROUTE: ApprovalRoute = {
	preparerRoles: INSTITUTIONAL_ROLES,
	chain: APPROVAL_CHAIN,
};

/** Resolve the approval route for a form code (falls back to the default). */
export function approvalRouteFor(formTypeCode: string): ApprovalRoute {
	return APPROVAL_ROUTES[formTypeCode] ?? DEFAULT_APPROVAL_ROUTE;
}

/**
 * Materialize a chain as ordered `ApprovalStep` input (1-based sequence nos).
 * Every registered chain is validated by `validateApprovalChain` so a bad
 * registry entry fails fast instead of producing a broken submission.
 */
export function chainSteps(
	chain: readonly ApproverRole[],
): ApprovalStepInput[] {
	const steps = chain.map((approverRole, index) => ({
		approverRole,
		sequenceNo: index + 1,
	}));
	validateApprovalChain(steps);
	return steps;
}

// --- Workflow authorization ---------------------------------------------------

/** 403 — caller's role does not permit this workflow action. */
export class ApprovalForbiddenError extends Error {
	readonly status = 403;
	constructor(message: string) {
		super(message);
		this.name = "ApprovalForbiddenError";
	}
}

/** 403 — caller is not the submission's owner. */
export class NotOwnerError extends Error {
	readonly status = 403;
	constructor(message = "Only the submission owner may perform this action") {
		super(message);
		this.name = "NotOwnerError";
	}
}

/**
 * May `callerRole` decide the pending step for `approverRole`?
 * The caller must hold exactly that role — except `system_admin`, which may
 * act on any step (authorization-matrix override, useful for demos/support).
 */
export function assertCanDecide(
	callerRole: string,
	approverRole: ApproverRole,
): void {
	if (callerRole === "system_admin") return;
	if (callerRole !== approverRole) {
		throw new ApprovalForbiddenError(
			`Only the ${approverRole} (or a system admin) may decide this approval step`,
		);
	}
}

/**
 * May `caller` submit this submission? Requires ownership (or admin) **and**
 * a preparer role from the form's approval route.
 */
export function assertCanSubmit(
	caller: { id: string; role: string },
	submission: { submittedByUserId: string | null },
	route: ApprovalRoute,
): void {
	const isAdmin = caller.role === "system_admin";
	if (!isAdmin) {
		if (submission.submittedByUserId !== caller.id) {
			throw new NotOwnerError();
		}
		if (!(route.preparerRoles as readonly string[]).includes(caller.role)) {
			throw new ApprovalForbiddenError(
				`Your role (${caller.role}) may not prepare this form — expected one of: ${route.preparerRoles.join(", ")}`,
			);
		}
	}
}

/** May `callerRole` archive an approved submission? */
export function assertCanArchive(callerRole: string): void {
	if (!ARCHIVE_ROLES.includes(callerRole)) {
		throw new ApprovalForbiddenError(
			`Only ${ARCHIVE_ROLES.join("/")} may archive submissions`,
		);
	}
}
