import type { ComponentType } from "react";
import { AqauDashboard } from "@/app/(app)/dashboard/aqau-dashboard";
import { DeanDashboard } from "@/app/(app)/dashboard/dean-dashboard";
import { FacultyDashboard } from "@/app/(app)/dashboard/faculty-dashboard";
import { ProgramChairDashboard } from "@/app/(app)/dashboard/program-chair-dashboard";
import { SystemAdminDashboard } from "@/app/(app)/dashboard/system-admin-dashboard";
import { VpaaDashboard } from "@/app/(app)/dashboard/vpaa-dashboard";
import {
  DashboardShell,
  type StatCard,
} from "@/components/dashboard/role-dashboard-shell";
import type { ApiUser } from "@/lib/api";
import { roleLabel } from "@/lib/roles";

interface DashboardConfig {
  title: string;
  description: string;
  scopeLabel?: string;
  component: ComponentType;
}

/**
 * Role → dashboard registry. Adding a role dashboard = add one entry here.
 * `/dashboard` stays a single adaptive route; the page renders whatever
 * component this maps to for the authenticated user.
 */
const ROLE_DASHBOARDS: Record<string, DashboardConfig> = {
  faculty: {
    title: "Faculty Workspace",
    description:
      "Your class sections, raw attainment data, and at-risk watchlist.",
    component: FacultyDashboard,
  },
  program_chair: {
    title: "Program Chair",
    description: "Your program's attainment, targets, approvals, and CQI.",
    scopeLabel: "Own Program",
    component: ProgramChairDashboard,
  },
  dean: {
    title: "Dean",
    description: "Your department's endorsements, budgets, and sign-offs.",
    scopeLabel: "Own Department",
    component: DeanDashboard,
  },
  aqau: {
    title: "AQAU",
    description: "Institution-wide QA oversight and cohort tracking.",
    component: AqauDashboard,
  },
  vpaa: {
    title: "VPAA",
    description: "Institution-wide academic decisions and approvals.",
    component: VpaaDashboard,
  },
  system_admin: {
    title: "System Admin",
    description: "Platform administration, audits, and archival confirmation.",
    component: SystemAdminDashboard,
  },
  user: {
    title: "Getting Started",
    description:
      "Your account has no institutional scope yet. Contact your administrator.",
    component: UserPlaceholderDashboard,
  },
};

function UserPlaceholderDashboard() {
  return (
    <p className="text-sm text-muted-foreground">
      No program, department, or class section is assigned to your account.
    </p>
  );
}

/** Scope badge text derived from the session user's institutional links. */
function scopeLabelFor(user: ApiUser): string | undefined {
  if (user.programId) return `Program ${user.programId}`;
  if (user.departmentId) return `Department ${user.departmentId}`;
  return undefined;
}

export function RoleDashboard({ user }: { user: ApiUser }) {
  const config = ROLE_DASHBOARDS[user.role] ?? ROLE_DASHBOARDS.user;
  const Scope = config.component;
  const stats: StatCard[] = [];

  return (
    <DashboardShell
      title={`${config.title} — ${roleLabel(user.role)}`}
      scopeLabel={config.scopeLabel ?? scopeLabelFor(user)}
      description={config.description}
      stats={stats}
    >
      <Scope />
    </DashboardShell>
  );
}
