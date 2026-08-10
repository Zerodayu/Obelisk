import { ChartCard } from "@/components/charts/chart-card";
import {
  type CurriculumCoverageDatum,
  MOCK_CURRICULUM_COVERAGE,
} from "@/components/charts/obe-sample-data";
import { CurriculumCoverageBars } from "@/components/charts/plan-charts";
import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function CurriculumMapPage() {
  const plos = [
    ...new Set(MOCK_CURRICULUM_COVERAGE.map((m) => m.ploCode)),
  ].sort();
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
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {plos.map((plo) => (
          <CoverageCell
            key={plo}
            plo={plo}
            mapped={MOCK_CURRICULUM_COVERAGE.filter((m) => m.ploCode === plo)}
          />
        ))}
      </div>
    </FormPlaceholder>
  );
}

function CoverageCell({
  plo,
  mapped,
}: {
  plo: string;
  mapped: CurriculumCoverageDatum[];
}) {
  const passed = mapped.length > 0;
  return (
    <div
      className={`rounded-xl border p-3 text-sm shadow-sm ${
        passed ? "border-emerald-500/40 bg-card" : "border-red-500/50 bg-card"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold">{plo}</span>
        <span className="text-xs text-muted-foreground">
          {passed ? "✓ Covered" : "✗ Gap"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {mapped.length} CLO{mapped.length === 1 ? "" : "s"} ·{" "}
        {mapped.map((m) => m.cloCode).join(", ") || "unmapped"}
      </p>
    </div>
  );
}
