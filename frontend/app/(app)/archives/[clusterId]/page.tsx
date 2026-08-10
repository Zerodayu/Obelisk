import {
  PloAttainmentBars,
  ScoreBandBars,
} from "@/components/charts/attainment-charts";
import { ChartCard } from "@/components/charts/chart-card";
import { ARCHIVE_ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";

/**
 * `/archives/[clusterId]` — read-only per-student compiled snapshots with
 * drill-down into the exported detail artifact. No edit/delete affordances.
 */
export default async function ClusterDetailPage({
  params,
}: {
  params: Promise<{ clusterId: string }>;
}) {
  await requireRole(ARCHIVE_ROLES);
  const { clusterId } = await params;

  return (
    <div className="px-4 lg:px-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">
          Cluster {clusterId}
        </h2>
        <p className="text-sm text-muted-foreground">
          Permanent, read-only snapshot. No data here can be modified.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard
          title="PLO attainment"
          description="Attained vs the ≥70% target for this cluster's cohort."
        >
          <PloAttainmentBars />
        </ChartCard>
        <ChartCard
          title="Score distribution"
          description="Students across the 4-tier rubric bands."
        >
          <ScoreBandBars />
        </ChartCard>
      </div>
    </div>
  );
}
