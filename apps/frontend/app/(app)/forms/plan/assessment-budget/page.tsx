import { AssessmentBudgetForm } from "@/components/forms/assessment-budget-form";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function AssessmentBudgetPage() {
  await requireRole(formRoles("assessment_budget"));
  return (
    <FormPlaceholder
      title="Assessment Budget"
      code="assessment_budget"
      pdcaStage="PLAN"
      description="Track assessment-related budget across PDCA phases. 12 fixed line items seeded; add custom items for program-specific needs."
    >
      <AssessmentBudgetForm />
    </FormPlaceholder>
  );
}
