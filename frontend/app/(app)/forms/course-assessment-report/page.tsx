import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { requireRole } from "@/server/auth";
import { ACADEMIC_ROLES } from "@/lib/roles";

/** `/forms/course-assessment-report` — the term-level CAR hub (7 parts). */
export default async function CourseAssessmentReportPage() {
  await requireRole(ACADEMIC_ROLES);
  return (
    <FormPlaceholder
      title="Course Assessment Report"
      code="course_assessment_report"
      pdcaStage="DO"
      description="Term-level hub consolidating a term's attainment into 7 parts."
    />
  );
}
