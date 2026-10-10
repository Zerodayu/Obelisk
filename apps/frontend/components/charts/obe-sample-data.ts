/**
 * Chart datum types + dev-mode inbox sample rows.
 *
 * Every interface below mirrors a backend payload (field names and units follow
 * the server contract) so a chart component renders exactly what the API
 * returns. These are TYPES only — no chart is seeded with fabricated numbers
 * any more: datasets are fetched in `lib/store/atoms/*`, and a dataset whose
 * route does not exist yet is seeded with `[]` so its chart shows an empty
 * state.
 *
 * ── Backend sources (authoritative; payload subsets live next to the atoms) ──
 *   CloAttainmentDatum        GET /rollup/clo-attainment-summary/:id → rows
 *   PloAttainmentDatum        GET /rollup/plo-attainment-summary/:id → plos
 *   CohortTrendDatum          GET /rollup/cohort-tracking/:id        → lines
 *   PloGapDatum               GET /cqi/plo-gap-analysis/:id + GET /plan/plos
 *   RootCauseDatum            GET /cqi/plo-gap-analysis/:id          → gapRows
 *   CqiActionDatum            GET /cqi/cqi-action-plan/:id           → entries
 *   LoopStatusDatum           GET /cqi/closing-the-loop/:id          → rows
 *   BudgetLineDatum           GET /plan/assessment-budget/:id        → lineItems
 *   CurriculumCoverageDatum   GET /plan/clo-plo-map
 *   TargetSettingDatum        GET /plan/target-setting-matrix/:id    → programPloAvg
 *   ApprovalFlowDatum         GET /forms                             → approvalSteps
 *   FormStatusDatum           GET /forms                             → status
 *   UploadStatusDatum         GET /ingest/history                    → status
 *   … every other dataset has no route yet — see the TODO note on its atom.
 *
 * ── Rules the backend enforces (display-only here, never re-derived) ────────
 *   - Composite attainment = Direct × 70% + Indirect × 30%.
 *   - The ≥70% hard floor decides MET / NOT MET — the server flags it.
 *   - Loop status is computed server-side from the five CTL conditions.
 *
 * ── Inbox sample rows ──────────────────────────────────────────────────────
 *   `SAMPLE_MY_SUBMISSIONS` / `SAMPLE_PENDING_APPROVALS` are rendered only by
 *   `components/inbox/submission-inbox.tsx` when `DEVELOPMENT=true`, so
 *   `/submissions` and `/approvals` preview without a backend session.
 */

import type {
  ApprovalStepRecord,
  FormSubmissionRecord,
  FormTypeRef,
  SubmissionUserRef,
} from "@/lib/store/atoms/forms";

/** Mirrors `CloAttainment` — one row per CLO for the active computation run. */
export interface CloAttainmentDatum {
  cloCode: string; // Clo.code
  cloDescription: string; // Clo.description
  /** TODO(direct-indirect): absent from the CLO summary payload — series omitted. */
  directScorePct?: number; // CloAttainment.directScorePct (class average)
  indirectScorePct?: number; // CloAttainment.indirectScorePct (class average)
  compositeScorePct: number; // CloSummaryRow.weightedAvgPct = direct×0.70 + indirect×0.30
  isBelowThreshold: boolean; // server flag — CloSummaryRow.status === "NOT MET"
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
  approverRole: string; // ApprovalStep.approverRole (registry-derived chain)
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
  planned: number; // approved budget (PHP), or estimated when not yet approved
  /** TODO(spent): no actual-spend field exists on the backend yet. */
  spent?: number; // actual spend
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
  targetAttainmentPct: number; // ≥70% hard floor (program mean target)
  /** TODO(current): current attainment is reported by the rollup chain, not joined here. */
  currentAttainmentPct?: number;
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
  status: "queued" | "completed" | "failed" | "discarded"; // UploadStatus
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

// ── Inbox sample rows (dev-mode `scope=mine` / `scope=pending` previews) ─────
// Rendered by `components/inbox/submission-inbox.tsx` when `DEVELOPMENT=true`
// so `/submissions` and `/approvals` populate without a backend session.
// Approval chains + form names mirror `backend/lib/forms/approval-routes.ts`.

/** One `ApprovalStep` decision before it is expanded into a full record. */
interface SampleStepSeed {
  approverRole: ApprovalStepRecord["approverRole"];
  decision: ApprovalStepRecord["decision"];
  comment?: string;
  decidedAt?: string;
}

const SAMPLE_SUBMITTERS = {
  chair: {
    id: "sample-user-chair",
    name: "Prof. Maria Lourdes Santos",
    role: "program_chair",
  },
  faculty: {
    id: "sample-user-faculty",
    name: "Dr. Juan Dela Cruz",
    role: "faculty",
  },
} satisfies Record<string, SubmissionUserRef>;

const SAMPLE_FORM_TYPES = {
  targetSettingMatrix: {
    code: "target_setting_matrix",
    name: "Target-Setting Matrix",
    pdcaStage: "PLAN",
  },
  assessmentCalendar: {
    code: "assessment_calendar",
    name: "Assessment Calendar with Cohort Tracking Milestones",
    pdcaStage: "PLAN",
  },
  curriculumMap: {
    code: "curriculum_map",
    name: "CLO-PLO Curriculum Map",
    pdcaStage: "PLAN",
  },
  courseAssessmentReport: {
    code: "course_assessment_report",
    name: "Course Assessment Report (CAR)",
    pdcaStage: "CHECK",
  },
  annualProgramReport: {
    code: "annual_program_report",
    name: "Annual Program Assessment Report (APAR)",
    pdcaStage: "ACT",
  },
  cqiActionPlan: {
    code: "cqi_action_plan",
    name: "CQI Action Plan",
    pdcaStage: "ACT",
  },
  ploAttainmentSummary: {
    code: "plo_attainment_summary",
    name: "PLO Attainment Summary",
    pdcaStage: "CHECK",
  },
} satisfies Record<string, FormTypeRef>;

/** Assemble one inbox-shaped `FormSubmissionRecord` with its approval chain. */
function sampleSubmission(opts: {
  id: string;
  formType: FormTypeRef;
  status: FormSubmissionRecord["status"];
  currentApproverRole: string | null;
  submittedBy: SubmissionUserRef;
  createdAt: string;
  updatedAt: string;
  steps: SampleStepSeed[];
}): FormSubmissionRecord {
  return {
    id: opts.id,
    formTypeId: `sample-formtype-${opts.formType.code}`,
    classSectionId: null,
    programId: "sample-program-bsit",
    termId: "sample-term-2026-1",
    submittedByUserId: opts.submittedBy.id,
    status: opts.status,
    currentApproverRole: opts.currentApproverRole,
    formData: {},
    createdAt: opts.createdAt,
    updatedAt: opts.updatedAt,
    formType: opts.formType,
    submittedBy: opts.submittedBy,
    approvalSteps: opts.steps.map((step, index) => ({
      id: `${opts.id}-step-${index + 1}`,
      formSubmissionId: opts.id,
      approverRole: step.approverRole,
      sequenceNo: index + 1,
      decision: step.decision,
      approverUserId:
        step.decision === "pending" ? null : `sample-user-${step.approverRole}`,
      comment: step.comment ?? null,
      decidedAt: step.decidedAt ?? null,
    })),
  };
}

/** `scope=mine` — one submission per status, for `/submissions`. */
export const SAMPLE_MY_SUBMISSIONS: FormSubmissionRecord[] = [
  sampleSubmission({
    id: "sample-submission-1",
    formType: SAMPLE_FORM_TYPES.targetSettingMatrix,
    status: "draft",
    currentApproverRole: null,
    submittedBy: SAMPLE_SUBMITTERS.chair,
    createdAt: "2026-09-22T08:15:00.000Z",
    updatedAt: "2026-09-23T07:02:00.000Z",
    steps: [],
  }),
  sampleSubmission({
    id: "sample-submission-2",
    formType: SAMPLE_FORM_TYPES.assessmentCalendar,
    status: "submitted",
    currentApproverRole: "dean",
    submittedBy: SAMPLE_SUBMITTERS.chair,
    createdAt: "2026-09-16T06:30:00.000Z",
    updatedAt: "2026-09-21T02:45:00.000Z",
    steps: [
      { approverRole: "dean", decision: "pending" },
      { approverRole: "aqau", decision: "pending" },
    ],
  }),
  sampleSubmission({
    id: "sample-submission-3",
    formType: SAMPLE_FORM_TYPES.curriculumMap,
    status: "returned",
    currentApproverRole: null,
    submittedBy: SAMPLE_SUBMITTERS.chair,
    createdAt: "2026-09-08T09:10:00.000Z",
    updatedAt: "2026-09-18T01:42:00.000Z",
    steps: [
      {
        approverRole: "aqau",
        decision: "returned",
        comment:
          "Please add the CLO-PLO validation evidence for the newly mapped courses before resubmitting.",
        decidedAt: "2026-09-18T01:42:00.000Z",
      },
    ],
  }),
  sampleSubmission({
    id: "sample-submission-4",
    formType: SAMPLE_FORM_TYPES.courseAssessmentReport,
    status: "approved",
    currentApproverRole: null,
    submittedBy: SAMPLE_SUBMITTERS.faculty,
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-09-01T03:20:00.000Z",
    steps: [
      {
        approverRole: "program_chair",
        decision: "approved",
        decidedAt: "2026-08-20T05:12:00.000Z",
      },
      {
        approverRole: "dean",
        decision: "approved",
        decidedAt: "2026-08-25T07:34:00.000Z",
      },
      {
        approverRole: "aqau",
        decision: "approved",
        decidedAt: "2026-09-01T03:20:00.000Z",
      },
    ],
  }),
  sampleSubmission({
    id: "sample-submission-5",
    formType: SAMPLE_FORM_TYPES.annualProgramReport,
    status: "archived",
    currentApproverRole: null,
    submittedBy: SAMPLE_SUBMITTERS.chair,
    createdAt: "2026-06-10T08:45:00.000Z",
    updatedAt: "2026-07-02T06:05:00.000Z",
    steps: [
      {
        approverRole: "dean",
        decision: "approved",
        decidedAt: "2026-06-20T04:30:00.000Z",
      },
      {
        approverRole: "vpaa",
        decision: "approved",
        decidedAt: "2026-07-02T06:05:00.000Z",
      },
    ],
  }),
];

/** `scope=pending` — submitted rows waiting on chair/dean/AQAU, for `/approvals`. */
export const SAMPLE_PENDING_APPROVALS: FormSubmissionRecord[] = [
  sampleSubmission({
    id: "sample-submission-6",
    formType: SAMPLE_FORM_TYPES.courseAssessmentReport,
    status: "submitted",
    currentApproverRole: "program_chair",
    submittedBy: SAMPLE_SUBMITTERS.faculty,
    createdAt: "2026-09-19T07:25:00.000Z",
    updatedAt: "2026-09-22T08:40:00.000Z",
    steps: [
      { approverRole: "program_chair", decision: "pending" },
      { approverRole: "dean", decision: "pending" },
      { approverRole: "aqau", decision: "pending" },
    ],
  }),
  sampleSubmission({
    id: "sample-submission-7",
    formType: SAMPLE_FORM_TYPES.cqiActionPlan,
    status: "submitted",
    currentApproverRole: "dean",
    submittedBy: SAMPLE_SUBMITTERS.chair,
    createdAt: "2026-09-17T05:50:00.000Z",
    updatedAt: "2026-09-21T09:15:00.000Z",
    steps: [
      { approverRole: "dean", decision: "pending" },
      { approverRole: "aqau", decision: "pending" },
    ],
  }),
  sampleSubmission({
    id: "sample-submission-8",
    formType: SAMPLE_FORM_TYPES.ploAttainmentSummary,
    status: "submitted",
    currentApproverRole: "aqau",
    submittedBy: SAMPLE_SUBMITTERS.chair,
    createdAt: "2026-09-15T06:05:00.000Z",
    updatedAt: "2026-09-20T02:30:00.000Z",
    steps: [
      {
        approverRole: "dean",
        decision: "approved",
        decidedAt: "2026-09-19T04:48:00.000Z",
      },
      { approverRole: "aqau", decision: "pending" },
    ],
  }),
];
