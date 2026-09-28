import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { TargetSettingMatrixForm } from "@/components/forms/target-setting-matrix-form";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function TargetSettingMatrixPage() {
  await requireRole(formRoles("target_setting_matrix"));
  return (
    <FormPlaceholder
      title="Target Setting Matrix"
      code="target_setting_matrix"
      pdcaStage="PLAN"
      description="Set PLO and CLO targets per year level. The ≥70% hard floor is enforced server-side."
    >
      <TargetSettingMatrixForm />
    </FormPlaceholder>
  );
}
