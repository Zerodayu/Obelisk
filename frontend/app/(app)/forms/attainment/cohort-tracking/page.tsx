import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { CohortTrackingForm } from "@/components/forms/cohort-tracking-form";

export default function CohortTrackingPage() {
  return (
    <FormPlaceholder
      title="Cohort Tracking"
      code="cohort_tracking"
      pdcaStage="CHECK"
      description="Longitudinal CLO/PLO attainment across year-level cohorts. Track trends, add CQI follow-up annotations, and monitor which cohorts triggered CQI."
    >
      <CohortTrackingForm />
    </FormPlaceholder>
  );
}
