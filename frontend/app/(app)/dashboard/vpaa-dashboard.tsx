import { PendingSection } from "@/components/dashboard/role-dashboard-shell";

/**
 * VPAA dashboard — institution-wide academic decisions: CAPA/budget
 * approvals and institutional management reviews.
 */
export function VpaaDashboard() {
  return (
    <section className="space-y-6">
      <PendingSection label="Institutional CQI completion rate" />
      <PendingSection label="CAPA plan approvals" />
      <PendingSection label="Institutional management review (D1–D5)" />
    </section>
  );
}
