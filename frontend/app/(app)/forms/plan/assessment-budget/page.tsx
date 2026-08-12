import {
  BudgetPhaseDonut,
  BudgetVsActualBars,
} from "@/components/charts/plan-charts";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

export default function AssessmentBudgetPage() {
  return (
    <FormPlaceholder
      title="Approved Assessment Budget"
      code="assessment_budget"
      pdcaStage="PLAN"
      description="12 fixed line items grouped by PDCA phase; computed totals. Chart inputs mirror the backend schema; sample data until the budget endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Budget by PDCA phase</FrameTitle>
            <FrameDescription>
              Approved allocation pooled per phase.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <BudgetPhaseDonut />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Planned vs spent</FrameTitle>
            <FrameDescription>
              Line-item budget utilization (PHP thousands).
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <BudgetVsActualBars />
            </div>
          </FramePanel>
        </Frame>
      </div>
    </FormPlaceholder>
  );
}
