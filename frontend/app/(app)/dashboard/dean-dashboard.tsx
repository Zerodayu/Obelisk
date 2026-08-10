import {
  CohortTrendLines,
  PloAttainmentBars,
} from "@/components/charts/attainment-charts";
import { ChartCard } from "@/components/charts/chart-card";
import { ApprovalFlowBars } from "@/components/charts/governance-charts";
import {
  BudgetPhaseDonut,
  BudgetVsActualBars,
} from "@/components/charts/plan-charts";

/**
 * Dean dashboard — scoped to the dean's department (`user.departmentId`).
 * Endorsements and program-level schedules route through here. Chart inputs
 * mirror the backend schema; sample data until rollup endpoints land.
 */
export function DeanDashboard() {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard
          title="Program attainment"
          description="PLO attainment across program-reported CARs in the department."
        >
          <PloAttainmentBars />
        </ChartCard>
        <ChartCard
          title="Department cohort trend"
          description="Composite attainment across terms."
        >
          <CohortTrendLines />
        </ChartCard>
        <ChartCard
          title="Approval & endorsement queue"
          description="Forms pending endorsement from departmental program chairs."
        >
          <ApprovalFlowBars />
        </ChartCard>
        <ChartCard
          title="Assessment budget by PDCA phase"
          description="Approved allocation across the four phases."
        >
          <BudgetPhaseDonut />
        </ChartCard>
        <ChartCard
          title="Budget planned vs spent"
          description="Line-item budget utilization (PHP thousands)."
        >
          <BudgetVsActualBars />
        </ChartCard>
      </div>
    </section>
  );
}
