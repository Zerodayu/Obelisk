import { CqiActionsBars, RootCauseDonut } from "@/components/charts/cqi-charts";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

export default function CqiActionPlanPage() {
  return (
    <FormPlaceholder
      title="CQI Action Plan"
      code="cqi_action_plan"
      pdcaStage="ACT"
      description="Stateful two-phase lifecycle: planned → tracked to completion. Chart inputs mirror the backend schema; sample data until the CQI endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Actions planned vs completed</FrameTitle>
            <FrameDescription>
              CQI action progress per root-cause category.
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
            <FrameTitle>Root-cause focus</FrameTitle>
            <FrameDescription>
              Categories targeted by the action plans.
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
