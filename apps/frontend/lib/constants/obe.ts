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

/**
 * I-P-D stage letters → the manual's spelled-out names. Mirrors the selector
 * in `clo-plo-map-panel.tsx` and the backend's `IPD_STAGE_LABELS`
 * (`apps/backend/lib/forms/justification.ts`).
 */
export const IPD_STAGES: Record<string, { letter: string; label: string }> = {
  i: { letter: "I", label: "Introduction" },
  p: { letter: "P", label: "Proficiency" },
  d: { letter: "D", label: "Demonstration" },
};

/**
 * CAR P1 "Assessment Types" column — the instruments a CLO is evidenced by.
 * Mirrors `ASSESSMENT_GROUP_LABELS` in the backend's
 * `apps/backend/lib/forms/justification.ts`; keep the two in sync so the
 * approval card renders exactly what the CAR form recorded.
 */
export const ASSESSMENT_TYPES = [
  "Exam",
  "Rubric",
  "Perf.Task",
  "Portfolio",
] as const;
