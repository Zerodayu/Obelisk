import {
  CqiActionsBars,
  LoopStatusDonut,
} from "@/components/charts/cqi-charts";
import {
  ApprovalFlowBars,
  RecommendationDonut,
} from "@/components/charts/governance-charts";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

/**
 * VPAA dashboard — institution-wide academic decisions: CAPA/budget
 * approvals and institutional management reviews. Chart inputs mirror the
 * backend schema; sample data until rollup endpoints land.
 */
export function VpaaDashboard() {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Institutional CQI completion</FrameTitle>
            <FrameDescription>
              Planned vs completed CQI actions across the institution.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <CqiActionsBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Closing-the-loop status</FrameTitle>
            <FrameDescription>
              Loop status is hard-computed server-side; display-only.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <LoopStatusDonut />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>CAPA plan approvals</FrameTitle>
            <FrameDescription>
              Approval-chain decisions on corrective & preventive actions.
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
            <FrameTitle>Institutional management review (D1–D5)</FrameTitle>
            <FrameDescription>
              AI recommendation review status at the institutional level.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <RecommendationDonut />
            </div>
          </FramePanel>
        </Frame>
      </div>
    </section>
  );
}
