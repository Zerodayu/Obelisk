import {
  PloAttainmentBars,
  ScoreBandBars,
} from "@/components/charts/attainment-charts";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
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
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>PLO attainment</FrameTitle>
            <FrameDescription>
              Attained vs the ≥70% target for this cluster's cohort.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <PloAttainmentBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Score distribution</FrameTitle>
            <FrameDescription>
              Students across the 4-tier rubric bands.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <ScoreBandBars />
            </div>
          </FramePanel>
        </Frame>
      </div>
    </div>
  );
}
