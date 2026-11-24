import { PloManagementNav } from "@/components/outcomes/plo-management-nav";
import { PloManagementPanel } from "@/components/outcomes/plo-management-panel";
import { PLO_MANAGEMENT_ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";

/**
 * `/plo-management` — Program Learning Outcome management.
 *
 * The program chair proposes PLOs and submits them to the dean; the dean
 * approves them (or authors PLOs directly) — only approved PLOs are active
 * and map to CLOs. The sibling `/connections` view shows the resulting
 * CLO × PLO matrix.
 */
export default async function PloManagementPage() {
	await requireRole(PLO_MANAGEMENT_ROLES);
	return (
		<div className="space-y-6 px-4 lg:px-6">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">PLO Management</h2>
				<p className="text-muted-foreground text-sm">
					Propose and approve Program Learning Outcomes per program. Targets
					must clear the 70% institutional hard floor; the CLO–PLO Connections
					tab shows which CLOs each PLO maps to.
				</p>
			</div>
			<PloManagementNav />
			<PloManagementPanel />
		</div>
	);
}
