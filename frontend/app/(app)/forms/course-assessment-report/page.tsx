import {
  CloAttainmentBars,
  ScoreBandBars,
} from "@/components/charts/attainment-charts";
import { ChartCard } from "@/components/charts/chart-card";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { ACADEMIC_ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";

/** `/forms/course-assessment-report` — the term-level CAR hub (7 parts). */
export default async function CourseAssessmentReportPage() {
  await requireRole(ACADEMIC_ROLES);
  return (
    <FormPlaceholder
      title="Course Assessment Report"
      code="course_assessment_report"
      pdcaStage="DO"
      description="Term-level hub consolidating a term's attainment into 7 parts. Chart inputs mirror the backend schema; sample data until the CAR endpoint lands."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard
          title="CLO attainment"
          description="Direct × 70% + Indirect × 30% composite per CLO."
        >
          <CloAttainmentBars />
        </ChartCard>
        <ChartCard
          title="Score distribution"
          description="Students across the 4-tier rubric bands."
        >
          <ScoreBandBars />
        </ChartCard>
      </div>
    </FormPlaceholder>
  );
}
