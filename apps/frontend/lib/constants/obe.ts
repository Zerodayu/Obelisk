/** Fixed 6 root-cause categories used across CQI, gap analysis, and CAR forms. */
export const ROOT_CAUSES = [
  "1-Curriculum Design",
  "2-Instruction & Pedagogy",
  "3-Assessment Design",
  "4-Student Factors",
  "5-Resources & Tools",
  "6-Industry & Field Alignment",
] as const;

/** Bloom's taxonomy levels — CAR P1 CLO mapping table. */
export const BLOOMS_LEVELS = [
  "Remember",
  "Understand",
  "Apply",
  "Analyze",
  "Evaluate",
  "Create",
] as const;
