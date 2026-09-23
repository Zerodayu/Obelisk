import { SubmissionInbox } from "@/components/inbox/submission-inbox";
import { isDevMode } from "@/lib/dev-mode";
import { APPROVER_ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";

/**
 * `/approvals` — "Pending Approvals": submitted forms waiting on the
 * caller's role (`GET /forms?scope=pending`; a system_admin sees every
 * pending step). Gated to approver roles — the backend still enforces the
 * per-step role match on every decision.
 */
export default async function PendingApprovalsPage() {
  await requireRole(APPROVER_ROLES);
  return (
    <div className="px-4 lg:px-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">
          Pending Approvals
        </h2>
        <p className="text-sm text-muted-foreground">
          Forms waiting for your decision. Approve to advance the chain, or
          return with a comment.
        </p>
      </div>
      <SubmissionInbox devPreview={isDevMode} scope="pending" />
    </div>
  );
}
