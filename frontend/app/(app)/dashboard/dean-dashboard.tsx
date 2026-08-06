import { PendingSection } from "@/components/dashboard/role-dashboard-shell";

/**
 * Dean dashboard — scoped to the dean's department (`user.departmentId`).
 * Endorsements and program-level schedules route through here.
 */
export function DeanDashboard() {
  return (
    <section className="space-y-6">
      <PendingSection label="Department forms pending endorsement" />
      <PendingSection label="Assessment budget & plan approvals" />
      <PendingSection label="Annual Program Report sign-off" />
    </section>
  );
}
