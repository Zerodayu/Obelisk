import { RoleRequestsPanel } from "@/components/auth/role-requests-panel";
import { ChartCard } from "@/components/charts/chart-card";
import {
  AuditActivityBars,
  ClusterCompositionDonut,
  FormStatusDonut,
  RecommendationDonut,
} from "@/components/charts/governance-charts";

/**
 * System Admin dashboard — full platform visibility plus admin operations
 * (role assignment, user provisioning, archival confirmation). Chart inputs
 * mirror the backend schema; sample data until rollup endpoints land.
 */
export function SystemAdminDashboard() {
  return (
    <section className="space-y-6">
      <RoleRequestsPanel />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard
          title="System-wide audit activity"
          description="Audit-log events per module."
        >
          <AuditActivityBars />
        </ChartCard>
        <ChartCard
          title="Submission volume by status"
          description="All form submissions across the platform."
        >
          <FormStatusDonut />
        </ChartCard>
        <ChartCard
          title="Graduation-cluster confirmation"
          description="Archived cluster composition by student status."
        >
          <ClusterCompositionDonut />
        </ChartCard>
        <ChartCard
          title="AI recommendation review"
          description="Status of system-generated recommendations awaiting review."
        >
          <RecommendationDonut />
        </ChartCard>
      </div>
    </section>
  );
}
