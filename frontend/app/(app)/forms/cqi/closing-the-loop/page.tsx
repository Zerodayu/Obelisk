import { ChartCard } from "@/components/charts/chart-card";
import { LoopStatusDonut } from "@/components/charts/cqi-charts";
import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function ClosingTheLoopPage() {
  return (
    <FormPlaceholder
      title="Closing-the-Loop (CTL) Report"
      code="closing_the_loop"
      pdcaStage="ACT"
      description="Loop status is hard-computed server-side (CLOSED only if all 5 conditions met). Chart inputs mirror the backend schema; sample data until the CTL endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-1">
        <ChartCard
          title="Loop status breakdown"
          description="CLOSED vs OPEN — Re-assess vs OPEN — Not Implemented."
          className="h-80"
        >
          <LoopStatusDonut />
        </ChartCard>
      </div>
    </FormPlaceholder>
  );
}
