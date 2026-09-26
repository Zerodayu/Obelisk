import CapstonePanelForm from "@/components/forms/capstone-panel-form";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function CapstonePanelPage() {
  await requireRole(formRoles("capstone_panel_evaluation"));
  return (
    <FormPlaceholder
      title="Capstone Panel Evaluation"
      code="capstone_panel_evaluation"
      pdcaStage="CHECK"
      description="Panel evaluation with PLO-based rubric scoring (min 2 faculty + 1 industry required)."
    >
      <CapstonePanelForm />
    </FormPlaceholder>
  );
}
