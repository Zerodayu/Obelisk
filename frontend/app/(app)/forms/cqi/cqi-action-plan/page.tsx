import { ChartCard } from "@/components/charts/chart-card";
import { CqiActionsBars, RootCauseDonut } from "@/components/charts/cqi-charts";
import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function CqiActionPlanPage() {
  return (
    <FormPlaceholder
      title="CQI Action Plan"
      code="cqi_action_plan"
      pdcaStage="ACT"
      description="Stateful two-phase lifecycle: planned → tracked to completion. Chart inputs mirror the backend schema; sample data until the CQI endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard
          title="Actions planned vs completed"
          description="CQI action progress per root-cause category."
        >
          <CqiActionsBars />
        </ChartCard>
        <ChartCard
          title="Root-cause focus"
          description="Categories targeted by the action plans."
        >
          <RootCauseDonut />
        </ChartCard>
      </div>
    </FormPlaceholder>
  );
}
