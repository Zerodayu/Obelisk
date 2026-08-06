import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function CqiActionPlanPage() {
  return (
    <FormPlaceholder
      title="CQI Action Plan"
      code="cqi_action_plan"
      pdcaStage="ACT"
      description="Stateful two-phase lifecycle: planned → tracked to completion."
    />
  );
}
