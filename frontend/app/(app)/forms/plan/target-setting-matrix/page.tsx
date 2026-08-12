import { TargetSettingBars } from "@/components/charts/plan-charts";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

export default function TargetSettingMatrixPage() {
  return (
    <FormPlaceholder
      title="Target-Setting Matrix"
      code="target_setting_matrix"
      pdcaStage="PLAN"
      description="Per-year targets with a ≥70% hard floor and rationale. Chart inputs mirror the backend schema; sample data until the targets endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-1">
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Target vs current attainment</FrameTitle>
            <FrameDescription>
              Planned target floor per cohort vs the latest computed attainment.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-80">
              <TargetSettingBars />
            </div>
          </FramePanel>
        </Frame>
      </div>
    </FormPlaceholder>
  );
}
