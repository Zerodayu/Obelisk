/**
 * Periodic / institutional form codes → URL path segment (snake_case →
 * kebab-case), matching the backend `/api/v1/periodic/*` route names.
 *
 * NOTE: kept out of `server/actions/periodic.ts` on purpose — a `"use server"`
 * module may only export async functions, and re-exporting this object from it
 * makes every periodic action call die at module eval
 * (`invalid-use-server-value`, no toast either way). Same rule as
 * `lib/check-slugs.ts`.
 *
 * Only the four manual-named forms are wired today (F09/F26/F27/F28); the
 * remaining periodic screens (alumni_tracer, employer_survey,
 * portfolio_roadmap) are still unbuilt — see `system-docs/roadmap.md`.
 */

export const PERIODIC_FORM_SLUGS = {
	resource_monitoring: "resource-monitoring",
	systemic_gap_report: "systemic-gap-report",
	capa_plan: "capa-plan",
	institutional_review: "institutional-review",
} as const;

export type PeriodicFormCode = keyof typeof PERIODIC_FORM_SLUGS;
