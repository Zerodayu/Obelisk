export const RETENTION_FIVE_YEARS = "5 years";
export const RETENTION_PERMANENT = "Permanent";

export const RETENTION_CLASSES = [
	RETENTION_FIVE_YEARS,
	RETENTION_PERMANENT,
] as const;
export type RetentionClass = (typeof RETENTION_CLASSES)[number];

/**
 * Forms that hold longitudinal/institutional audit evidence and therefore
 * carry the Permanent retention class and strict audit-trail requirement.
 */
export const PERMANENT_FORM_CODES = [
	"cohort_tracking",
	"annual_program_report",
	"closing_the_loop",
	"systemic_gap_report",
	"capa_plan",
	"institutional_review",
] as const;

export type PermanentFormCode = (typeof PERMANENT_FORM_CODES)[number];

export function retentionClassForCode(code: string): RetentionClass {
	return (PERMANENT_FORM_CODES as readonly string[]).includes(code)
		? RETENTION_PERMANENT
		: RETENTION_FIVE_YEARS;
}
