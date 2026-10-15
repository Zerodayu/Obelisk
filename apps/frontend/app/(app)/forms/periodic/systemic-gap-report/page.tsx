import { FormPlaceholder } from "@/components/forms/form-placeholder";
import SystemicGapReportForm from "@/components/forms/systemic-gap-report-form";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function SystemicGapReportPage() {
	await requireRole(formRoles("systemic_gap_report"));
	return (
		<FormPlaceholder
			title="Systemic Gap Report"
			code="systemic_gap_report"
			pdcaStage="ACT"
			description="Three consecutive cycles below the ≥70% benchmark for a PLO–cohort combination, with the accredited root cause and recommended structural response."
			details="Filed by the Dean and decided by the VPAA. Submission is gated server-side on a Cohort Tracking Sheet showing 3+ consecutive NOT-MET cycles."
		>
			<SystemicGapReportForm />
		</FormPlaceholder>
	);
}
