import { PloManagementPanel } from "@/components/outcomes/plo-management-panel";
import { PLO_MANAGEMENT_ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";

/**
 * `/plo-management` — dean-only Program Learning Outcome management.
 *
 * Deans add/edit/remove PLOs per program (codes continue sequentially:
 * PLO1, PLO2, …); faculty then map the resulting PLOs to CLOs in the
 * curriculum map's CLO-PLO connections panel.
 */
export default async function PloManagementPage() {
  await requireRole(PLO_MANAGEMENT_ROLES);
  return (
    <div className="px-4 lg:px-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">PLO Management</h2>
        <p className="text-sm text-muted-foreground">
          Manage Program Learning Outcomes per program. Targets must clear the
          70% institutional hard floor; faculty map the resulting PLOs to CLOs
          in the Curriculum Map afterwards.
        </p>
      </div>
      <PloManagementPanel />
    </div>
  );
}
