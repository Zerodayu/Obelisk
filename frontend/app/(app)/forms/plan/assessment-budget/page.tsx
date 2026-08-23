import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { AssessmentBudgetForm } from "@/components/forms/assessment-budget-form";

export default function AssessmentBudgetPage() {
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
