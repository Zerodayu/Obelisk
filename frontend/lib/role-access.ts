/**
 * Role-access vocabulary — the frontend's single source of truth for
 * role → feature and role → form visibility. Pure data (**no imports**) so
 * server components, client components, and the backend drift-guard test
 * (`backend/test/unit/role-access-sync.test.ts`) can all import it.
 *
 * The BACKEND is authoritative for enforcement ("client hides/navigates,
 * backend enforces"). This file mirrors:
 * - `backend/lib/role-access.ts` — `FEATURE_ACCESS`
 * - `backend/lib/forms/approval-routes.ts` — `APPROVAL_ROUTES` → `FORM_ACCESS`
 *
 * Change a role's access there first, then here — the sync test fails CI if
 * the two sides ever diverge.
 */

/** Role values. Match `UserRole` exactly (backend enum in `01-enums.prisma`). */
export const USER_ROLES = [
  "user",
  "faculty",
  "program_chair",
  "dean",
  "aqau",
  "vpaa",
  "system_admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/**
 * Feature → effective allow-list. Mirrors `FEATURE_ACCESS` in
 * `backend/lib/role-access.ts`: `system_admin` is included wherever it holds
 * a bypass; `managePlos` has none (dean-only by institutional rule).
 */
export const FEATURE_ACCESS = {
  /** Class-record capture: upload, roster edit/re-import, history, job status. */
  captureClassRecords: ["faculty", "program_chair", "system_admin"],
  /** Archive an approved submission (the Archive action). */
  archive: ["vpaa", "system_admin"],
  /** Open the graduation-cluster archive browse screens (read-only). */
  viewArchives: ["vpaa", "system_admin"],
  /** Sit on the approval inbox / decide an approval step. */
  approveForms: ["program_chair", "dean", "aqau", "vpaa", "system_admin"],
  /** Create/edit/delete PLO entities (`/plo-management`) — dean only. */
  managePlos: ["dean"],
  /** List/approve/deny role requests. */
  manageRoleRequests: ["system_admin"],
  /** Confirm a graduation cluster for compile. */
  confirmClusterCompile: ["aqau", "system_admin"],
} as const satisfies Record<string, readonly UserRole[]>;

export type FeatureKey = keyof typeof FEATURE_ACCESS;

// --- Role groups (frontend-only convenience sets) ----------------------------

/** Every role value. */
export const ALL_ROLES: readonly UserRole[] = USER_ROLES;
/** Accept-list for anything any logged-in role may open. */
export const ANY_AUTHENTICATED_ROLES: readonly UserRole[] = USER_ROLES;
export const ADMIN_ROLES: readonly UserRole[] = [
  "system_admin",
  "vpaa",
  "aqau",
];
export const QA_ROLES: readonly UserRole[] = ["aqau", "vpaa", "system_admin"];
export const ACADEMIC_ROLES: readonly UserRole[] = [
  "faculty",
  "program_chair",
  "dean",
];

// Feature allow-lists (derived from FEATURE_ACCESS — single definition) ---

/** Class-record capture (upload/roster/history): same as `captureClassRecords`. */
export const CLASS_RECORD_ROLES: readonly UserRole[] =
  FEATURE_ACCESS.captureClassRecords;
/** Archive an approved submission **and** open `/archives`. */
export const ARCHIVE_ROLES: readonly UserRole[] = FEATURE_ACCESS.archive;
/**
 * May sit on an approval step (`ApproverRole`) or open `/approvals` — the
 * canonical chain plus the `system_admin` override. Broader than
 * `ARCHIVE_ROLES`: approvers review a submission long before it is archived.
 */
export const APPROVER_ROLES: readonly UserRole[] = FEATURE_ACCESS.approveForms;
/** PLO entity mutations (`/plo-management`) — dean only. */
export const PLO_MANAGEMENT_ROLES: readonly UserRole[] =
  FEATURE_ACCESS.managePlos;

export interface FormAccessRoute {
  /** Roles allowed to prepare/submit this form. */
  preparers: readonly UserRole[];
  /** Ordered approval chain (ascending canonical order, may skip roles). */
  chain: readonly UserRole[];
}

/**
 * Per-form access, keyed by stable `FormType.code` — mirror of
 * `APPROVAL_ROUTES` in `backend/lib/forms/approval-routes.ts` (28 codes).
 * Who may **open** a form screen = `formRoles(code)` below (preparers ∪
 * chain ∪ system_admin).
 */
export const FORM_ACCESS: Record<string, FormAccessRoute> = {
  // --- PLAN-phase setup ---
  curriculum_map: {
    preparers: ["program_chair", "faculty"],
    chain: ["aqau"],
  },
  portfolio_roadmap: {
    preparers: ["program_chair", "faculty"],
    chain: ["dean", "aqau"],
  },
  assessment_calendar: {
    preparers: ["program_chair"],
    chain: ["dean", "aqau"],
  },
  target_setting_matrix: {
    preparers: ["program_chair", "dean"],
    chain: ["aqau"],
  },
  stakeholder_consultation: {
    preparers: ["program_chair", "faculty", "dean"],
    chain: ["program_chair"],
  },
  assessment_budget: {
    preparers: ["dean"],
    chain: ["vpaa"],
  },

  // --- DO / data capture ---
  clo_raw_data: {
    preparers: ["faculty", "program_chair"],
    chain: ["program_chair"],
  },
  mid_cycle_attainment: {
    preparers: ["faculty"],
    chain: ["program_chair"],
  },
  resource_monitoring: {
    preparers: ["dean", "program_chair"],
    chain: ["vpaa"],
  },
  peer_observation: {
    preparers: ["program_chair", "faculty"],
    chain: ["program_chair"],
  },
  exhibition_feedback: {
    preparers: ["program_chair", "faculty"],
    chain: ["program_chair"],
  },
  clo_perception_survey: {
    preparers: ["program_chair", "faculty"],
    chain: ["program_chair"],
  },

  // --- CHECK / roll-up chain ---
  course_assessment_report: {
    preparers: ["faculty"],
    chain: ["program_chair", "dean", "aqau"],
  },
  clo_attainment_summary: {
    preparers: ["faculty"],
    chain: ["program_chair"],
  },
  plo_attainment_summary: {
    preparers: ["program_chair"],
    chain: ["dean", "aqau"],
  },
  cohort_tracking: {
    preparers: ["program_chair"],
    chain: ["aqau"],
  },
  student_exit_survey: {
    preparers: ["program_chair", "faculty"],
    chain: ["program_chair"],
  },
  portfolio_assessment_record: {
    preparers: ["faculty", "program_chair"],
    chain: ["aqau"],
  },
  capstone_panel_evaluation: {
    preparers: ["faculty", "program_chair"],
    chain: ["program_chair", "aqau"],
  },
  alumni_tracer: {
    preparers: ["program_chair", "faculty"],
    chain: ["program_chair", "dean"],
  },
  employer_satisfaction_survey: {
    preparers: ["program_chair", "faculty"],
    chain: ["program_chair", "dean"],
  },

  // --- ACT / CQI loop ---
  plo_gap_analysis: {
    preparers: ["program_chair"],
    chain: ["dean"],
  },
  cqi_action_plan: {
    preparers: ["program_chair"],
    chain: ["dean", "aqau"],
  },
  annual_program_report: {
    preparers: ["program_chair"],
    chain: ["dean", "vpaa"],
  },
  closing_the_loop: {
    preparers: ["program_chair"],
    chain: ["aqau"],
  },
  systemic_gap_report: {
    preparers: ["dean"],
    chain: ["vpaa"],
  },
  capa_plan: {
    preparers: ["dean", "vpaa"],
    chain: ["aqau"],
  },
  institutional_review: {
    preparers: ["aqau", "vpaa"],
    chain: ["vpaa"],
  },
};

/** Is `role` allowed on `feature`? */
export function canAccess(
  role: UserRole | undefined,
  feature: FeatureKey,
): boolean {
  if (!role) return false;
  return (FEATURE_ACCESS[feature] as readonly string[]).includes(role);
}

/** The allow-list for a feature (for `requireRole` / nav `roles`). */
export function featureRoles(feature: FeatureKey): readonly UserRole[] {
  return FEATURE_ACCESS[feature];
}

/**
 * Who may open the screen for a stable form code: preparers ∪ approval
 * chain ∪ `system_admin` (the backend's workflow override).
 *
 * Unknown/no-code screens return every role — matching the backend's
 * `DEFAULT_APPROVAL_ROUTE` fallback philosophy (nothing to prepare yet).
 */
export function formRoles(code: string): readonly UserRole[] {
  const route = FORM_ACCESS[code];
  if (!route) return USER_ROLES;
  const roles = new Set<UserRole>(route.preparers);
  for (const role of route.chain) roles.add(role);
  roles.add("system_admin");
  return [...roles];
}
