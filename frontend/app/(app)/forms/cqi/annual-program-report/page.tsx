import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { AparForm } from "@/components/forms/apar-form";

export default function AnnualProgramReportPage() {
  return (
    <FormPlaceholder
      title="Annual Program Assessment Report"
      code="annual_program_report"
      pdcaStage="ACT"
      description="Compile the APAR with 12 KPIs, attachments checklist, and 5 narrative sections. Submit gate requires an approved Cohort Tracking Sheet."
    >
      <AparForm />
    </FormPlaceholder>
  );
}
