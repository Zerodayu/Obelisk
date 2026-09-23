/**
 * Obelisk navigation & route registry — the single source of truth for what
 * appears in the sidebar and which routes each role may reach.
 *
 * Adding a role or a route = add/edit one entry here (plus the corresponding
 * page under `app/`). The sidebar, archive/form gates, and any future
 * breadcrumbs all derive from this. Backend still enforces authority; this
 * drives navigation and rendering only.
 *
 * Pure config module (`.ts`): icons are referenced as components, not JSX, so
 * consumers render `<item.icon />` themselves.
 */

import {
  ArchiveIcon,
  BarChart3Icon,
  BookOpenIcon,
  CalendarDaysIcon,
  CalendarRangeIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  FileChartColumnIcon,
  FileTextIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  type LucideIcon,
  RefreshCwIcon,
  StarIcon,
  TargetIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";

import {
  ACADEMIC_ROLES,
  APPROVER_ROLES,
  hasAccess,
  PLO_MANAGEMENT_ROLES,
  type UserRole,
} from "@/lib/roles";
import { app } from "@/utils/app-info";

export interface NavChild {
  title: string;
  url: string;
  /** allow-list roles; empty = any authenticated role. */
  roles?: readonly UserRole[];
  /**
   * Stable snake_case `FormType.code` for form screens — used by the
   * submission inboxes to link a record back to its screen.
   */
  code?: string;
}

export interface NavItem extends NavChild {
  icon?: LucideIcon;
  collapse?: boolean;
  children?: NavChild[];
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

/** Forms catalog grouped by PDCA phase (mirrors backend `FormType.pdcaStage`). */
const FORM_SECTIONS: NavSection[] = [
  {
    label: "Data Capture",
    items: [
      {
        title: "CLO Raw Data",
        url: "/forms/clo-raw-data",
        icon: ClipboardListIcon,
        roles: ACADEMIC_ROLES,
        code: "clo_raw_data",
      },
      {
        title: "Course Assessment Report",
        url: "/forms/course-assessment-report",
        icon: FileChartColumnIcon,
        roles: ACADEMIC_ROLES,
        code: "course_assessment_report",
      },
    ],
  },
  {
    label: "Attainment",
    items: [
      {
        title: "CLO Attainment Summary",
        url: "/forms/attainment/clo-attainment-summary",
        icon: BarChart3Icon,
        code: "clo_attainment_summary",
      },
      {
        title: "PLO Attainment Summary",
        url: "/forms/attainment/plo-attainment-summary",
        icon: BarChart3Icon,
        code: "plo_attainment_summary",
      },
      {
        title: "Cohort Tracking",
        url: "/forms/attainment/cohort-tracking",
        icon: LandmarkIcon,
        code: "cohort_tracking",
      },
    ],
  },
  {
    label: "CQI & Loop",
    items: [
      {
        title: "PLO Gap Analysis",
        url: "/forms/cqi/plo-gap-analysis",
        icon: TargetIcon,
        code: "plo_gap_analysis",
      },
      {
        title: "CQI Action Plan",
        url: "/forms/cqi/cqi-action-plan",
        icon: ListChecksIcon,
        code: "cqi_action_plan",
      },
      {
        title: "Closing the Loop",
        url: "/forms/cqi/closing-the-loop",
        icon: RefreshCwIcon,
        code: "closing_the_loop",
      },
      {
        title: "Annual Program Report",
        url: "/forms/cqi/annual-program-report",
        icon: FileTextIcon,
        code: "annual_program_report",
      },
    ],
  },
  {
    label: "Plan Setup",
    items: [
      {
        title: "Curriculum Map",
        url: "/forms/plan/curriculum-map",
        icon: BookOpenIcon,
        code: "curriculum_map",
      },
      {
        title: "Assessment Calendar",
        url: "/forms/plan/assessment-calendar",
        icon: CalendarRangeIcon,
        code: "assessment_calendar",
      },
      {
        title: "Target Setting Matrix",
        url: "/forms/plan/target-setting-matrix",
        icon: TargetIcon,
        code: "target_setting_matrix",
      },
      {
        title: "Assessment Budget",
        url: "/forms/plan/assessment-budget",
        icon: CalendarDaysIcon,
        code: "assessment_budget",
      },
    ],
  },
  {
    label: "Supporting (CHECK)",
    items: [
      {
        title: "Peer Observation",
        url: "/forms/check/peer-observation",
        icon: ClipboardCheckIcon,
        code: "peer_observation",
      },
      {
        title: "CLO Perception Survey",
        url: "/forms/check/clo-perception-survey",
        icon: ClipboardListIcon,
        code: "clo_perception_survey",
      },
      {
        title: "Student Exit Survey",
        url: "/forms/check/student-exit-survey",
        icon: ClipboardListIcon,
        code: "student_exit_survey",
      },
      {
        title: "Exhibition Feedback",
        url: "/forms/check/exhibition-feedback",
        icon: StarIcon,
        code: "exhibition_feedback",
      },
      {
        title: "Portfolio Assessment",
        url: "/forms/check/portfolio-assessment",
        icon: FileChartColumnIcon,
        code: "portfolio_assessment_record",
      },
      {
        title: "Capstone Panel Evaluation",
        url: "/forms/check/capstone-panel",
        icon: ListChecksIcon,
        code: "capstone_panel_evaluation",
      },
      {
        title: "Mid-Cycle Attainment",
        url: "/forms/check/mid-cycle-attainment",
        icon: WalletIcon,
        code: "mid_cycle_attainment",
      },
    ],
  },
];

/**
 * Stable form code → screen path, for linking inbox rows back to their form
 * screen. Codes without a built screen (periodic forms, `stakeholder_
 * consultation`) are absent — render those rows unlinked.
 */
export const formPathByCode: Record<string, string> = Object.fromEntries(
  FORM_SECTIONS.flatMap((section) =>
    section.items
      .filter((item) => item.code)
      .map((item) => [item.code as string, item.url]),
  ),
);

function allowRoles(item: NavChild, role: UserRole): boolean {
  return hasAccess(role, item.roles);
}

/** Does the item (or any child) remain visible for the given role? */
export function itemVisible(item: NavItem, role: UserRole): boolean {
  if (allowRoles(item, role)) return true;
  return (item.children ?? []).some((child) => allowRoles(child, role));
}

/**
 * Filter the registry down to the routes/nav a role may see, preserving the
 * grouping structure. Any item the role cannot access — and has no accessible
 * children — is dropped.
 */
export function navSectionsFor(role: UserRole): NavSection[] {
  const result: NavSection[] = [];
  for (const group of FORM_SECTIONS) {
    const items = group.items.filter((item) => itemVisible(item, role));
    if (items.length === 0) continue;
    result.push({ label: group.label, items });
  }
  return result;
}

/** Top-level destinations for the Workspace group of the sidebar. */
export function workspaceNav(role: UserRole): NavItem[] {
  const items: NavItem[] = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboardIcon },
  ];
  if (hasAccess(role, PLO_MANAGEMENT_ROLES))
    items.push({
      title: "PLO Management",
      url: "/plo-management",
      icon: ListChecksIcon,
    });
  items.push({
    title: "My Submissions",
    url: "/submissions",
    icon: FileTextIcon,
  });
  if (hasAccess(role, APPROVER_ROLES))
    items.push({
      title: "Pending Approvals",
      url: "/approvals",
      icon: ClipboardCheckIcon,
    });
  const archives = hasAccess(role, ["aqau", "vpaa", "dean", "system_admin"]);
  if (archives)
    items.push({ title: "Archives", url: "/archives", icon: ArchiveIcon });
  return items;
}

/** Institution-facing links (secondary group). */
export const INSTITUTION_NAV: NavItem[] = [
  { title: "Faculty Directory", url: "/people", icon: UsersIcon },
];

/** Flatten every link (workspace + catalog children) for title lookup. */
const ALL_LINKS: { title: string; url: string }[] = [
  ...workspaceRootLinks(),
  ...FORM_SECTIONS.flatMap((section) =>
    section.items.flatMap((item: NavItem) => [
      { title: item.title, url: item.url },
      ...(item.children ?? []).map((child) => ({
        title: child.title,
        url: child.url,
      })),
    ]),
  ),
];

function workspaceRootLinks() {
  return [
    { title: "Dashboard", url: "/dashboard" },
    { title: "PLO Management", url: "/plo-management" },
    { title: "My Submissions", url: "/submissions" },
    { title: "Pending Approvals", url: "/approvals" },
    { title: "Archives", url: "/archives" },
  ];
}

/** Best-match page title for a given pathname, for headers/breadcrumbs. */
export function titleForPathname(pathname: string): string {
  let best: { title: string; url: string } | undefined;
  for (const link of ALL_LINKS) {
    if (pathname === link.url || pathname.startsWith(`${link.url}/`)) {
      if (!best || link.url.length > best.url.length) best = link;
    }
  }
  return best?.title ?? app.title;
}
