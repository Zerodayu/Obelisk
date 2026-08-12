import { CurriculumCoverageBars } from "@/components/charts/plan-charts";
import { CurriculumCoverageGrid } from "@/components/forms/curriculum-coverage-grid";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

export default function CurriculumMapPage() {
  return (
    <FormPlaceholder
      title="CLO-PLO Curriculum Map"
      code="curriculum_map"
      pdcaStage="PLAN"
      description="Dynamic CLO-PLO matrix with computed Coverage Check. Chart inputs mirror the backend schema; sample data until the curriculum endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-1">
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>CLO coverage per PLO</FrameTitle>
            <FrameDescription>
              Mapped CLOs per PLO — ≥1 mapped passes the Coverage Check.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-80">
              <CurriculumCoverageBars />
            </div>
          </FramePanel>
        </Frame>
      </div>
      <CurriculumCoverageGrid />
    </FormPlaceholder>
  );
}
