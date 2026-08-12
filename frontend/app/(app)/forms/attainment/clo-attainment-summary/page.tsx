import {
  AttainmentFloorBars,
  CloAttainmentBars,
  ScoreBandBars,
} from "@/components/charts/attainment-charts";
import { ChartCard } from "@/components/charts/chart-card";
import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function CloAttainmentSummaryPage() {
  return (
    <FormPlaceholder
      title="CLO Attainment Summary (Full Term)"
      code="clo_attainment_summary"
      pdcaStage="CHECK"
      description="Full-term CLO attainment computed by cohort. Chart inputs mirror the backend schema; sample data until the rollup endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard
          title="Composite CLO attainment"
          description="Direct × 70% + Indirect × 30%. The ≥70% floor is enforced server-side."
        >
          <CloAttainmentBars />
        </ChartCard>
        <ChartCard
          title="CLO status vs the ≥70% floor"
          description="Server-flagged CLOs below threshold render red (NOT MET)."
        >
          <AttainmentFloorBars />
        </ChartCard>
        <ChartCard
          title="Score distribution"
          description="Students across the 4-tier rubric bands."
          className="sm:col-span-2"
        >
          <ScoreBandBars />
        </ChartCard>
      </div>
    </FormPlaceholder>
  );
}
