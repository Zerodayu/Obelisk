import { PendingSection } from "@/components/dashboard/role-dashboard-shell";

/**
 * System Admin dashboard — full platform visibility plus admin operations
 * (role assignment, user provisioning, archival confirmation).
 */
export function SystemAdminDashboard() {
  return (
    <section className="space-y-6">
      <PendingSection label="User & role administration" />
      <PendingSection label="Graduation-cluster confirmation" />
      <PendingSection label="System-wide audits & retention" />
    </section>
  );
}
