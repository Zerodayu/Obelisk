/**
 * Per-form tag registry — client mirror of `apps/backend/lib/forms/form-tags.ts`
 * (the manual's Tag legend: Setup / Record / Submit / Live), drift-guarded by
 * `apps/backend/test/unit/form-tags-sync.test.ts`. Pure data module.
 *
 * Setup/Record forms file with no approval chain; the "My Submissions" inbox
 * shows only forms that descend one (`formNeedsApproval`).
 */

export type FormTag = "setup" | "record" | "submit" | "live";

/** Manual tags for every registered stable form code (explicit, no inference). */
export const FORM_TAGS: Record<string, FormTag> = {
	// --- Setup — filed once, read by everything else, no approval ---
	curriculum_map: "setup",
	portfolio_roadmap: "setup",
	assessment_calendar: "setup",
	target_setting_matrix: "setup",

	// --- Record — retained for accreditation, no approval ---
	clo_raw_data: "record",
	exhibition_feedback: "record",
	clo_attainment_summary: "record",
	cohort_tracking: "record",
	portfolio_assessment_record: "record",
	capstone_panel_evaluation: "record",

	// --- Live — approved, then kept open across cycles ---
	cqi_action_plan: "live",
	capa_plan: "live",

	// --- Submit — full approval chain ---
	stakeholder_consultation: "submit",
	assessment_budget: "submit",
	mid_cycle_attainment: "submit",
	resource_monitoring: "submit",
	peer_observation: "submit",
	clo_perception_survey: "submit",
	course_assessment_report: "submit",
	plo_attainment_summary: "submit",
	student_exit_survey: "submit",
	alumni_tracer: "submit",
	employer_satisfaction_survey: "submit",
	plo_gap_analysis: "submit",
	annual_program_report: "submit",
	closing_the_loop: "submit",
	systemic_gap_report: "submit",
	institutional_review: "submit",
	action_taken: "submit",
};

/** The manual's tag for a code; unknown codes default to `submit`. */
export function formTag(code: string): FormTag {
	return FORM_TAGS[code] ?? "submit";
}

/** Does this form descend an approval chain? False for Setup/Record tags. */
export function formNeedsApproval(code: string): boolean {
	const tag = formTag(code);
	return tag !== "setup" && tag !== "record";
}
