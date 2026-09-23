import { SubmissionInbox } from "@/components/inbox/submission-inbox";
import { requireUser } from "@/server/auth";

/**
 * `/submissions` — "My Submissions": the session user's own form submissions
 * with live approval status. Scoping is resolved server-side from the session
 * (`GET /forms?scope=mine`).
 */
export default async function MySubmissionsPage() {
  await requireUser();
  return (
    <div className="px-4 lg:px-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">My Submissions</h2>
        <p className="text-sm text-muted-foreground">
          Forms you have prepared or submitted, from draft through approval.
        </p>
      </div>
      <SubmissionInbox scope="mine" />
    </div>
  );
}
