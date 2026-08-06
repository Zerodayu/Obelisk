import { PendingSection } from "@/components/dashboard/role-dashboard-shell";

/**
 * Program Chair dashboard — scoped to the chair's single program
 * (`user.programId`). Targets, approvals, and CQI live here.
 */
export function ProgramChairDashboard() {
  return (
    <section className="space-y-6">
      <PendingSection label="Program attainment (CLO → PLO → cohort)" />
      <PendingSection label="Target-setting & curriculum map" />
      <PendingSection label="Approval queue (faculty submissions)" />
      <PendingSection label="Gap analysis & CQI action plans" />
    </section>
  );
}
