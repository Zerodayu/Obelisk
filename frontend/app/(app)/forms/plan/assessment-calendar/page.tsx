import { ChartCard } from "@/components/charts/chart-card";
import { ScheduleLoadBars } from "@/components/charts/plan-charts";
import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function AssessmentCalendarPage() {
  return (
    <FormPlaceholder
      title="Assessment Calendar"
      code="assessment_calendar"
      pdcaStage="PLAN"
      description="Pre-seeded template rows; editable dates, non-deletable. Chart inputs mirror the backend schema; sample data until the calendar endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-1">
        <ChartCard
          title="Assessment load by month"
          description="Direct vs indirect assessment items scheduled per month."
          className="h-80"
        >
          <ScheduleLoadBars />
        </ChartCard>
      </div>
    </FormPlaceholder>
  );
}
