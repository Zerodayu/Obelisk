import { CqiActionPlanForm } from "@/components/forms/cqi-action-plan-form";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function CqiActionPlanPage() {
  await requireRole(formRoles("cqi_action_plan"));
  return (
    <FormPlaceholder
      title="CQI Action Plan"
      code="cqi_action_plan"
      pdcaStage="ACT"
      description="Create and track intervention entries for NOT-MET PLOs with root causes, owners, and KPIs."
    >
      <CqiActionPlanForm />
    </FormPlaceholder>
  );
}
