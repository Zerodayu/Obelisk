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
  ClipboardListIcon,
  FileChartColumnIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  type LucideIcon,
  RefreshCwIcon,
  TargetIcon,
  UsersIcon,
} from "lucide-react";

import { ACADEMIC_ROLES, hasAccess, type UserRole } from "@/lib/roles";

export interface NavChild {
  title: string;
  url: string;
  /** allow-list roles; empty = any authenticated role. */
  roles?: readonly UserRole[];
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
      },
      {
        title: "Course Assessment Report",
        url: "/forms/course-assessment-report",
        icon: FileChartColumnIcon,
        roles: ACADEMIC_ROLES,
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
      },
      {
        title: "PLO Attainment Summary",
        url: "/forms/attainment/plo-attainment-summary",
        icon: BarChart3Icon,
      },
      {
        title: "Cohort Tracking",
        url: "/forms/attainment/cohort-tracking",
        icon: LandmarkIcon,
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
      },
      {
        title: "CQI Action Plan",
        url: "/forms/cqi/cqi-action-plan",
        icon: ListChecksIcon,
      },
      {
        title: "Closing the Loop",
        url: "/forms/cqi/closing-the-loop",
        icon: RefreshCwIcon,
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
      },
      {
        title: "Assessment Calendar",
        url: "/forms/plan/assessment-calendar",
        icon: CalendarRangeIcon,
      },
      {
        title: "Target Setting Matrix",
        url: "/forms/plan/target-setting-matrix",
        icon: TargetIcon,
      },
      {
        title: "Assessment Budget",
        url: "/forms/plan/assessment-budget",
        icon: CalendarDaysIcon,
      },
    ],
  },
];

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
  return best?.title ?? "Obelisk";
}
