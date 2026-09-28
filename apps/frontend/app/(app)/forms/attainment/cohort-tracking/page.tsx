import { CohortTrackingForm } from "@/components/forms/cohort-tracking-form";
import { CohortTrackingGrid } from "@/components/forms/cohort-tracking-grid";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function CohortTrackingPage() {
  await requireRole(formRoles("cohort_tracking"));
  return (
    <FormPlaceholder
      title="Cohort Tracking"
      code="cohort_tracking"
      pdcaStage="CHECK"
      description="Longitudinal CLO/PLO attainment across year-level cohorts. Track trends, add CQI follow-up annotations, and monitor which cohorts triggered CQI."
    >
      <div className="space-y-6">
        <CohortTrackingForm />
        <CohortTrackingGrid />
      </div>
    </FormPlaceholder>
  );
}
