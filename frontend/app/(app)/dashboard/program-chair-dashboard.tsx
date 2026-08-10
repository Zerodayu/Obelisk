import {
  CohortTrendLines,
  PloAttainmentBars,
} from "@/components/charts/attainment-charts";
import { ChartCard } from "@/components/charts/chart-card";
import {
  CqiActionsBars,
  GapAnalysisBars,
} from "@/components/charts/cqi-charts";
import { ApprovalFlowBars } from "@/components/charts/governance-charts";
import { CurriculumCoverageBars } from "@/components/charts/plan-charts";

/**
 * Program Chair dashboard — scoped to the chair's single program
 * (`user.programId`). Targets, approvals, and CQI live here. Chart inputs
 * mirror the backend schema; sample data until the rollup endpoints land.
 */
export function ProgramChairDashboard() {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard
          title="Program attainment (PLO)"
          description="Attained vs target per PLO. Target is the ≥70% hard floor."
        >
          <PloAttainmentBars />
        </ChartCard>
        <ChartCard
          title="Attainment trend by cohort"
          description="Longitudinal composite across terms."
        >
          <CohortTrendLines />
        </ChartCard>
        <ChartCard
          title="Curriculum map coverage"
          description="Number of CLOs mapped to each PLO in the matrix."
        >
          <CurriculumCoverageBars />
        </ChartCard>
        <ChartCard
          title="Approval queue"
          description="Pending / approved / returned across the chain."
        >
          <ApprovalFlowBars />
        </ChartCard>
        <ChartCard
          title="PLO gap analysis"
          description="Gap rows for NOT-MET PLO-cohort combinations (root-cause flagged)."
        >
          <GapAnalysisBars />
        </ChartCard>
        <ChartCard
          title="CQI action plans"
          description="Planned vs completed actions per root-cause category."
        >
          <CqiActionsBars />
        </ChartCard>
      </div>
    </section>
  );
}
