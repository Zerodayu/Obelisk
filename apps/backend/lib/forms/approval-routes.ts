import { ARCHIVE_ROLES } from "@lib/role-access";
import type { ApproverRole, UserRole } from "@prisma/generated/prisma/enums";

import {
	APPROVAL_CHAIN,
	type ApprovalStepInput,
	validateApprovalChain,
} from "./state-machine";

/**
 * Canonical location for the archive allow-list is `lib/role-access.ts`
 * (the role → feature vocabulary); re-exported here because the archive
 * workflow action lives in this module.
 */
export { ARCHIVE_ROLES };

/**
 * Per-form approval routing + workflow authorization.
 *
 * Each stable form code maps to an {@link ApprovalRoute}: the roles allowed to
 * prepare (submit) the form and the ordered approval chain it descends when
 * submitted. The chains start where the JMCFI OBE manual's per-form
 * "Prepared by: X → Y" lines start (see `../JMCFI-WIN-OBE-Forms-Digitization-
 * Reference.md`), then ascend to VPAA — two institutional rules apply on top
 * of the manual (both written as code below, not conventions):
 *
 *  1. **Every chain reaches the VPAA.** A chain keeps the manual's *entry
 *     point* and fills in every canonical role it skips above that point, so
 *     approval always continues up the ladder to `vpaa`
 *     ({@link ascendToVpaa}). The VPAA is the top of the hierarchy and the
 *     final review before archive.
 *  2. **The VPAA never prepares a form.** It holds no `preparerRoles` entry
 *     anywhere (registry or {@link DEFAULT_APPROVAL_ROUTE}); its only verbs on
 *     a submission are reviewing (the final approve/return step), generating
 *     the AI report, and archiving.
 *
 * Parties in the manual that are not `ApproverRole` values (Curriculum
 * Committee, PAC, President, panels) or are only copied/informed (e.g. "copy
 * AQAU") are collapsed out of the chain — they review offline and are not
 * approval steps.
 *
 * The service layer derives `ApprovalStep` rows from this registry on submit;
 * clients never choose the chain. Authorization for the workflow actions
 * (submit / decide / archive) lives here too, so the controller stays thin.
 */

/** Roles that may appear in an approval chain (`ApproverRole` enum values). */
export const APPROVER_ROLES = APPROVAL_CHAIN;

/**
 * Roles that may prepare (submit) a form on the default (unregistered-code)
 * route. `vpaa` is deliberately absent: the top of the hierarchy reviews
 * (final approval), generates the AI report, and archives — it never
 * originates a submission.
 */
const INSTITUTIONAL_ROLES = [
	"faculty",
	"program_chair",
	"dean",
	"aqau",
] as const satisfies readonly UserRole[];

export interface ApprovalRoute {
	/**
	 * Roles allowed to prepare/submit this form (`UserRole` values).
	 * Never contains `vpaa` — the top role only reviews and archives.
	 */
	preparerRoles: readonly UserRole[];
	/**
	 * Ordered approval chain — ascending canonical order, contiguous from its
	 * entry role through `vpaa` (built with {@link ascendToVpaa}).
	 */
	chain: readonly ApproverRole[];
}

/**
 * Extend an entry chain upward to VPAA (institutional rule 1 in the module
 * header).
 *
 * The manual still decides where a chain *enters*; this helper keeps that
 * entry role and fills in every canonical role the manual's line skips above
 * it, so approval always continues up the ladder to `vpaa`:
 *
 * - `["program_chair"]` → `[program_chair, dean, aqau, vpaa]`
 * - `["dean", "aqau"]` → `[dean, aqau, vpaa]`
 * - `["aqau"]` → `[aqau, vpaa]`
 * - `["vpaa"]` → `[vpaa]` (already at the top)
 *
 * Throws at module load on an empty or non-ascending base chain, so a bad
 * registry entry fails fast instead of producing a broken submission.
 */
export function ascendToVpaa(
	base: readonly ApproverRole[],
): readonly ApproverRole[] {
	if (base.length === 0) {
		throw new Error("ascendToVpaa: entry chain must not be empty");
	}
	validateApprovalChain(
		base.map((approverRole, index) => ({
			approverRole,
			sequenceNo: index + 1,
		})),
	);
	const entry = APPROVAL_CHAIN.indexOf(base[0]);
	if (entry === -1) {
		throw new Error(`ascendToVpaa: unknown approver role ${base[0]}`);
	}
	return APPROVAL_CHAIN.slice(entry);
}

/**
 * Registry keyed by `FormType.code`. The manual's "Prepared by" party becomes
 * `preparerRoles`; the first `ApproverRole` after the preparer is the chain's
 * entry point, and {@link ascendToVpaa} climbs from it to the VPAA.
 */
export const APPROVAL_ROUTES: Record<string, ApprovalRoute> = {
	// --- PLAN-phase setup ------------------------------------------------------
	curriculum_map: {
		// "Program Chair → Curriculum Committee → AQAU" — Faculty co-prepares
		// (the manual names the Program Chair alone); Curriculum Committee is
		// not an ApproverRole, so the chain enters at AQAU.
		preparerRoles: ["program_chair", "faculty"],
		chain: ascendToVpaa(["aqau"]),
	},
	portfolio_roadmap: {
		// "Program Chair (with Faculty) → Dean → AQAU | Portfolio programs only"
		preparerRoles: ["program_chair", "faculty"],
		chain: ascendToVpaa(["dean", "aqau"]),
	},
	assessment_calendar: {
		// "Program Chair → Dean → AQAU"
		preparerRoles: ["program_chair"],
		chain: ascendToVpaa(["dean", "aqau"]),
	},
	target_setting_matrix: {
		// "Program Chair/Dean → AQAU"
		preparerRoles: ["program_chair", "dean"],
		chain: ascendToVpaa(["aqau"]),
	},
	stakeholder_consultation: {
		// "Program Office/Dean → Program Chair"
		preparerRoles: ["program_chair", "faculty", "dean"],
		chain: ascendToVpaa(["program_chair"]),
	},
	assessment_budget: {
		// "Dean → VPAA (copy AQAU)"
		preparerRoles: ["dean"],
		chain: ascendToVpaa(["vpaa"]),
	},

	// --- DO / data capture -----------------------------------------------------
	clo_raw_data: {
		// "Faculty → Program Chair" — chairs capture on behalf of their program.
		preparerRoles: ["faculty", "program_chair"],
		chain: ascendToVpaa(["program_chair"]),
	},
	mid_cycle_attainment: {
		// "Faculty → Program Chair"
		preparerRoles: ["faculty"],
		chain: ascendToVpaa(["program_chair"]),
	},
	resource_monitoring: {
		// "Dean/Program Chair → VPAA"
		preparerRoles: ["dean", "program_chair"],
		chain: ascendToVpaa(["vpaa"]),
	},
	peer_observation: {
		// "Program Chair/Senior Faculty → Program Chair" — same-role chain is
		// sanctioned by the manual (the chair may review a senior faculty's form).
		preparerRoles: ["program_chair", "faculty"],
		chain: ascendToVpaa(["program_chair"]),
	},
	exhibition_feedback: {
		// "Program Chair/Industry Liaison → Program Chair"
		preparerRoles: ["program_chair", "faculty"],
		chain: ascendToVpaa(["program_chair"]),
	},
	clo_perception_survey: {
		// "Program Office → Program Chair"
		preparerRoles: ["program_chair", "faculty"],
		chain: ascendToVpaa(["program_chair"]),
	},

	// --- CHECK / roll-up chain -------------------------------------------------
	course_assessment_report: {
		// "Faculty → Program Chair → AQAU"
		preparerRoles: ["faculty"],
		chain: ascendToVpaa(["program_chair", "dean", "aqau"]),
	},
	clo_attainment_summary: {
		// "Faculty → Program Chair"
		preparerRoles: ["faculty"],
		chain: ascendToVpaa(["program_chair"]),
	},
	plo_attainment_summary: {
		// "Program Chair → Dean → AQAU"
		preparerRoles: ["program_chair"],
		chain: ascendToVpaa(["dean", "aqau"]),
	},
	cohort_tracking: {
		// "Program Chair → AQAU"
		preparerRoles: ["program_chair"],
		chain: ascendToVpaa(["aqau"]),
	},
	student_exit_survey: {
		// "Program Office → Program Chair"
		preparerRoles: ["program_chair", "faculty"],
		chain: ascendToVpaa(["program_chair"]),
	},
	portfolio_assessment_record: {
		// "Faculty Panel → AQAU (copy Program Chair)"
		preparerRoles: ["faculty", "program_chair"],
		chain: ascendToVpaa(["aqau"]),
	},
	capstone_panel_evaluation: {
		// "Panel Members → Program Chair → AQAU"
		preparerRoles: ["faculty", "program_chair"],
		chain: ascendToVpaa(["program_chair", "aqau"]),
	},
	alumni_tracer: {
		// "Research/Alumni Office → Program Chair → Dean"
		preparerRoles: ["program_chair", "faculty"],
		chain: ascendToVpaa(["program_chair", "dean"]),
	},
	employer_satisfaction_survey: {
		// "Industry Liaison → Program Chair → Dean"
		preparerRoles: ["program_chair", "faculty"],
		chain: ascendToVpaa(["program_chair", "dean"]),
	},

	// --- ACT / CQI loop --------------------------------------------------------
	plo_gap_analysis: {
		// "Program Chair → Dean"
		preparerRoles: ["program_chair"],
		chain: ascendToVpaa(["dean"]),
	},
	cqi_action_plan: {
		// "Program Chair → Dean (approval) → AQAU"
		preparerRoles: ["program_chair"],
		chain: ascendToVpaa(["dean", "aqau"]),
	},
	annual_program_report: {
		// "Program Chair → Dean → VPAA | Due June 30" — AQAU reviews in between
		// (rule 1 fills every skipped rung on the way up).
		preparerRoles: ["program_chair"],
		chain: ascendToVpaa(["dean", "vpaa"]),
	},
	closing_the_loop: {
		// "Program Chair → AQAU"
		preparerRoles: ["program_chair"],
		chain: ascendToVpaa(["aqau"]),
	},
	systemic_gap_report: {
		// "Dean → PAC + VPAA (copy AQAU)" — PAC is not an ApproverRole; AQAU is
		// copied only, so the chain is VPAA alone.
		preparerRoles: ["dean"],
		chain: ascendToVpaa(["vpaa"]),
	},
	capa_plan: {
		// "Dean/VPAA → AQAU" — VPAA drops off the preparer side (rule 2 above);
		// it still reviews and archives downstream.
		preparerRoles: ["dean"],
		chain: ascendToVpaa(["aqau"]),
	},
	institutional_review: {
		// "VPAA/QA Office → President" — no President role exists, mapped to
		// VPAA; AQAU alone prepares (rule 2: VPAA never originates a submission).
		preparerRoles: ["aqau"],
		chain: ascendToVpaa(["vpaa"]),
	},

	// --- ACT / at-risk intervention ---------------------------------------------
	// Not in the manual — client requirement (see system-docs/roadmap.md): the faculty member
	// who flagged an at-risk student records the intervention; it ascends
	// chair → dean → AQAU → VPAA, and the FINAL approval (VPAA) clears the
	// student's AtRiskFlag rows — the effect runs on the last step, per
	// `lib/forms/approval-effects.ts`.
	action_taken: {
		// "Faculty/Program Chair → Program Chair"
		preparerRoles: ["faculty", "program_chair"],
		chain: ascendToVpaa(["program_chair"]),
	},
};

/**
 * Fallback for form codes without an explicit route: any institutional role
 * **except the VPAA** may prepare (rule 2 — the top role never originates a
 * submission), and the submission descends the full canonical chain to VPAA.
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
 * May `caller` **approve** a submission they prepared themselves? Never —
 * ten registered routes give `program_chair` both the preparer list and
 * rung 1, so without this the owner's own row lands in their pending inbox
 * and they could sign off on it. The owner may still *return* (withdraw)
 * their own row; that is checked separately by the caller.
 * shortcut: same-role approval by ANOTHER user stays allowed (the manual
 * sanctions the role overlap, e.g. peer_observation) — upgrade to a
 * distinct-signer split if accreditation requires it.
 */
export function assertNotSelfApproval(
	caller: { id: string; role: string },
	submission: { submittedByUserId: string | null },
): void {
	if (caller.role === "system_admin") return;
	if (submission.submittedByUserId === caller.id) {
		throw new ApprovalForbiddenError(
			"You may not approve your own submission — another holder of this role must sign it",
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
