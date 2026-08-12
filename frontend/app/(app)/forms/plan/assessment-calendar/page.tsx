import { ScheduleLoadBars } from "@/components/charts/plan-charts";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

export default function AssessmentCalendarPage() {
  return (
    <FormPlaceholder
      title="Assessment Calendar"
      code="assessment_calendar"
      pdcaStage="PLAN"
      description="Pre-seeded template rows; editable dates, non-deletable. Chart inputs mirror the backend schema; sample data until the calendar endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-1">
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Assessment load by month</FrameTitle>
            <FrameDescription>
              Direct vs indirect assessment items scheduled per month.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-80">
              <ScheduleLoadBars />
            </div>
          </FramePanel>
        </Frame>
      </div>
    </FormPlaceholder>
  );
}
