import { CloSummaryForm } from "@/components/forms/clo-summary-form";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function CloAttainmentSummaryPage() {
  await requireRole(formRoles("clo_attainment_summary"));
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
