import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { CloSummaryForm } from "@/components/forms/clo-summary-form";

export default function CloAttainmentSummaryPage() {
  return (
    <FormPlaceholder
      title="CLO Attainment Summary (Full Term)"
      code="clo_attainment_summary"
      pdcaStage="CHECK"
      description="Full-term CLO attainment computed by cohort. Generate from ingest data to see per-CLO scores with the 4-tier level badges."
    >
      <CloSummaryForm />
    </FormPlaceholder>
  );
}
