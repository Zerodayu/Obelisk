import { CohortTrendLines } from "@/components/charts/attainment-charts";
import { ChartCard } from "@/components/charts/chart-card";
import {
  GapAnalysisBars,
  RootCauseDonut,
} from "@/components/charts/cqi-charts";
import {
  ClusterCompositionDonut,
  FormStatusDonut,
} from "@/components/charts/governance-charts";

/**
 * AQAU dashboard — institution-wide QA oversight. Receives filings, tracks
 * cohorts, and confirms graduation-cluster compilation. Chart inputs mirror
 * the backend schema; sample data until rollup endpoints land.
 */
export function AqauDashboard() {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard
          title="Institution-wide filing queue"
          description="Form submissions by status across all programs."
        >
          <FormStatusDonut />
        </ChartCard>
        <ChartCard
          title="Cohort tracking oversight"
          description="Longitudinal PLO/CLO attainment by cohort."
        >
          <CohortTrendLines />
        </ChartCard>
        <ChartCard
          title="Graduation-cluster composition"
          description="Archived student statuses in tracked clusters."
        >
          <ClusterCompositionDonut />
        </ChartCard>
        <ChartCard
          title="Systemic gap monitoring"
          description="Attained vs target with gap rows per PLO."
        >
          <GapAnalysisBars />
        </ChartCard>
        <ChartCard
          title="Root-cause distribution"
          description="Repeated 6-category root-cause analysis across gaps."
        >
          <RootCauseDonut />
        </ChartCard>
      </div>
    </section>
  );
}
