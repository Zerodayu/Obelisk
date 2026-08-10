import { CohortTrendLines } from "@/components/charts/attainment-charts";
import { ChartCard } from "@/components/charts/chart-card";
import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function CohortTrackingPage() {
  return (
    <FormPlaceholder
      title="Cohort CLO/PLO Attainment Tracking"
      code="cohort_tracking"
      pdcaStage="CHECK"
      description="Permanent longitudinal record; strict audit trail. Chart inputs mirror the backend schema; sample data until the cohort endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-1">
        <ChartCard
          title="Composite attainment by cohort"
          description="Longitudinal CLO/PLO attainment per cohort across terms."
          className="h-80"
        >
          <CohortTrendLines />
        </ChartCard>
      </div>
    </FormPlaceholder>
  );
}
