import { FormPlaceholder } from "@/components/forms/form-placeholder";
import MidCycleAttainmentForm from "@/components/forms/mid-cycle-attainment-form";

export default function MidCycleAttainmentPage() {
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
