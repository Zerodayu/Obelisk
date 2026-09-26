import { CurriculumMapForm } from "@/components/forms/curriculum-map-form";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function CurriculumMapPage() {
  await requireRole(formRoles("curriculum_map"));
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
