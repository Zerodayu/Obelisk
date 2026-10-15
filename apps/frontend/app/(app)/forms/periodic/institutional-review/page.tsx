import { FormPlaceholder } from "@/components/forms/form-placeholder";
import InstitutionalReviewForm from "@/components/forms/institutional-review-form";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function InstitutionalReviewPage() {
	await requireRole(formRoles("institutional_review"));
	return (
		<FormPlaceholder
			title="Institutional Management Review Records"
			code="institutional_review"
			pdcaStage="ACT"
			description="The annual institution-level review: per-program APAR/CTL/systemic-gap compliance, institutional CQI completion, and the decisions forwarded to the President."
			details="Compiled by AQAU; the VPAA presides and gives final approval. Program data comes from the program-level submissions, never entered here."
		>
			<InstitutionalReviewForm />
		</FormPlaceholder>
	);
}
