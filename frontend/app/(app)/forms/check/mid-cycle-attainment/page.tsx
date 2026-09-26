import { FormPlaceholder } from "@/components/forms/form-placeholder";
import MidCycleAttainmentForm from "@/components/forms/mid-cycle-attainment-form";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function MidCycleAttainmentPage() {
  await requireRole(formRoles("mid_cycle_attainment"));
  return (
    <FormPlaceholder
      title="Mid-Cycle CLO Attainment Summary"
      code="mid_cycle_attainment"
      pdcaStage="CHECK"
      description="Reusable cohort attainment block with per-CLO mid-cycle status and at-risk watchlist."
    >
      <MidCycleAttainmentForm />
    </FormPlaceholder>
  );
}
