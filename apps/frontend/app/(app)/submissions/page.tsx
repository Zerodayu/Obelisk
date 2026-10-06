import { SubmissionInbox } from "@/components/inbox/submission-inbox";
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
    <div className="px-4 lg:px-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">My Submissions</h2>
        <p className="text-sm text-muted-foreground">
          Forms you have prepared or submitted, from draft through approval.
        </p>
      </div>
      <SubmissionInbox devPreview={isDevMode} scope="mine" />
    </div>
  );
}
