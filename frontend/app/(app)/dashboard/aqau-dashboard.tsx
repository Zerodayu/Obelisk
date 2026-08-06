import { PendingSection } from "@/components/dashboard/role-dashboard-shell";

/**
 * AQAU dashboard — institution-wide QA oversight. Receives filings, tracks
 * cohorts, and confirms graduation-cluster compilation.
 */
export function AqauDashboard() {
  return (
    <section className="space-y-6">
      <PendingSection label="Institution-wide filing review queue" />
      <PendingSection label="Cohort tracking oversight" />
      <PendingSection label="Graduation-cluster confirmation" />
      <PendingSection label="Systemic gap & CAPA monitoring" />
    </section>
  );
}
