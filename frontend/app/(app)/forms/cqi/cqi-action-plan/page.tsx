import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { CqiActionPlanForm } from "@/components/forms/cqi-action-plan-form";

export default function CqiActionPlanPage() {
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
