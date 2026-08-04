export const ROOT_CAUSE_CATEGORIES = [
	"1-Curriculum Design",
	"2-Instruction & Pedagogy",
	"3-Assessment Design",
	"4-Student Factors",
	"5-Resources & Tools",
	"6-Industry & Field Alignment",
] as const;

export type RootCauseCategory = (typeof ROOT_CAUSE_CATEGORIES)[number];

export function isRootCauseCategory(value: string): value is RootCauseCategory {
	return (ROOT_CAUSE_CATEGORIES as readonly string[]).includes(value);
}

export function assertRootCauseCategory(
	value: string,
): asserts value is RootCauseCategory {
	if (!isRootCauseCategory(value)) {
		throw new Error(
			`Invalid root-cause category "${value}". Expected one of: ${ROOT_CAUSE_CATEGORIES.join(", ")}`,
		);
	}
}
