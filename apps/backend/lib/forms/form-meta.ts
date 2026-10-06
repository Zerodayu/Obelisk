/**
 * Standard-header metadata for the approval screen (Tier 2 of the approval
 * steps enrichment) — the JMCFI WIN-OBE manual's per-form header line:
 * PDCA phase, retention class, responsible party, deadline.
 * (`system-docs/JMCFI-WIN-OBE-Forms-Digitization-Reference.md`)
 *
 * Data-only registry keyed by stable form code, same keying as
 * `approval-routes.ts`. Derived rather than stored: retention comes from the
 * shared `retentionClassForCode` validator and the responsible party from the
 * canonical approval route, so neither can drift from the workflow it
 * describes.
 *
 * NOTE: only fields the reference doc actually specifies per form are exposed.
 * Its Evidence Type and Purpose lines appear in the *generic* header template
 * only — there is no per-form value to transcribe, so they are deliberately
 * omitted rather than invented.
 */

import { approvalRouteFor } from "@lib/forms/approval-routes";
import {
	type RetentionClass,
	retentionClassForCode,
} from "@lib/validators/retention";
import type { ApproverRole, UserRole } from "@prisma/generated/prisma/enums";

/**
 * Manual-deadline lines, transcribed verbatim from the per-form headings that
 * carry one (7 of 28). Codes absent here have no stated deadline — the row is
 * omitted, not shown as "N/A".
 */
const DEADLINE_FOR_CODE: Record<string, string> = {
	alumni_tracer: "Biennial",
	employer_satisfaction_survey: "Biennial",
	annual_program_report: "Due June 30",
	closing_the_loop: "Due end of each AY",
	systemic_gap_report: "Within 30 days of 3rd consecutive failure",
	capa_plan: "Before next AY opens",
	institutional_review: "Due July 15",
};

export interface FormMeta {
	retention: RetentionClass;
	/**
	 * The manual's "Prepared by: A → B → C" line, split into the roles allowed
	 * to originate the form and the ordered chain that reviews it. Role *codes*
	 * — the caller owns display labels (`ROLE_LABELS` on the frontend).
	 */
	responsibleParty: {
		preparers: readonly UserRole[];
		chain: readonly ApproverRole[];
	};
	/** Undefined when the manual states no deadline for this form. */
	deadline?: string;
}

/**
 * Resolve the header metadata for a form code.
 *
 * Unregistered codes fall back through `approvalRouteFor` to the default
 * route, so every submission gets a usable block.
 */
export function formMetaFor(formTypeCode: string): FormMeta {
	// FIXME: the reference doc marks alumni_tracer / employer_satisfaction_survey
	// as Permanent, but `PERMANENT_FORM_CODES` (and the backend AGENTS retention
	// rule) list only 6 codes — the manual-faithful fix would be a domain-rule
	// change, so the shared validator wins here until that is reconciled.
	const route = approvalRouteFor(formTypeCode);
	const deadline = DEADLINE_FOR_CODE[formTypeCode];

	return {
		retention: retentionClassForCode(formTypeCode),
		responsibleParty: {
			preparers: route.preparerRoles,
			chain: route.chain,
		},
		...(deadline ? { deadline } : {}),
	};
}
