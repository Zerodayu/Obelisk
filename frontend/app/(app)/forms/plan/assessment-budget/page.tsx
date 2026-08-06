import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function AssessmentBudgetPage() {
  return (
    <FormPlaceholder
      title="Approved Assessment Budget"
      code="assessment_budget"
      pdcaStage="PLAN"
      description="12 fixed line items grouped by PDCA phase; computed totals."
    />
  );
}
