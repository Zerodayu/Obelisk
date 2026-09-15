import { FormPlaceholder } from "@/components/forms/form-placeholder";
import PortfolioAssessmentForm from "@/components/forms/portfolio-assessment-form";

export default function PortfolioAssessmentPage() {
  return (
    <FormPlaceholder
      title="Portfolio Assessment Record"
      code="portfolio_assessment_record"
      pdcaStage="CHECK"
      description="Rubric-based portfolio assessment with multi-assessor consensus scoring."
    >
      <PortfolioAssessmentForm />
    </FormPlaceholder>
  );
}
