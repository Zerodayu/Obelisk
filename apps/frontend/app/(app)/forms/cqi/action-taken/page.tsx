import { ActionTakenForm } from "@/components/forms/action-taken-form";
import { FormPlaceholder } from "@/components/forms/form-placeholder";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function ActionTakenPage() {
	await requireRole(formRoles("action_taken"));
	return (
		<FormPlaceholder
			title="Action-Taken Record (At-Risk Students)"
			code="action_taken"
			pdcaStage="ACT"
			description="Record the intervention performed for each at-risk student in a class section. The at-risk flag is cleared only when this form completes its approval chain."
		>
			<ActionTakenForm />
		</FormPlaceholder>
	);
}
