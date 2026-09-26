import ExhibitionFeedbackForm from "@/components/forms/exhibition-feedback-form";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function ExhibitionFeedbackPage() {
  await requireRole(formRoles("exhibition_feedback"));
  return (
    <FormPlaceholder
      title="Portfolio Exhibition Industry Feedback"
      code="exhibition_feedback"
      pdcaStage="CHECK"
      description="Industry guest feedback with per-PLO ratings (min 3 guests required)."
    >
      <ExhibitionFeedbackForm />
    </FormPlaceholder>
  );
}
