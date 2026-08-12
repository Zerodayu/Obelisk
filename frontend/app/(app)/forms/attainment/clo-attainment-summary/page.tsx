import {
  AttainmentFloorBars,
  CloAttainmentBars,
  ScoreBandBars,
} from "@/components/charts/attainment-charts";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

export default function CloAttainmentSummaryPage() {
  return (
    <FormPlaceholder
      title="CLO Attainment Summary (Full Term)"
      code="clo_attainment_summary"
      pdcaStage="CHECK"
      description="Full-term CLO attainment computed by cohort. Chart inputs mirror the backend schema; sample data until the rollup endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Composite CLO attainment</FrameTitle>
            <FrameDescription>
              Direct × 70% + Indirect × 30%. The ≥70% floor is enforced
              server-side.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <CloAttainmentBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>CLO status vs the ≥70% floor</FrameTitle>
            <FrameDescription>
              Server-flagged CLOs below threshold render red (NOT MET).
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <AttainmentFloorBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full sm:col-span-2">
          <FrameHeader>
            <FrameTitle>Score distribution</FrameTitle>
            <FrameDescription>
              Students across the 4-tier rubric bands.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <ScoreBandBars />
            </div>
          </FramePanel>
        </Frame>
      </div>
    </FormPlaceholder>
  );
}
