import { CtlForm } from "@/components/forms/ctl-form";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function ClosingTheLoopPage() {
	await requireRole(formRoles("closing_the_loop"));
	return (
		<FormPlaceholder
			title="Closing the Loop"
			code="closing_the_loop"
			pdcaStage="ACT"
			description="Evaluate whether CQI interventions closed the attainment gap. Loop status is computed from 5 conditions."
			details="Approvers verify that loop status is computed from the 5 conditions and that OPEN loops have a re-assessment plan."
		>
			<CtlForm />
		</FormPlaceholder>
	);
}
