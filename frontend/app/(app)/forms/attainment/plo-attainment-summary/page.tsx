import { PloAttainmentBars } from "@/components/charts/attainment-charts";
import { ChartCard } from "@/components/charts/chart-card";
import { RootCauseDonut } from "@/components/charts/cqi-charts";
import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function PloAttainmentSummaryPage() {
  return (
    <FormPlaceholder
      title="PLO Attainment Summary"
      code="plo_attainment_summary"
      pdcaStage="CHECK"
      description="Aggregates CARs into program-level PLO attainment. Chart inputs mirror the backend schema; sample data until the rollup endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard
          title="PLO attainment vs target"
          description="Attained vs the ≥70% target per PLO."
        >
          <PloAttainmentBars />
        </ChartCard>
        <ChartCard
          title="Root-cause categories"
          description="Where NOT-MET PLOs flag root causes, per the fixed 6-category set."
        >
          <RootCauseDonut />
        </ChartCard>
      </div>
    </FormPlaceholder>
  );
}
