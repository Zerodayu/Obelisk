import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { PloSummaryForm } from "@/components/forms/plo-summary-form";

export default function PloAttainmentSummaryPage() {
  return (
    <FormPlaceholder
      title="PLO Attainment Summary"
      code="plo_attainment_summary"
      pdcaStage="CHECK"
      description="Program-level PLO attainment across all sections. Generates from program + term to show per-PLO scores, Rule 3 status, and mapped CLOs."
    >
      <PloSummaryForm />
    </FormPlaceholder>
  );
}
