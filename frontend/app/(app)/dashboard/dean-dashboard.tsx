import {
  CohortTrendLines,
  PeoAttainmentBars,
  PloAttainmentBars,
} from "@/components/charts/attainment-charts";
import { ApprovalFlowBars } from "@/components/charts/governance-charts";
import {
  BudgetPhaseDonut,
  BudgetVsActualBars,
} from "@/components/charts/plan-charts";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

/**
 * Dean dashboard — scoped to the dean's department (`user.departmentId`).
 * Endorsements and program-level schedules route through here. Chart inputs
 * mirror the backend schema; sample data until rollup endpoints land.
 */
export function DeanDashboard() {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Program attainment</FrameTitle>
            <FrameDescription>
              PLO attainment across program-reported CARs in the department.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <PloAttainmentBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Program educational objectives</FrameTitle>
            <FrameDescription>
              Biennial PEO attainment vs target.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <PeoAttainmentBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Department cohort trend</FrameTitle>
            <FrameDescription>
              Composite attainment across terms.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <CohortTrendLines />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Approval & endorsement queue</FrameTitle>
            <FrameDescription>
              Forms pending endorsement from departmental program chairs.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <ApprovalFlowBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Assessment budget by PDCA phase</FrameTitle>
            <FrameDescription>
              Approved allocation across the four phases.
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
            <FrameTitle>Budget planned vs spent</FrameTitle>
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
    </section>
  );
}
