import { ProgramsDepartmentsPanel } from "@/components/admin/programs-departments-panel";
import { RoleRequestsPanel } from "@/components/auth/role-requests-panel";

/**
 * System Admin dashboard — the two platform-administration screens: reference
 * data (add departments and the programs under them) and role-request approval.
 * Both panels are system_admin-gated server-side (`manageReferenceData` /
 * `manageRoleRequests`).
 */
export function SystemAdminDashboard() {
	return (
		<section className="space-y-6">
			<ProgramsDepartmentsPanel />
			<RoleRequestsPanel />
		</section>
	);
}
