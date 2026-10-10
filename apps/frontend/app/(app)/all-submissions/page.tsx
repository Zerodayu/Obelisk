import { SubmissionInbox } from "@/components/inbox/submission-inbox";
import { isDevMode } from "@/lib/dev-mode";
import { ARCHIVE_ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";

/**
 * `/all-submissions` — "Submissions": every submission in the institution
 * (`GET /forms?scope=all`, gated to the archive roles), defaulting to the
 * approved forms so the VPAA can archive them straight from the list. This
 * replaces "My Submissions" for the VPAA, which never prepares submissions.
 */
export default async function AllSubmissionsPage() {
	await requireRole(ARCHIVE_ROLES);
	return (
		<div className="space-y-6 px-4 lg:px-6">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">Submissions</h2>
				<p className="text-muted-foreground text-sm">
					Every submission across the institution. Approved forms can be
					archived straight from this list.
				</p>
			</div>
			<SubmissionInbox devPreview={isDevMode} scope="all" />
		</div>
	);
}
