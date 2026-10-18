import { ProgramsDepartmentsPanel } from "@/components/admin/programs-departments-panel";
import { UsersTable } from "@/components/admin/users-table";
import { RoleRequestsPanel } from "@/components/auth/role-requests-panel";

/**
 * System Admin dashboard — the platform-administration screens: reference data
 * (add departments and the programs under them), role-request approval, and the
 * platform user list. All three are system_admin-gated server-side
 * (`manageReferenceData` / `manageRoleRequests` / `viewPlatformStats`).
 */
export function SystemAdminDashboard() {
	return (
		<section className="space-y-6">
			<ProgramsDepartmentsPanel />
			<RoleRequestsPanel />
			<UsersTable />
		</section>
	);
}
