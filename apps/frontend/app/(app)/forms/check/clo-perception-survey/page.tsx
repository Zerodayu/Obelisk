import { CloPerceptionSurveyForm } from "@/components/forms/clo-perception-survey-form";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function CloPerceptionSurveyPage() {
  await requireRole(formRoles("clo_perception_survey"));
  return (
    <FormPlaceholder
      title="CLO Achievement Perception Survey Tabulation"
      code="clo_perception_survey"
      pdcaStage="CHECK"
      description="5-point Likert tabulation with divergence auto-detection against direct attainment."
    >
      <CloPerceptionSurveyForm />
    </FormPlaceholder>
  );
}
