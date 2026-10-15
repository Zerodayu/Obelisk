import CapaPlanForm from "@/components/forms/capa-plan-form";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function CapaPlanPage() {
	await requireRole(formRoles("capa_plan"));
	return (
		<FormPlaceholder
			title="Corrective and Preventive Action (CAPA) Plan"
			code="capa_plan"
			pdcaStage="ACT"
			description="The structural fix for a systemic gap: up to 8 owner-assigned actions with progress reviews, monitored by AQAU and authorized by the VPAA."
			details="Submission is gated server-side until the referenced Systemic Gap Report (F26) is approved."
		>
			<CapaPlanForm />
		</FormPlaceholder>
	);
}
