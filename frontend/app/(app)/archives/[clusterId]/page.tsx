import { PendingSection } from "@/components/dashboard/role-dashboard-shell";
import { requireRole } from "@/server/auth";
import { ARCHIVE_ROLES } from "@/lib/roles";

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
      <PendingSection label="Per-student compiled snapshots" />
    </div>
  );
}
