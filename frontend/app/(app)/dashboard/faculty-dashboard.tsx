import { PendingSection } from "@/components/dashboard/role-dashboard-shell";

/**
 * Faculty dashboard — scoped to the faculty member's own class sections and
 * courses for the active term (backend `faculty` role). When the term/program
 * data lands via `/auth/me` + rollup endpoints, the scope badge and stats will
 * be resolved from the session (`lib/roles.scopeForRole`).
 */
export function FacultyDashboard() {
  return (
    <section className="space-y-6">
      <PendingSection label="Active class sections & per-student CLO raw data" />
      <PendingSection label="At-risk watchlist for your classes" />
      <PendingSection label="Course Assessment Report drafts" />
    </section>
  );
}
