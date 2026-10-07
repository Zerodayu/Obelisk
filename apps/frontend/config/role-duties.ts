/**
 * Per-role duty registry — the ordered "what this role actually does" steps,
 * written from the institutional role definitions (see
 * `system-docs/FORMS_WORKFLOW_AND_VPAA_LIFECYCLE.md` §5).
 *
 * Two consumers read this one source of truth:
 * - `config/navigation.ts` → `sidebarNavFor(role)` renders these as the
 *   sidebar's responsibility sections (the form catalog follows underneath,
 *   minus anything already surfaced as a step).
 * - `components/dashboard/role-checklist.tsx` → the dashboard's "What you
 *   need to do" card, which resolves each step's done/in-progress state from
 *   `lib/duty-status.ts`.
 *
 * Manual `F##` numbers are deliberately absent from the copy (they are
 * provisional — see `apps/frontend/AGENTS.md`); steps are referenced by their
 * stable `FormType.code`, which is also what drives status resolution.
 *
 * Pure config module: icons are referenced as components, not JSX. Visibility
 * is *not* decided here — `config/navigation.ts` resolves it (`prepare` →
 * `preparerRoles(code)`, `approve`/`link` → the step's `roles`).
 */

import {
  ArchiveIcon,
  BarChart3Icon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  FileChartColumnIcon,
  FileTextIcon,
  ListChecksIcon,
  type LucideIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TargetIcon,
  UploadIcon,
} from "lucide-react";

import {
  ARCHIVE_ROLES,
  FEATURE_ACCESS,
  PLO_MANAGEMENT_ROLES,
  type UserRole,
} from "@/lib/role-access";

/**
 * How a step's status is computed on the dashboard.
 * - `prepare` — "did I create/submit this form?" → `GET /forms?scope=mine`
 *   rows matching `code`.
 * - `approve` — "is anything waiting on me?" → `GET /forms?scope=pending`
 *   rows, narrowed to `codes` (absent = every pending row for the role).
 * - `link` — a destination step with no computed state (PLO management,
 *   archives, the AI drawer): it renders as "Open", never "Done".
 */
export type DutyStatus =
  | { kind: "prepare"; code: string }
  | { kind: "approve"; codes?: string[] }
  | { kind: "link" };

export interface DutyStep {
  /** Stable id for React keys and tests. */
  id: string;
  /** Action phrasing shown in the sidebar and the dashboard row. */
  title: string;
  /** One-line "why/what for" — dashboard row subtitle. */
  detail: string;
  /** Destination screen (form screen, inbox, or workspace page). */
  url: string;
  icon: LucideIcon;
  status: DutyStatus;
  /**
   * Nav visibility for non-`prepare` steps (`approve` → `APPROVER_ROLES`,
   * `link` → an explicit feature list). `prepare` steps derive theirs from
   * `preparerRoles(code)` instead, so this is ignored for them.
   */
  roles?: readonly UserRole[];
}

export interface DutySection {
  /** Sidebar group label / dashboard sub-heading. */
  label: string;
  steps: DutyStep[];
}

/**
 * Role → its ordered duty sections. Roles absent here (`system_admin`,
 * `user`) keep the plain preparer catalog in the sidebar and get no
 * dashboard checklist.
 */
export const ROLE_DUTIES: Partial<Record<UserRole, DutySection[]>> = {
  faculty: [
    {
      label: "Class Records",
      steps: [
        {
          id: "faculty-upload",
          title: "Upload class records",
          detail:
            "AUN-OBE Excel class records feed CLO raw data and the at-risk watchlist.",
          url: "/forms/clo-raw-data",
          icon: UploadIcon,
          status: { kind: "prepare", code: "clo_raw_data" },
        },
      ],
    },
    {
      label: "Indirect Survey",
      steps: [
        {
          id: "faculty-perception",
          title: "Enter indirect survey scores",
          detail:
            "CLO Achievement Perception Survey — the indirect half of the 70/30 composite.",
          url: "/forms/check/clo-perception-survey",
          icon: ClipboardListIcon,
          status: { kind: "prepare", code: "clo_perception_survey" },
        },
      ],
    },
    {
      label: "Course Report",
      steps: [
        {
          id: "faculty-car",
          title: "Generate the Course Assessment Report",
          detail:
            "Course means, cohort CLO attainments, at-risk watchlist, and CQI proposals.",
          url: "/forms/course-assessment-report",
          icon: FileChartColumnIcon,
          status: { kind: "prepare", code: "course_assessment_report" },
        },
      ],
    },
    {
      label: "Remediation",
      steps: [
        {
          id: "faculty-action-taken",
          title: "File Action-Taken records",
          detail:
            "Document the intervention for every student below the 70% floor.",
          url: "/forms/cqi/action-taken",
          icon: ClipboardCheckIcon,
          status: { kind: "prepare", code: "action_taken" },
        },
      ],
    },
  ],

  program_chair: [
    {
      label: "Faculty Review",
      steps: [
        {
          id: "chair-approvals",
          title: "Approve faculty submissions",
          detail:
            "Class records, CARs, and remediation records reach you first.",
          url: "/approvals",
          icon: ClipboardCheckIcon,
          status: { kind: "approve" },
        },
      ],
    },
    {
      label: "Program Rollup",
      steps: [
        {
          id: "chair-plo-summary",
          title: "Generate the PLO Attainment Summary",
          detail: "Formula 7A rollup of mapped CLO attainments per PLO.",
          url: "/forms/attainment/plo-attainment-summary",
          icon: BarChart3Icon,
          status: { kind: "prepare", code: "plo_attainment_summary" },
        },
        {
          id: "chair-cohort-tracking",
          title: "Track cohorts longitudinally",
          detail: "Four-year CLO/PLO matrix with automated trend indicators.",
          url: "/forms/attainment/cohort-tracking",
          icon: TargetIcon,
          status: { kind: "prepare", code: "cohort_tracking" },
        },
      ],
    },
    {
      label: "CQI",
      steps: [
        {
          id: "chair-gap-analysis",
          title: "Run the PLO Gap Analysis",
          detail:
            "Any PLO below 70% gets one of the six accredited root causes.",
          url: "/forms/cqi/plo-gap-analysis",
          icon: TargetIcon,
          status: { kind: "prepare", code: "plo_gap_analysis" },
        },
        {
          id: "chair-cqi-plan",
          title: "Open the CQI Action Plan",
          detail: "Binding action items with owners, KPIs, and deadlines.",
          url: "/forms/cqi/cqi-action-plan",
          icon: ListChecksIcon,
          status: { kind: "prepare", code: "cqi_action_plan" },
        },
      ],
    },
    {
      label: "Annual Report",
      steps: [
        {
          id: "chair-apar",
          title: "Draft the Annual Program Report",
          detail: "11-KPI rollup — gated on an approved Cohort Tracking Sheet.",
          url: "/forms/cqi/annual-program-report",
          icon: FileTextIcon,
          status: { kind: "prepare", code: "annual_program_report" },
        },
      ],
    },
  ],

  dean: [
    {
      label: "Endorsements",
      steps: [
        {
          id: "dean-approvals",
          title: "Endorse PLO summaries, CQI plans & APAR",
          detail: "Your sign-off before anything leaves the college.",
          url: "/approvals",
          icon: ClipboardCheckIcon,
          status: {
            kind: "approve",
            codes: [
              "plo_attainment_summary",
              "cqi_action_plan",
              "annual_program_report",
              "closing_the_loop",
            ],
          },
        },
      ],
    },
    {
      label: "PLO Stewardship",
      steps: [
        {
          id: "dean-plo-management",
          title: "Manage program PLOs",
          detail:
            "Sole custody of PLO creation, editing, and retirement — targets hold the ≥70% floor.",
          url: "/plo-management",
          icon: ListChecksIcon,
          status: { kind: "link" },
          roles: PLO_MANAGEMENT_ROLES,
        },
      ],
    },
    {
      label: "Planning",
      steps: [
        {
          id: "dean-targets",
          title: "Set cohort performance targets",
          detail:
            "Target-Setting Matrix — the ≥70% floor is enforced server-side.",
          url: "/forms/plan/target-setting-matrix",
          icon: TargetIcon,
          status: { kind: "prepare", code: "target_setting_matrix" },
        },
        {
          id: "dean-budget",
          title: "Submit the assessment budget",
          detail: "12 fixed PDCA line items, authorized by the VPAA.",
          url: "/forms/plan/assessment-budget",
          icon: FileTextIcon,
          status: { kind: "prepare", code: "assessment_budget" },
        },
      ],
    },
  ],

  aqau: [
    {
      label: "Loop Validation",
      steps: [
        {
          id: "aqau-loop",
          title: "Validate Closing-the-Loop & CAPA",
          detail:
            "The five mandatory loop-closure conditions are hard-computed — you verify them.",
          url: "/approvals",
          icon: RefreshCwIcon,
          status: {
            kind: "approve",
            codes: ["closing_the_loop", "capa_plan"],
          },
        },
      ],
    },
    {
      label: "Compliance Audit",
      steps: [
        {
          id: "aqau-audit",
          title: "Review everything awaiting QA",
          detail:
            "Accreditation readiness for PACUCOA / CHED before data reaches the VPAA.",
          url: "/approvals",
          icon: ShieldCheckIcon,
          status: { kind: "approve" },
        },
      ],
    },
    {
      label: "Graduation Clusters",
      steps: [
        {
          id: "aqau-cluster",
          title: "Confirm cluster compilation",
          detail: "Releases a graduation cluster for compile.",
          url: "/archives",
          icon: ArchiveIcon,
          status: { kind: "link" },
          roles: FEATURE_ACCESS.confirmClusterCompile,
        },
      ],
    },
  ],

  vpaa: [
    {
      label: "Final Approval",
      steps: [
        {
          id: "vpaa-approvals",
          title: "Give final review on all submissions",
          detail: "Every approval chain ends at the VPAA.",
          url: "/approvals",
          icon: ClipboardCheckIcon,
          status: { kind: "approve" },
        },
      ],
    },
    {
      label: "Archival",
      steps: [
        {
          id: "vpaa-archive",
          title: "Archive approved graduation clusters",
          detail: "The permanent, immutable record for accreditation audits.",
          url: "/archives",
          icon: ArchiveIcon,
          status: { kind: "link" },
          roles: ARCHIVE_ROLES,
        },
      ],
    },
    {
      label: "Strategic AI",
      steps: [
        {
          id: "vpaa-ai",
          title: "Generate AI strategic insights",
          detail:
            "Gemini runs on PII-scrubbed, consolidated data across every college.",
          url: "/dashboard",
          icon: SparklesIcon,
          status: { kind: "link" },
          roles: FEATURE_ACCESS.generateAiInsights,
        },
      ],
    },
  ],
};

/** Duty sections for a role (empty when the role has no duty list). */
export function dutiesFor(role: UserRole): DutySection[] {
  return ROLE_DUTIES[role] ?? [];
}

/** Flat, ordered list of every step for a role. */
export function dutyStepsFor(role: UserRole): DutyStep[] {
  return dutiesFor(role).flatMap((section) => section.steps);
}
