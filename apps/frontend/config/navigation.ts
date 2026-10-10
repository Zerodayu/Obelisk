/**
 * Obelisk navigation & route registry — the single source of truth for what
 * appears in the sidebar and which routes each role may reach.
 *
 * Adding a role or a route = add/edit one entry here (plus the corresponding
 * page under `app/`). Form items carry a stable `code`; their per-form
 * **nav** visibility derives from `FORM_ACCESS[code].preparers` in
 * `lib/role-access.ts` (mirrors the backend approval-routes registry) — a
 * role sees only the forms it prepares, not every form it merely reviews —
 * unless the item carries an explicit `roles`, which wins (a screen narrower
 * than its preparers, e.g. the class-record upload screen).
 * The sidebar leads with the per-role duty steps from `config/role-duties.ts`
 * (`sidebarNavFor`) and follows with that catalog; the dashboard checklist
 * reads the same duty registry. The sidebar, archive/form gates, and any
 * future breadcrumbs all derive from this. Backend still enforces authority;
 * this drives navigation and rendering only.
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
	ScrollTextIcon,
	StarIcon,
	TargetIcon,
	UsersIcon,
	WalletIcon,
} from "lucide-react";

import { type DutyStep, dutiesFor } from "@/config/role-duties";
import {
	APPROVER_ROLES,
	ARCHIVE_ROLES,
	PLO_MANAGEMENT_ROLES,
	preparerRoles,
	screenRoles,
	type UserRole,
} from "@/lib/role-access";
import { hasAccess } from "@/lib/roles";
import { app } from "@/utils/app-info";

export interface NavChild {
	title: string;
	url: string;
	/**
	 * Explicit allow-list roles; empty/absent = any authenticated role.
	 * An explicit list **wins** over a `code`'s derived roles — use it to
	 * narrow a form screen below its preparers (e.g. the class-record upload
	 * screen, `CLASS_RECORD_SCREEN_ROLES`). Otherwise items carrying a `code`
	 * derive their roles from `preparerRoles(code)` in `lib/role-access.ts`
	 * (the form's preparers).
	 */
	roles?: readonly UserRole[];
	/**
	 * Stable snake_case `FormType.code` for form screens — used by the
	 * submission inboxes to link a record back to its screen, and to derive
	 * per-form role visibility from `lib/role-access.ts`.
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
				code: "clo_raw_data",
				// The upload screen is faculty's capture step (admin bypass kept) —
				// narrower than the form's preparers (which include program_chair).
				// Nav here follows the screen's route gate, not its preparers.
				roles: screenRoles("clo_raw_data"),
			},
			{
				title: "Course Assessment Report",
				url: "/forms/course-assessment-report",
				icon: FileChartColumnIcon,
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
			{
				title: "Action Taken (At-Risk)",
				url: "/forms/cqi/action-taken",
				icon: ClipboardCheckIcon,
				code: "action_taken",
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

/**
 * Effective allow-list for a nav item: an explicit `roles` list wins (it can
 * narrow a form screen below its preparers, e.g. the class-record upload
 * screen); otherwise form screens derive from `preparerRoles(code)` (the
 * form's preparers — what a role *does*) in `lib/role-access.ts`, and items
 * without a code fall back to their explicit `roles` (absent = any
 * authenticated). Chain-only visibility is deliberately excluded here:
 * approvers reach those screens from the approval inbox, which links through
 * `formPathForCode`.
 */
function rolesFor(item: NavChild): readonly UserRole[] | undefined {
	if (item.roles) return item.roles;
	if (item.code) return preparerRoles(item.code);
	return undefined;
}

/**
 * Role-aware screen path for a stable form code — `formPathByCode`, filtered
 * by `screenRoles(code)` (the screen's **route gate**, not its preparers).
 *
 * Use this for links rendered to an arbitrary role (the approval/evidence
 * panels' "Open form screen"): approvers keep their link to every screen the
 * route gate lets them open, while a screen gated narrower than its form —
 * the class-record upload screen (`clo_raw_data` → `CLASS_RECORD_SCREEN_ROLES`)
 * — never dead-ends a reviewer on a redirect to `/dashboard`.
 */
export function formPathForCode(
	code: string,
	role: UserRole | undefined,
): string | undefined {
	const path = formPathByCode[code];
	if (!path) return undefined;
	return hasAccess(role, screenRoles(code)) ? path : undefined;
}

function allowRoles(item: NavChild, role: UserRole): boolean {
	return hasAccess(role, rolesFor(item));
}

/** Does the item (or any child) remain visible for the given role? */
export function itemVisible(item: NavItem, role: UserRole): boolean {
	if (allowRoles(item, role)) return true;
	return (item.children ?? []).some((child) => allowRoles(child, role));
}

/**
 * Filter the registry down to the forms the role **prepares**, preserving the
 * grouping structure. Any item the role neither prepares — nor can reach
 * through an accessible child — is dropped, so empty groups disappear and a
 * role with no preparer forms (e.g. `vpaa`, `aqau`) gets no forms catalog at
 * all.
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

// --- Per-role duty steps (the sidebar's "what you do" sections) ------------

/** Nav visibility for a duty step — never wider than the backend allows. */
function dutyVisible(step: DutyStep, role: UserRole): boolean {
	if (step.status.kind === "prepare") {
		// Same rule as a plain form item: the form's preparers.
		return hasAccess(role, preparerRoles(step.status.code));
	}
	if (step.status.kind === "approve") {
		return hasAccess(role, step.roles ?? APPROVER_ROLES);
	}
	// `link` steps carry an explicit feature list (absent = any authenticated).
	return hasAccess(role, step.roles);
}

/** Map one duty step to a nav item (prepare steps keep their stable `code`). */
function dutyNavItem(step: DutyStep): NavItem {
	const { title, url, icon } = step;
	if (step.status.kind === "prepare") {
		return { title, url, icon, code: step.status.code };
	}
	if (step.status.kind === "approve") {
		return { title, url, icon, roles: step.roles ?? APPROVER_ROLES };
	}
	return { title, url, icon, roles: step.roles };
}

/**
 * The role's duty sections as nav sections, numbered so the sidebar reads as
 * ordered responsibilities (`1 · Class Records`, `2 · Indirect Survey`, …).
 * Roles without a duty list get an empty array.
 */
function dutyNavSections(role: UserRole): NavSection[] {
	return dutiesFor(role)
		.map((section, index) => ({
			label: `${index + 1} · ${section.label}`,
			items: section.steps
				.filter((step) => dutyVisible(step, role))
				.map(dutyNavItem),
		}))
		.filter((section) => section.items.length > 0);
}

export interface SidebarNav {
	/** Ordered responsibility steps for the role (numbered group labels). */
	duties: NavSection[];
	/** PDCA catalog — everything else the role prepares, minus duty links. */
	catalog: NavSection[];
}

/**
 * Sidebar payload: duty steps first, then the preparer catalog with any URL a
 * duty already links to removed (no duplicates). `/forms` keeps calling
 * `navSectionsFor` directly, so the full preparer catalog stays reachable.
 */
export function sidebarNavFor(role: UserRole): SidebarNav {
	const duties = dutyNavSections(role);
	const surfaced = new Set(
		duties.flatMap((section) => section.items.map((item) => item.url)),
	);
	const catalog = navSectionsFor(role)
		.map((group) => ({
			label: group.label,
			items: group.items.filter((item) => !surfaced.has(item.url)),
		}))
		.filter((group) => group.items.length > 0);
	return { duties, catalog };
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
	// NOTE: vpaa never prepares submissions (preparerRoles excludes it) — it
	// gets the institution-wide list behind the archive gate instead.
	if (role !== "vpaa") {
		items.push({
			title: "My Submissions",
			url: "/submissions",
			icon: FileTextIcon,
		});
	}
	if (hasAccess(role, ARCHIVE_ROLES))
		items.push({
			title: "Submissions",
			url: "/all-submissions",
			icon: FileTextIcon,
		});
	if (hasAccess(role, APPROVER_ROLES))
		items.push({
			title: "Pending Approvals",
			url: "/approvals",
			icon: ClipboardCheckIcon,
		});
	if (hasAccess(role, ARCHIVE_ROLES))
		items.push({ title: "Archives", url: "/archives", icon: ArchiveIcon });
	// NOTE: visible to every role — the backend serves self-scoped rows only,
	// vpaa/system_admin get the full waterfall (viewAllAuditLogs).
	items.push({ title: "Audit Logs", url: "/audit-logs", icon: ScrollTextIcon });
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
		{ title: "Submissions", url: "/all-submissions" },
		{ title: "Pending Approvals", url: "/approvals" },
		{ title: "Archives", url: "/archives" },
		{ title: "Audit Logs", url: "/audit-logs" },
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
