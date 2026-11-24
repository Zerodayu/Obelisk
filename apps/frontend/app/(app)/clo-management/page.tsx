import { CloManagementPanel } from "@/components/outcomes/clo-management-panel";

/**
 * `/clo-management` — Course Learning Outcome management for capture roles
 * (faculty / program_chair / system_admin). CLOs auto-created from a
 * class-record upload carry a "(no description)" placeholder; faculty add the
 * real statement here.
 */
export default function CloManagementPage() {
	return (
		<div className="space-y-6 px-4 lg:px-6">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">CLO Management</h2>
				<p className="text-muted-foreground text-sm">
					Manage Course Learning Outcomes for your program's courses. CLOs
					created from a class-record upload start with no description — add one
					here.
				</p>
			</div>
			<CloManagementPanel />
		</div>
	);
}
