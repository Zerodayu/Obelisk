import { AparForm } from "@/components/forms/apar-form";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function AnnualProgramReportPage() {
  await requireRole(formRoles("annual_program_report"));
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
