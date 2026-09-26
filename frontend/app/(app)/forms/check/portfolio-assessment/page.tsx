import { FormPlaceholder } from "@/components/forms/form-placeholder";
import PortfolioAssessmentForm from "@/components/forms/portfolio-assessment-form";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function PortfolioAssessmentPage() {
  await requireRole(formRoles("portfolio_assessment_record"));
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
