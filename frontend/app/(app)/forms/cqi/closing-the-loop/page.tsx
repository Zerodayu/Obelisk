import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { CtlForm } from "@/components/forms/ctl-form";

export default function ClosingTheLoopPage() {
  return (
    <FormPlaceholder
      title="Closing the Loop"
      code="closing_the_loop"
      pdcaStage="ACT"
      description="Evaluate whether CQI interventions closed the attainment gap. Loop status is computed from 5 conditions."
    >
      <CtlForm />
    </FormPlaceholder>
  );
}
