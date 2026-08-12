import { CohortTrendLines } from "@/components/charts/attainment-charts";
import { CohortTrackingGrid } from "@/components/forms/cohort-tracking-grid";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

export default function CohortTrackingPage() {
  return (
    <FormPlaceholder
      title="Cohort CLO/PLO Attainment Tracking"
      code="cohort_tracking"
      pdcaStage="CHECK"
      description="Permanent longitudinal record; strict audit trail. Chart inputs mirror the backend schema; sample data until the cohort endpoint lands."
    >
      <div className="space-y-6">
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Composite attainment by cohort</FrameTitle>
            <FrameDescription>
              Longitudinal CLO/PLO attainment per cohort across terms.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-80">
              <CohortTrendLines />
            </div>
          </FramePanel>
        </Frame>
        <CohortTrackingGrid />
      </div>
    </FormPlaceholder>
  );
}
