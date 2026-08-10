import { ScoreBandBars } from "@/components/charts/attainment-charts";
import { ChartCard } from "@/components/charts/chart-card";
import { AtRiskDonut } from "@/components/charts/governance-charts";
import { ClassRecordUpload } from "@/components/forms/class-record-upload";
import { ACADEMIC_ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";

/**
 * `/forms/clo-raw-data` — primary data-capture form. Faculty author per-student
 * CLO scores (or import a class-record sheet); chairs/deans review. Restricted
 * to academic roles; the backend enforces per-user class-section scope.
 */
export default async function CloRawDataPage() {
  await requireRole(ACADEMIC_ROLES);
  return (
    <div className="px-4 lg:px-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">
          Per-Student CLO Raw Data
        </h2>
        <p className="text-sm text-muted-foreground">
          Enter or import per-student scores for your class section. At-risk
          flags are computed server-side (any CLO &lt; 70%).
        </p>
      </div>
      <ClassRecordUpload />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard
          title="Class score bands"
          description="Distribution across the 4-tier rubric. Sample data until ingest lands."
        >
          <ScoreBandBars />
        </ChartCard>
        <ChartCard
          title="At-risk watchlist"
          description="Any CLO score below 70% auto-flags a student (server-computed)."
        >
          <AtRiskDonut />
        </ChartCard>
      </div>
    </div>
  );
}
