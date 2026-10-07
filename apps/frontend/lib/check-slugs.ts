/**
 * CHECK-phase form codes → URL path segment (snake_case → kebab-case).
 *
 * NOTE: kept out of `server/actions/check.ts` on purpose — a `"use server"`
 * module may only export async functions, and re-exporting this object from
 * it makes every CHECK action call die at module eval
 * (`invalid-use-server-value`, no toast either way).
 */

export const CHECK_FORM_SLUGS = {
  mid_cycle_attainment: "mid-cycle-attainment",
  peer_observation: "peer-observation",
  exhibition_feedback: "exhibition-feedback",
  clo_perception_survey: "clo-perception-survey",
  student_exit_survey: "student-exit-survey",
  portfolio_assessment_record: "portfolio-assessment",
  capstone_panel_evaluation: "capstone-panel",
} as const;

export type CheckFormCode = keyof typeof CHECK_FORM_SLUGS;
