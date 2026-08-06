import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function ClosingTheLoopPage() {
  return (
    <FormPlaceholder
      title="Closing-the-Loop (CTL) Report"
      code="closing_the_loop"
      pdcaStage="ACT"
      description="Loop status is hard-computed server-side (CLOSED only if all 5 conditions met)."
    />
  );
}
