import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { StudentExitSurveyForm } from "@/components/forms/student-exit-survey-form";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function StudentExitSurveyPage() {
  await requireRole(formRoles("student_exit_survey"));
  return (
    <FormPlaceholder
      title="Student Exit Survey Tabulation"
      code="student_exit_survey"
      pdcaStage="CHECK"
      description="Per-PLO year-level rating survey with divergence investigation."
    >
      <StudentExitSurveyForm />
    </FormPlaceholder>
  );
}
