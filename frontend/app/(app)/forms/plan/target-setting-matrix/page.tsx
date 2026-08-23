import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { TargetSettingMatrixForm } from "@/components/forms/target-setting-matrix-form";

export default function TargetSettingMatrixPage() {
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
