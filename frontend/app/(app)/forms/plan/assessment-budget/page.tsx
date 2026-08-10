import { ChartCard } from "@/components/charts/chart-card";
import {
  BudgetPhaseDonut,
  BudgetVsActualBars,
} from "@/components/charts/plan-charts";
import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function AssessmentBudgetPage() {
  return (
    <FormPlaceholder
      title="Approved Assessment Budget"
      code="assessment_budget"
      pdcaStage="PLAN"
      description="12 fixed line items grouped by PDCA phase; computed totals. Chart inputs mirror the backend schema; sample data until the budget endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard
          title="Budget by PDCA phase"
          description="Approved allocation pooled per phase."
        >
          <BudgetPhaseDonut />
        </ChartCard>
        <ChartCard
          title="Planned vs spent"
          description="Line-item budget utilization (PHP thousands)."
        >
          <BudgetVsActualBars />
        </ChartCard>
      </div>
    </FormPlaceholder>
  );
}
