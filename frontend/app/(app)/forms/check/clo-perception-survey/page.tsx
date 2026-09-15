import { CloPerceptionSurveyForm } from "@/components/forms/clo-perception-survey-form";
import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function CloPerceptionSurveyPage() {
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
