import { FormPlaceholder } from "@/components/forms/form-placeholder";
import ResourceMonitoringForm from "@/components/forms/resource-monitoring-form";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function ResourceMonitoringPage() {
	await requireRole(formRoles("resource_monitoring"));
	return (
		<FormPlaceholder
			title="Resource Acquisition and Implementation Monitoring"
			code="resource_monitoring"
			pdcaStage="DO"
			description="Resource acquisition rows by PDCA phase plus CQI implementation tracking, filed by the Dean/Program Chair and authorized by the VPAA."
			details="Approvers verify that every resource the assessment plan required was acquired (or the shortfall documented) and that the cycle's CQI actions are actually implemented."
		>
			<ResourceMonitoringForm />
		</FormPlaceholder>
	);
}
