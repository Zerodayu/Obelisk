import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { StudentExitSurveyForm } from "@/components/forms/student-exit-survey-form";

export default function StudentExitSurveyPage() {
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
