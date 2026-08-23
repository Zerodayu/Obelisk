import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { PloGapAnalysisForm } from "@/components/forms/plo-gap-analysis-form";

export default function PloGapAnalysisPage() {
  return (
    <FormPlaceholder
      title="PLO Attainment Report with Gap Analysis"
      code="plo_gap_analysis"
      pdcaStage="ACT"
      description="Identify NOT-MET PLO-cohort gaps and assign root-cause categories with owners."
    >
      <PloGapAnalysisForm />
    </FormPlaceholder>
  );
}
