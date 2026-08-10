import { ChartCard } from "@/components/charts/chart-card";
import {
  CqiActionsBars,
  LoopStatusDonut,
} from "@/components/charts/cqi-charts";
import {
  ApprovalFlowBars,
  RecommendationDonut,
} from "@/components/charts/governance-charts";

/**
 * VPAA dashboard — institution-wide academic decisions: CAPA/budget
 * approvals and institutional management reviews. Chart inputs mirror the
 * backend schema; sample data until rollup endpoints land.
 */
export function VpaaDashboard() {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard
          title="Institutional CQI completion"
          description="Planned vs completed CQI actions across the institution."
        >
          <CqiActionsBars />
        </ChartCard>
        <ChartCard
          title="Closing-the-loop status"
          description="Loop status is hard-computed server-side; display-only."
        >
          <LoopStatusDonut />
        </ChartCard>
        <ChartCard
          title="CAPA plan approvals"
          description="Approval-chain decisions on corrective & preventive actions."
        >
          <ApprovalFlowBars />
        </ChartCard>
        <ChartCard
          title="Institutional management review (D1–D5)"
          description="AI recommendation review status at the institutional level."
        >
          <RecommendationDonut />
        </ChartCard>
      </div>
    </section>
  );
}
