import { LoopStatusDonut } from "@/components/charts/cqi-charts";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

export default function ClosingTheLoopPage() {
  return (
    <FormPlaceholder
      title="Closing-the-Loop (CTL) Report"
      code="closing_the_loop"
      pdcaStage="ACT"
      description="Loop status is hard-computed server-side (CLOSED only if all 5 conditions met). Chart inputs mirror the backend schema; sample data until the CTL endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-1">
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Loop status breakdown</FrameTitle>
            <FrameDescription>
              CLOSED vs OPEN — Re-assess vs OPEN — Not Implemented.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-80">
              <LoopStatusDonut />
            </div>
          </FramePanel>
        </Frame>
      </div>
    </FormPlaceholder>
  );
}
