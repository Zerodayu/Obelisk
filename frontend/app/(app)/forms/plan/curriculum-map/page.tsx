import { ChartCard } from "@/components/charts/chart-card";
import { CurriculumCoverageBars } from "@/components/charts/plan-charts";
import { CurriculumCoverageGrid } from "@/components/forms/curriculum-coverage-grid";
import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function CurriculumMapPage() {
  return (
    <FormPlaceholder
      title="CLO-PLO Curriculum Map"
      code="curriculum_map"
      pdcaStage="PLAN"
      description="Dynamic CLO-PLO matrix with computed Coverage Check. Chart inputs mirror the backend schema; sample data until the curriculum endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-1">
        <ChartCard
          title="CLO coverage per PLO"
          description="Mapped CLOs per PLO — ≥1 mapped passes the Coverage Check."
          className="h-80"
        >
          <CurriculumCoverageBars />
        </ChartCard>
      </div>
      <CurriculumCoverageGrid />
    </FormPlaceholder>
  );
}
