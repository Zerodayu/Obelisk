import {
  GapAnalysisBars,
  RootCauseDonut,
} from "@/components/charts/cqi-charts";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

export default function PloGapAnalysisPage() {
  return (
    <FormPlaceholder
      title="PLO Attainment Report with Gap Analysis"
      code="plo_gap_analysis"
      pdcaStage="ACT"
      description="Gap row per NOT-MET PLO-cohort combo with root-cause categories. Chart inputs mirror the backend schema; sample data until the rollup endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Attained vs target</FrameTitle>
            <FrameDescription>
              Positive gap = below the ≥70% target.
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
            <FrameTitle>Root-cause distribution</FrameTitle>
            <FrameDescription>
              Fixed 6-category root-cause analysis across NOT-MET rows.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <RootCauseDonut />
            </div>
          </FramePanel>
        </Frame>
      </div>
    </FormPlaceholder>
  );
}
