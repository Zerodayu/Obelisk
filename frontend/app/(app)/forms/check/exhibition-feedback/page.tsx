import ExhibitionFeedbackForm from "@/components/forms/exhibition-feedback-form";
import { FormPlaceholder } from "@/components/forms/form-placeholder";

export default function ExhibitionFeedbackPage() {
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
