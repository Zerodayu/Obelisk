import { CloPloMatrixPanel } from "@/components/outcomes/clo-plo-matrix-panel";
import { PloManagementNav } from "@/components/outcomes/plo-management-nav";

/**
 * `/plo-management/connections` — CLO × PLO connection matrix for a program.
 *
 * Read-mostly companion to the Curriculum Map's CLO-PLO panel: rows are CLOs
 * grouped by course, columns are PLOs; dean-only via `../layout.tsx`.
 */
export default function CloPloConnectionsPage() {
  return (
    <div className="px-4 lg:px-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">
          CLO–PLO Connections
        </h2>
        <p className="text-sm text-muted-foreground">
          See which Program Learning Outcome each Course Learning Outcome maps
          to — weight, I-P-D stage, and coverage gaps at a glance.
        </p>
      </div>
      <PloManagementNav />
      <CloPloMatrixPanel />
    </div>
  );
}
