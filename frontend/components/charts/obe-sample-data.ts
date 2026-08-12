/**
 * Hardcoded sample datasets for charts, mirroring the backend database
 * (`backend/prisma/schema/*.prisma`). Every interface below maps to a backend
 * model — field names and units follow the server contract so each chart
 * component can later be switched from `MOCK_*` to real rollup data without
 * changing its shape.
 *
 * These are placeholders only: nothing here is computed or authoritative. The
 * backend remains the source of truth (frontend renders, never re-derives).
 *
 * ── Dataset catalogue ────────────────────────────────────────────────────────
 * Classification:
 *   [direct]      Maps 1:1 to a Prisma model (same rows/fields).
 *   [derived]     Computed rollup of one or more models (no single table).
 *   [form-data]   Rollup of a form whose field structure lives in
 *                 `FormSubmission.formData` JSON (surfaced by a future rollup
 *                 endpoint), not a dedicated Prisma table.
 *
 *   Dataset                     Kind       Backend source
 *   ──────────────────────────  ─────────  ─────────────────────────────────────
 *   MOCK_CLO_ATTAINMENTS        derived    CloAttainment (per-CLO class average)
 *   MOCK_PLO_ATTAINMENTS        direct     PloAttainment + Plo
 *   MOCK_COHORT_TRENDS          derived    CloAttainment × AcademicTerm × Student.yearLevel
 *   MOCK_SCORE_BANDS            derived    CloAttainment.compositeScorePct → 4-tier rubric
 *   MOCK_AT_RISK                direct     AtRiskFlag (grouped by reason)
 *   MOCK_FORM_STATUSES          direct     FormSubmission.status
 *   MOCK_APPROVAL_FLOW          direct     ApprovalStep (per ApproverRole)
 *   MOCK_PLO_GAPS               derived    PloAttainment + Plo.targetAttainmentPct
 *   MOCK_ROOT_CAUSES            derived    6-category root-cause constant
 *   MOCK_LOOP_STATUSES          derived    CTL computed loop statuses
 *   MOCK_BUDGET_LINES           form-data  assessment_budget form
 *   MOCK_CURRICULUM_COVERAGE    direct     CloToPloMap
 *   MOCK_SCHEDULE               form-data  assessment_calendar form
 *   MOCK_TARGET_SETTINGS        form-data  target_setting_matrix form
 *   MOCK_AUDIT_ACTIVITY         direct     AuditLog (grouped by module)
 *   MOCK_RECOMMENDATIONS        direct     AiRecommendation.status
 *   MOCK_CLUSTER_COMPOSITION    direct     GraduationClusterEntry.studentStatusAtArchive
 *   MOCK_CQI_ACTIONS            form-data  cqi_action_plan form
 *   MOCK_PEO_ATTAINMENTS        direct     PeoAttainment + Peo
 *   MOCK_UPLOAD_STATUSES        direct     UploadRecord.status
 *   MOCK_EXPORT_FORMATS         direct     ReportExport.format
 *   MOCK_FORM_TYPE_STAGES       direct     FormType.pdcaStage
 *   MOCK_PLO_TO_PEO_COVERAGE    direct     PloToPeoMap
 *   MOCK_ASSESSMENT_TYPES       direct     AssessmentItem.type
 *   MOCK_STUDENT_YEAR_LEVELS    direct     Student.yearLevel
 *   MOCK_USER_ROLES             direct     user.role
 *   MOCK_CLUSTER_STATUSES       direct     GraduationCluster.status
 *   MOCK_COMPUTATION_RUNS       direct     ComputationRun
 *
 * ── Consistency rules honoured across every dataset ─────────────────────────
 *   - Composite CLO attainment = Direct × 70% + Indirect × 30%.
 *   - isBelowThreshold = true when the class-average composite < 70%.
 *   - Every target/benchmark ≥ 70% (hard floor).
 *   - PLO gap = targetAttainmentPct − attainedPct (same numbers as the PLO chart).
 *   - Score-band counts sum to the same class size the at-risk watchlist draws from.
 *   - Root-cause categories / loop statuses match the canonical enums.
 */

/** Mirrors `CloAttainment` — one row per CLO for the active computation run. */
export interface CloAttainmentDatum {
  cloCode: string; // Clo.code
  cloDescription: string; // Clo.description
  directScorePct: number; // CloAttainment.directScorePct (class average)
  indirectScorePct: number; // CloAttainment.indirectScorePct (class average)
  compositeScorePct: number; // CloAttainment.compositeScorePct = direct×0.70 + indirect×0.30
  isBelowThreshold: boolean; // CloAttainment.isBelowThreshold (class average < 70%)
}

/** Mirrors `PloAttainment` joined with `Plo.targetAttainmentPct`. */
export interface PloAttainmentDatum {
  ploCode: string; // Plo.code
  description: string; // Plo.description
  attainedPct: number; // PloAttainment.attainedPct
  targetAttainmentPct: number; // Plo.targetAttainmentPct (≥70% hard floor)
  studentsBelowTargetCount: number; // PloAttainment.studentsBelowTargetCount
}

/** Longitudinal cohort row — `CloAttainment` × `AcademicTerm` × `Student.yearLevel`. */
export interface CohortTrendDatum {
  term: string; // e.g. "2024-1S" (derived from AcademicTerm schoolYear + semester)
  cohort: string; // "Y1" | "Y2" | "Y3" | "Y4" (Student.yearLevel)
  compositeScorePct: number; // composite attainment for that cohort-term
}

/** Mirrors `AtRiskFlag` grouped by reason. */
export interface AtRiskDatum {
  reason: string; // AtRiskFlag.reason (free text, grouped)
  studentCount: number; // count of flagged students
}

/** Mirrors `FormSubmission.status` distribution. */
export interface FormStatusDatum {
  status: "draft" | "submitted" | "returned" | "approved" | "archived";
  count: number;
}

/** Mirrors `ApprovalStep` — decisions across the approval chain. */
export interface ApprovalFlowDatum {
  approverRole: "program_chair" | "dean" | "aqau" | "vpaa";
  pending: number;
  approved: number;
  returned: number;
}

/** Mirrors `PloAttainment` gap row (ACT phase). gap = target − attained. */
export interface PloGapDatum {
  ploCode: string;
  targetAttainmentPct: number;
  attainedPct: number;
  gap: number; // targetAttainmentPct - attainedPct
}

/** Mirrors the 6-category root cause enum used across gap/CQI/systemic forms. */
export interface RootCauseDatum {
  category:
    | "Curriculum Design"
    | "Instruction & Pedagogy"
    | "Assessment Design"
    | "Student Factors"
    | "Resources & Tools"
    | "Industry & Field Alignment";
  count: number;
}

/** Mirrors the CTL report's computed loop statuses. */
export interface LoopStatusDatum {
  status: "CLOSED" | "OPEN — Re-assess" | "OPEN — Not Implemented";
  count: number;
}

/** Rollup of the `assessment_budget` form — line items grouped by PDCA phase. */
export interface BudgetLineDatum {
  lineItem: string;
  phase: "PLAN" | "DO" | "CHECK" | "ACT";
  planned: number; // approved budget (PHP)
  spent: number; // actual spend
}

/** Mirrors `CloToPloMap` coverage matrix for the curriculum map. */
export interface CurriculumCoverageDatum {
  cloCode: string;
  ploCode: string;
  weight: number; // CloToPloMap.weight (0 = unmapped)
}

/** Rollup of the `assessment_calendar` form — scheduled items per month. */
export interface ScheduleDatum {
  month: string;
  directAssessments: number;
  indirectAssessments: number;
}

/** Mirrors the 4-tier attainment band of the rubric (Exceptional→Below Basic). */
export interface ScoreBandDatum {
  band:
    | "Exceptional (9-10)"
    | "Proficient (7-8)"
    | "Basic (6)"
    | "Below Basic (≤5)";
  studentCount: number;
}

/** Mirrors `AuditLog` grouped by module over time. */
export interface AuditActivityDatum {
  module: string; // AuditLog.moduleAffected
  count: number;
}

/** Mirrors `AiRecommendation.status` distribution. */
export interface RecommendationStatusDatum {
  status: "pending_review" | "acknowledged" | "actioned" | "dismissed";
  count: number;
}

/** Mirrors `GraduationClusterEntry.studentStatusAtArchive` distribution. */
export interface ClusterCompositionDatum {
  status: string;
  studentCount: number;
}

/** Rollup of the `cqi_action_plan` form — planned vs completed per category. */
export interface CqiActionDatum {
  rootCause: string;
  planned: number;
  completed: number;
}

/** Rollup of the `target_setting_matrix` form — target vs current attainment. */
export interface TargetSettingDatum {
  yearLevel: string; // "Y1" | "Y2" | "Y3" | "Y4"
  targetAttainmentPct: number; // ≥70% hard floor
  currentAttainmentPct: number;
}

// ── Datasets that do not have a chart yet (kept ready for future rollups) ──

/** Mirrors `PeoAttainment` joined with `Peo` (biennial, per term). */
export interface PeoAttainmentDatum {
  peoCode: string; // Peo.code
  description: string; // Peo.description
  attainedPct: number; // PeoAttainment.attainedPct
  targetAttainmentPct: number; // PEO target (≥70% hard floor)
}

/** Mirrors `UploadRecord.status` distribution (class-record ingestion). */
export interface UploadStatusDatum {
  status: "queued" | "completed" | "failed"; // UploadStatus
  count: number;
}

/** Mirrors `ReportExport.format` distribution. */
export interface ExportFormatDatum {
  format: "pdf" | "excel" | "word"; // ExportFormat
  count: number;
}

/** Mirrors `FormType.pdcaStage` distribution (the 28-form catalog). */
export interface FormTypeStageDatum {
  stage: "PLAN" | "DO" | "CHECK" | "ACT"; // FormType.pdcaStage
  formTypeCount: number;
}

/** Mirrors `PloToPeoMap` coverage matrix. */
export interface PloToPeoCoverageDatum {
  ploCode: string;
  peoCode: string;
  mapped: boolean; // presence of a PloToPeoMap row
}

/** Mirrors `AssessmentItem.type` distribution. */
export interface AssessmentTypeDatum {
  type: "direct" | "indirect"; // AssessmentType
  itemCount: number;
}

/** Mirrors `Student.yearLevel` distribution. */
export interface StudentYearLevelDatum {
  yearLevel: 1 | 2 | 3 | 4; // Student.yearLevel
  studentCount: number;
}

/** Mirrors `user.role` distribution. */
export interface UserRoleDatum {
  role:
    | "user"
    | "faculty"
    | "program_chair"
    | "dean"
    | "aqau"
    | "vpaa"
    | "system_admin";
  userCount: number;
}

/** Mirrors `GraduationCluster.status` distribution. */
export interface ClusterStatusDatum {
  status: "open" | "compiling" | "archived"; // GraduationClusterStatus
  clusterCount: number;
}

/** Mirrors `ComputationRun` volume per term (70/30 formula runs). */
export interface ComputationRunDatum {
  term: string; // AcademicTerm (schoolYear + semester)
  runCount: number; // ComputationRun rows in that term
  formulaVersion: string; // ComputationRun.formulaVersion
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock datasets
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_CLO_ATTAINMENTS: CloAttainmentDatum[] = [
  {
    cloCode: "CLO1",
    cloDescription: "Analyze software requirements",
    directScorePct: 82.4,
    indirectScorePct: 76.0,
    compositeScorePct: 80.5,
    isBelowThreshold: false,
  },
  {
    cloCode: "CLO2",
    cloDescription: "Design testable components",
    directScorePct: 74.1,
    indirectScorePct: 72.5,
    compositeScorePct: 73.6,
    isBelowThreshold: false,
  },
  {
    cloCode: "CLO3",
    cloDescription: "Implement systems using modern tooling",
    directScorePct: 66.8,
    indirectScorePct: 70.2,
    compositeScorePct: 67.8,
    isBelowThreshold: true,
  },
  {
    cloCode: "CLO4",
    cloDescription: "Evaluate outcomes against acceptance criteria",
    directScorePct: 77.9,
    indirectScorePct: 78.0,
    compositeScorePct: 77.9,
    isBelowThreshold: false,
  },
  {
    cloCode: "CLO5",
    cloDescription: "Communicate technical decisions effectively",
    directScorePct: 69.3,
    indirectScorePct: 71.0,
    compositeScorePct: 69.8,
    isBelowThreshold: true,
  },
];

export const MOCK_PLO_ATTAINMENTS: PloAttainmentDatum[] = [
  {
    ploCode: "PLO1",
    description: "Apply computing fundamentals",
    attainedPct: 81.2,
    targetAttainmentPct: 70,
    studentsBelowTargetCount: 4,
  },
  {
    ploCode: "PLO2",
    description: "Design and implement solutions",
    attainedPct: 68.4,
    targetAttainmentPct: 70,
    studentsBelowTargetCount: 9,
  },
  {
    ploCode: "PLO3",
    description: "Integrate ethical, professional practice",
    attainedPct: 85.0,
    targetAttainmentPct: 70,
    studentsBelowTargetCount: 2,
  },
  {
    ploCode: "PLO4",
    description: "Collaborate and communicate in teams",
    attainedPct: 76.6,
    targetAttainmentPct: 70,
    studentsBelowTargetCount: 5,
  },
];

export const MOCK_COHORT_TRENDS: CohortTrendDatum[] = [
  { term: "2023-1S", cohort: "Y1", compositeScorePct: 74.0 },
  { term: "2023-2S", cohort: "Y1", compositeScorePct: 76.5 },
  { term: "2024-1S", cohort: "Y1", compositeScorePct: 78.2 },
  { term: "2024-2S", cohort: "Y1", compositeScorePct: 80.1 },
  { term: "2023-1S", cohort: "Y2", compositeScorePct: 75.8 },
  { term: "2023-2S", cohort: "Y2", compositeScorePct: 78.0 },
  { term: "2024-1S", cohort: "Y2", compositeScorePct: 79.4 },
  { term: "2024-2S", cohort: "Y2", compositeScorePct: 81.5 },
  { term: "2023-1S", cohort: "Y3", compositeScorePct: 77.3 },
  { term: "2023-2S", cohort: "Y3", compositeScorePct: 79.1 },
  { term: "2024-1S", cohort: "Y3", compositeScorePct: 82.0 },
  { term: "2024-2S", cohort: "Y3", compositeScorePct: 83.4 },
  { term: "2023-1S", cohort: "Y4", compositeScorePct: 79.9 },
  { term: "2023-2S", cohort: "Y4", compositeScorePct: 81.3 },
  { term: "2024-1S", cohort: "Y4", compositeScorePct: 84.6 },
  { term: "2024-2S", cohort: "Y4", compositeScorePct: 85.8 },
];

export const MOCK_AT_RISK: AtRiskDatum[] = [
  { reason: "Below 70% in direct CLO score", studentCount: 12 },
  { reason: "Below 70% in indirect CLO score", studentCount: 7 },
  { reason: "Multiple CLOs under threshold", studentCount: 5 },
];

export const MOCK_FORM_STATUSES: FormStatusDatum[] = [
  { status: "draft", count: 18 },
  { status: "submitted", count: 24 },
  { status: "returned", count: 9 },
  { status: "approved", count: 31 },
  { status: "archived", count: 12 },
];

export const MOCK_APPROVAL_FLOW: ApprovalFlowDatum[] = [
  { approverRole: "program_chair", pending: 6, approved: 14, returned: 3 },
  { approverRole: "dean", pending: 4, approved: 11, returned: 2 },
  { approverRole: "aqau", pending: 2, approved: 9, returned: 1 },
  { approverRole: "vpaa", pending: 1, approved: 5, returned: 0 },
];

export const MOCK_PLO_GAPS: PloGapDatum[] = [
  { ploCode: "PLO1", targetAttainmentPct: 70, attainedPct: 81.2, gap: -11.2 },
  { ploCode: "PLO2", targetAttainmentPct: 70, attainedPct: 68.4, gap: 1.6 },
  { ploCode: "PLO3", targetAttainmentPct: 70, attainedPct: 85.0, gap: -15.0 },
  { ploCode: "PLO4", targetAttainmentPct: 70, attainedPct: 76.6, gap: -6.6 },
];

export const MOCK_ROOT_CAUSES: RootCauseDatum[] = [
  { category: "Curriculum Design", count: 3 },
  { category: "Instruction & Pedagogy", count: 5 },
  { category: "Assessment Design", count: 4 },
  { category: "Student Factors", count: 6 },
  { category: "Resources & Tools", count: 2 },
  { category: "Industry & Field Alignment", count: 1 },
];

export const MOCK_LOOP_STATUSES: LoopStatusDatum[] = [
  { status: "CLOSED", count: 9 },
  { status: "OPEN — Re-assess", count: 4 },
  { status: "OPEN — Not Implemented", count: 2 },
];

export const MOCK_BUDGET_LINES: BudgetLineDatum[] = [
  {
    lineItem: "Assessment tooling & licences",
    phase: "PLAN",
    planned: 120000,
    spent: 108000,
  },
  {
    lineItem: "Faculty calibration sessions",
    phase: "PLAN",
    planned: 45000,
    spent: 45000,
  },
  {
    lineItem: "CLO-PLO mapping workshops",
    phase: "PLAN",
    planned: 30000,
    spent: 28500,
  },
  {
    lineItem: "Printing & reproduction",
    phase: "DO",
    planned: 60000,
    spent: 59000,
  },
  { lineItem: "Venue & logistics", phase: "DO", planned: 80000, spent: 74000 },
  {
    lineItem: "Assessment proctoring & support",
    phase: "DO",
    planned: 40000,
    spent: 37500,
  },
  {
    lineItem: "Portfolio platform subscription",
    phase: "DO",
    planned: 55000,
    spent: 52000,
  },
  {
    lineItem: "Data processing & analytics",
    phase: "CHECK",
    planned: 90000,
    spent: 61000,
  },
  {
    lineItem: "External evaluator honoraria",
    phase: "CHECK",
    planned: 150000,
    spent: 150000,
  },
  {
    lineItem: "Student survey administration",
    phase: "CHECK",
    planned: 25000,
    spent: 25000,
  },
  {
    lineItem: "CQI intervention materials",
    phase: "ACT",
    planned: 110000,
    spent: 95000,
  },
  {
    lineItem: "Improvement plan dissemination",
    phase: "ACT",
    planned: 35000,
    spent: 22000,
  },
];

export const MOCK_CURRICULUM_COVERAGE: CurriculumCoverageDatum[] = [
  { cloCode: "CLO1", ploCode: "PLO1", weight: 1 },
  { cloCode: "CLO1", ploCode: "PLO2", weight: 0.5 },
  { cloCode: "CLO1", ploCode: "PLO3", weight: 0.25 },
  { cloCode: "CLO2", ploCode: "PLO2", weight: 1 },
  { cloCode: "CLO2", ploCode: "PLO4", weight: 0.5 },
  { cloCode: "CLO3", ploCode: "PLO2", weight: 0.5 },
  { cloCode: "CLO3", ploCode: "PLO1", weight: 0.25 },
  { cloCode: "CLO4", ploCode: "PLO4", weight: 1 },
  { cloCode: "CLO4", ploCode: "PLO3", weight: 0.5 },
  { cloCode: "CLO5", ploCode: "PLO3", weight: 0.5 },
  { cloCode: "CLO5", ploCode: "PLO4", weight: 0.5 },
];

export const MOCK_SCHEDULE: ScheduleDatum[] = [
  { month: "Aug", directAssessments: 3, indirectAssessments: 1 },
  { month: "Sep", directAssessments: 6, indirectAssessments: 2 },
  { month: "Oct", directAssessments: 8, indirectAssessments: 2 },
  { month: "Nov", directAssessments: 5, indirectAssessments: 3 },
  { month: "Dec", directAssessments: 2, indirectAssessments: 1 },
  { month: "Jan", directAssessments: 4, indirectAssessments: 2 },
  { month: "Feb", directAssessments: 7, indirectAssessments: 2 },
  { month: "Mar", directAssessments: 9, indirectAssessments: 3 },
  { month: "Apr", directAssessments: 6, indirectAssessments: 2 },
  { month: "May", directAssessments: 3, indirectAssessments: 1 },
];

export const MOCK_SCORE_BANDS: ScoreBandDatum[] = [
  { band: "Exceptional (9-10)", studentCount: 14 },
  { band: "Proficient (7-8)", studentCount: 32 },
  { band: "Basic (6)", studentCount: 18 },
  { band: "Below Basic (≤5)", studentCount: 11 },
];

export const MOCK_AUDIT_ACTIVITY: AuditActivityDatum[] = [
  { module: "forms", count: 86 },
  { module: "auth", count: 41 },
  { module: "attainment", count: 23 },
  { module: "approvals", count: 18 },
  { module: "exports", count: 9 },
  { module: "archives", count: 3 },
];

export const MOCK_RECOMMENDATIONS: RecommendationStatusDatum[] = [
  { status: "pending_review", count: 7 },
  { status: "acknowledged", count: 5 },
  { status: "actioned", count: 11 },
  { status: "dismissed", count: 3 },
];

export const MOCK_CLUSTER_COMPOSITION: ClusterCompositionDatum[] = [
  { status: "graduated", studentCount: 42 },
  { status: "transferee", studentCount: 3 },
  { status: "withdrawn", studentCount: 2 },
];

export const MOCK_CQI_ACTIONS: CqiActionDatum[] = [
  { rootCause: "Instruction & Pedagogy", planned: 6, completed: 4 },
  { rootCause: "Student Factors", planned: 5, completed: 2 },
  { rootCause: "Assessment Design", planned: 4, completed: 4 },
  { rootCause: "Curriculum Design", planned: 3, completed: 1 },
  { rootCause: "Resources & Tools", planned: 2, completed: 2 },
  { rootCause: "Industry & Field Alignment", planned: 1, completed: 0 },
];

export const MOCK_TARGET_SETTINGS: TargetSettingDatum[] = [
  { yearLevel: "Y1", targetAttainmentPct: 70, currentAttainmentPct: 74.0 },
  { yearLevel: "Y2", targetAttainmentPct: 72, currentAttainmentPct: 75.8 },
  { yearLevel: "Y3", targetAttainmentPct: 74, currentAttainmentPct: 77.3 },
  { yearLevel: "Y4", targetAttainmentPct: 76, currentAttainmentPct: 79.9 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Mock datasets without a chart yet (ready for future rollup endpoints)
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_PEO_ATTAINMENTS: PeoAttainmentDatum[] = [
  {
    peoCode: "PEO1",
    description: "Apply computing knowledge in professional practice",
    attainedPct: 82.4,
    targetAttainmentPct: 70,
  },
  {
    peoCode: "PEO2",
    description: "Pursue lifelong learning and professional growth",
    attainedPct: 78.9,
    targetAttainmentPct: 70,
  },
  {
    peoCode: "PEO3",
    description: "Practice ethical and responsible computing",
    attainedPct: 86.2,
    targetAttainmentPct: 75,
  },
  {
    peoCode: "PEO4",
    description: "Contribute to organizational innovation",
    attainedPct: 74.5,
    targetAttainmentPct: 70,
  },
];

export const MOCK_UPLOAD_STATUSES: UploadStatusDatum[] = [
  { status: "queued", count: 3 },
  { status: "completed", count: 47 },
  { status: "failed", count: 6 },
];

export const MOCK_EXPORT_FORMATS: ExportFormatDatum[] = [
  { format: "pdf", count: 28 },
  { format: "excel", count: 41 },
  { format: "word", count: 9 },
];

export const MOCK_FORM_TYPE_STAGES: FormTypeStageDatum[] = [
  { stage: "PLAN", formTypeCount: 6 },
  { stage: "DO", formTypeCount: 6 },
  { stage: "CHECK", formTypeCount: 7 },
  { stage: "ACT", formTypeCount: 9 },
];

export const MOCK_PLO_TO_PEO_COVERAGE: PloToPeoCoverageDatum[] = [
  { ploCode: "PLO1", peoCode: "PEO1", mapped: true },
  { ploCode: "PLO1", peoCode: "PEO2", mapped: true },
  { ploCode: "PLO2", peoCode: "PEO1", mapped: true },
  { ploCode: "PLO2", peoCode: "PEO4", mapped: true },
  { ploCode: "PLO3", peoCode: "PEO2", mapped: true },
  { ploCode: "PLO3", peoCode: "PEO3", mapped: true },
  { ploCode: "PLO4", peoCode: "PEO1", mapped: true },
  { ploCode: "PLO4", peoCode: "PEO3", mapped: true },
  { ploCode: "PLO4", peoCode: "PEO4", mapped: true },
];

export const MOCK_ASSESSMENT_TYPES: AssessmentTypeDatum[] = [
  { type: "direct", itemCount: 24 },
  { type: "indirect", itemCount: 9 },
];

export const MOCK_STUDENT_YEAR_LEVELS: StudentYearLevelDatum[] = [
  { yearLevel: 1, studentCount: 21 },
  { yearLevel: 2, studentCount: 19 },
  { yearLevel: 3, studentCount: 18 },
  { yearLevel: 4, studentCount: 17 },
];

export const MOCK_USER_ROLES: UserRoleDatum[] = [
  { role: "user", userCount: 12 },
  { role: "faculty", userCount: 48 },
  { role: "program_chair", userCount: 6 },
  { role: "dean", userCount: 4 },
  { role: "aqau", userCount: 3 },
  { role: "vpaa", userCount: 2 },
  { role: "system_admin", userCount: 1 },
];

export const MOCK_CLUSTER_STATUSES: ClusterStatusDatum[] = [
  { status: "open", clusterCount: 5 },
  { status: "compiling", clusterCount: 2 },
  { status: "archived", clusterCount: 8 },
];

export const MOCK_COMPUTATION_RUNS: ComputationRunDatum[] = [
  { term: "2023-2S", runCount: 5, formulaVersion: "70_30_v1" },
  { term: "2024-1S", runCount: 7, formulaVersion: "70_30_v1" },
  { term: "2024-2S", runCount: 9, formulaVersion: "70_30_v1" },
  { term: "2025-1S", runCount: 4, formulaVersion: "70_30_v1" },
];
