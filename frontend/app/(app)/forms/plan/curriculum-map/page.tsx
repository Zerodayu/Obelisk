import { CurriculumMapForm } from "@/components/forms/curriculum-map-form";
import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function CurriculumMapPage() {
  return (
    <FormPlaceholder
      title="Curriculum Map"
      code="curriculum_map"
      pdcaStage="PLAN"
      description="Map PLOs to courses with I-P-D stages. Ensure every PLO has at least one D-stage course for full coverage."
    >
      <CurriculumMapForm />
    </FormPlaceholder>
  );
}
