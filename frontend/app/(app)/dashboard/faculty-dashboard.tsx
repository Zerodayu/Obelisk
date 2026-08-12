import {
  AttainmentFloorBars,
  CloAttainmentBars,
} from "@/components/charts/attainment-charts";
import { ChartCard } from "@/components/charts/chart-card";
import {
  AtRiskDonut,
  FormStatusDonut,
} from "@/components/charts/governance-charts";

/**
 * Faculty dashboard — scoped to the faculty member's own class sections and
 * courses for the active term (backend `faculty` role). Sample data only; the
 * chart inputs mirror the backend schema and will swap to rollup endpoints.
 */
export function FacultyDashboard() {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard
          title="CLO attainment — active class section"
          description="Direct × 70% + Indirect × 30% composite per CLO."
        >
          <CloAttainmentBars />
        </ChartCard>
        <ChartCard
          title="Attainment vs the ≥70% floor"
          description="Server-flagged CLOs below threshold render red."
        >
          <AttainmentFloorBars />
        </ChartCard>
        <ChartCard
          title="At-risk watchlist"
          description="Any student with a CLO score below 70% is auto-flagged."
        >
          <AtRiskDonut />
        </ChartCard>
        <ChartCard
          title="Course assessment report drafts"
          description="Submission status across the term."
        >
          <FormStatusDonut />
        </ChartCard>
      </div>
    </section>
  );
}
