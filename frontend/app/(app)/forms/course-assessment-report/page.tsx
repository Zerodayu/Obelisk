import {
  CloAttainmentBars,
  ScoreBandBars,
} from "@/components/charts/attainment-charts";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
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
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>CLO attainment</FrameTitle>
            <FrameDescription>
              Direct × 70% + Indirect × 30% composite per CLO.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <CloAttainmentBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Score distribution</FrameTitle>
            <FrameDescription>
              Students across the 4-tier rubric bands.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <ScoreBandBars />
            </div>
          </FramePanel>
        </Frame>
      </div>
    </FormPlaceholder>
  );
}
