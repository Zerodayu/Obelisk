import { PlusIcon } from "lucide-react";
import Link from "next/link";

import { SubmissionInbox } from "@/components/inbox/submission-inbox";
import { Button } from "@/components/ui/button";
import { isDevMode } from "@/lib/dev-mode";
import { MY_SUBMISSIONS_ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";

/**
 * `/submissions` — "My Submissions": the session user's own form submissions
 * with live approval status. Scoping is resolved server-side from the session
 * (`GET /forms?scope=mine`). Gated to every role but vpaa, which never
 * prepares submissions — it reads `/all-submissions` instead.
 */
export default async function MySubmissionsPage() {
	await requireRole(MY_SUBMISSIONS_ROLES);
	return (
		<div className="space-y-6 px-4 lg:px-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="text-xl font-semibold tracking-tight">
						My Submissions
					</h2>
					<p className="text-muted-foreground text-sm">
						Forms you have prepared that route through approval, from draft
						through sign-off.
					</p>
				</div>
				<Button asChild>
					<Link href="/forms">
						<PlusIcon />
						New submission
					</Link>
				</Button>
			</div>
			<SubmissionInbox devPreview={isDevMode} scope="mine" />
		</div>
	);
}
