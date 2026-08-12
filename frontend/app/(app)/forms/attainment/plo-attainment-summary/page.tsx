import { PloAttainmentBars } from "@/components/charts/attainment-charts";
import { RootCauseDonut } from "@/components/charts/cqi-charts";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

export default function PloAttainmentSummaryPage() {
  return (
    <FormPlaceholder
      title="PLO Attainment Summary"
      code="plo_attainment_summary"
      pdcaStage="CHECK"
      description="Aggregates CARs into program-level PLO attainment. Chart inputs mirror the backend schema; sample data until the rollup endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>PLO attainment vs target</FrameTitle>
            <FrameDescription>
              Attained vs the ≥70% target per PLO.
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
            <FrameTitle>Root-cause categories</FrameTitle>
            <FrameDescription>
              Where NOT-MET PLOs flag root causes, per the fixed 6-category set.
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
