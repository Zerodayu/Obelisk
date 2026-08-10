import { ChartCard } from "@/components/charts/chart-card";
import {
  GapAnalysisBars,
  RootCauseDonut,
} from "@/components/charts/cqi-charts";
import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function PloGapAnalysisPage() {
  return (
    <FormPlaceholder
      title="PLO Attainment Report with Gap Analysis"
      code="plo_gap_analysis"
      pdcaStage="ACT"
      description="Gap row per NOT-MET PLO-cohort combo with root-cause categories. Chart inputs mirror the backend schema; sample data until the rollup endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard
          title="Attained vs target"
          description="Positive gap = below the ≥70% target."
        >
          <GapAnalysisBars />
        </ChartCard>
        <ChartCard
          title="Root-cause distribution"
          description="Fixed 6-category root-cause analysis across NOT-MET rows."
        >
          <RootCauseDonut />
        </ChartCard>
      </div>
    </FormPlaceholder>
  );
}
