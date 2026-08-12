import {
  CohortTrendLines,
  PloAttainmentBars,
} from "@/components/charts/attainment-charts";
import {
  CqiActionsBars,
  GapAnalysisBars,
} from "@/components/charts/cqi-charts";
import { ApprovalFlowBars } from "@/components/charts/governance-charts";
import { CurriculumCoverageBars } from "@/components/charts/plan-charts";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

/**
 * Program Chair dashboard — scoped to the chair's single program
 * (`user.programId`). Targets, approvals, and CQI live here. Chart inputs
 * mirror the backend schema; sample data until the rollup endpoints land.
 */
export function ProgramChairDashboard() {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Program attainment (PLO)</FrameTitle>
            <FrameDescription>
              Attained vs target per PLO. Target is the ≥70% hard floor.
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
            <FrameTitle>Attainment trend by cohort</FrameTitle>
            <FrameDescription>
              Longitudinal composite across terms.
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
            <FrameTitle>Curriculum map coverage</FrameTitle>
            <FrameDescription>
              Number of CLOs mapped to each PLO in the matrix.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <CurriculumCoverageBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Approval queue</FrameTitle>
            <FrameDescription>
              Pending / approved / returned across the chain.
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
            <FrameTitle>PLO gap analysis</FrameTitle>
            <FrameDescription>
              Gap rows for NOT-MET PLO-cohort combinations (root-cause flagged).
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <GapAnalysisBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>CQI action plans</FrameTitle>
            <FrameDescription>
              Planned vs completed actions per root-cause category.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <CqiActionsBars />
            </div>
          </FramePanel>
        </Frame>
      </div>
    </section>
  );
}
