import { AssessmentCalendarForm } from "@/components/forms/assessment-calendar-form";
import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function AssessmentCalendarPage() {
  return (
    <FormPlaceholder
      title="Assessment Calendar"
      code="assessment_calendar"
      pdcaStage="PLAN"
      description="Plan assessment activities across the academic year. 17 template events pre-seeded; add program-specific items as needed."
    >
      <AssessmentCalendarForm />
    </FormPlaceholder>
  );
}
