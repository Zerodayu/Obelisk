import { PendingSection } from "@/components/dashboard/role-dashboard-shell";
import { requireRole } from "@/server/auth";
import { ARCHIVE_ROLES } from "@/lib/roles";

/**
 * `/archives` — graduation-cluster archive list (program, batch, status,
 * student count, archivedAt). Read-only; gated to aqau/vpaa/dean/system_admin.
 */
export default async function ArchivesIndexPage() {
  await requireRole(ARCHIVE_ROLES);
  return (
    <div className="px-4 lg:px-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Archives</h2>
        <p className="text-sm text-muted-foreground">
          Compiled graduation clusters. Data here is permanent and read-only.
        </p>
      </div>
      <PendingSection label="Graduation cluster list" />
    </div>
  );
}
