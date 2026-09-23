"use client";

import { useAtomValue, useSetAtom } from "jotai";
import {
  ArchiveIcon,
  CheckIcon,
  CornerUpLeftIcon,
  SendIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/reui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { roleLabel, type UserRole } from "@/lib/roles";
import {
  type ApprovalStepRecord,
  FORM_STATUS_LABELS,
  FORM_STATUS_TONES,
  type FormSubmissionRecord,
  refreshFormSubmissionsAtom,
  refreshMySubmissionsAtom,
  refreshPendingApprovalsAtom,
} from "@/lib/store/atoms/forms";
import { userAtom } from "@/lib/store/atoms/user";
import {
  type ApproverRoleValue,
  approveFormAction,
  archiveFormAction,
  returnFormAction,
  submitFormAction,
  type WorkflowActionResult,
} from "@/server/actions/forms";

/**
 * Roles that may archive an approved submission — mirrors
 * `ARCHIVE_ROLES` in `backend/lib/forms/approval-routes.ts`
 * (aqau/vpaa/system_admin; note `dean` may open `/archives` but not archive
 * submissions).
 */
const SUBMISSION_ARCHIVE_ROLES: readonly UserRole[] = [
  "aqau",
  "vpaa",
  "system_admin",
];

const DECISION_LABELS: Record<ApprovalStepRecord["decision"], string> = {
  pending: "Pending",
  approved: "Approved",
  returned: "Returned",
};

const DECISION_TONES: Record<
  ApprovalStepRecord["decision"],
  "secondary" | "success" | "warning"
> = {
  pending: "secondary",
  approved: "success",
  returned: "warning",
};

type BusyAction = "submit" | "approve" | "return" | "archive" | null;

/**
 * Shared approval-workflow bar for every form screen: status badge, ordered
 * approval stepper (role, decision, comment, decided-at), and the
 * Submit / Approve / Return (with required comment) / Archive actions.
 *
 * Pass the screen's `submissionId` (from its payload) — `null` renders the
 * "no submission record yet" placeholder. After any action it refetches the
 * submission, refreshes both inbox atoms + the dashboard donut, and notifies
 * the host via `onChanged` so the screen can reload its payload.
 */
export function FormWorkflow({
  submissionId,
  onChanged,
}: {
  submissionId: string | null | undefined;
  onChanged?: () => void;
}) {
  const user = useAtomValue(userAtom);
  const refreshMine = useSetAtom(refreshMySubmissionsAtom);
  const refreshPending = useSetAtom(refreshPendingApprovalsAtom);
  const refreshAll = useSetAtom(refreshFormSubmissionsAtom);

  const [submission, setSubmission] = useState<FormSubmissionRecord | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnComment, setReturnComment] = useState("");

  const load = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    try {
      setSubmission(
        await api.get<FormSubmissionRecord>(`/forms/${submissionId}`),
      );
    } catch {
      // The host screen surfaces its own load errors; a missing submission
      // just means the workflow strip stays in its empty state.
      setSubmission(null);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(
    action: Exclude<BusyAction, null>,
    scope: string,
    successTitle: string,
    fn: () => Promise<WorkflowActionResult>,
  ) {
    setBusy(action);
    const result = await fn();
    if (!result.ok) {
      toastError({
        title: "Workflow action failed",
        description: result.error,
        status: result.status,
        scope,
      });
    } else {
      toast.success({ title: successTitle });
      await load();
      refreshMine();
      refreshPending();
      refreshAll();
      onChanged?.();
    }
    setBusy(null);
  }

  if (!submissionId) {
    return (
      <section className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        Approval workflow activates once this form has a submission record.
      </section>
    );
  }

  if (loading && !submission) {
    return (
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading approval status…
        </div>
      </section>
    );
  }

  if (!submission) return null;

  const status = submission.status;
  const steps = submission.approvalSteps ?? [];
  const pendingStep = steps.find((step) => step.decision === "pending");
  const isOwner = user?.id != null && submission.submittedByUserId === user.id;
  const isAdmin = user?.role === "system_admin";

  const canSubmit =
    (status === "draft" || status === "returned") &&
    user != null &&
    (isOwner || isAdmin);
  const canDecide =
    status === "submitted" &&
    pendingStep != null &&
    user != null &&
    (user.role === pendingStep.approverRole || isAdmin);
  const canArchive =
    status === "approved" &&
    user != null &&
    SUBMISSION_ARCHIVE_ROLES.includes(user.role);

  const submitterLine =
    submission.submittedBy && submission.submittedBy.id !== user?.id
      ? `Submitted by ${submission.submittedBy.name}`
      : null;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Approval workflow</span>
          <Badge variant={FORM_STATUS_TONES[status]}>
            {FORM_STATUS_LABELS[status]}
          </Badge>
          {status === "submitted" && pendingStep ? (
            <Badge variant="outline">
              Waiting on {roleLabel(pendingStep.approverRole as UserRole)}
            </Badge>
          ) : null}
          {submitterLine ? (
            <span className="text-xs text-muted-foreground">
              {submitterLine}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canSubmit ? (
            <Button
              disabled={busy != null}
              onClick={() =>
                void run(
                  "submit",
                  "form-workflow:submit",
                  "Submitted for approval",
                  () => submitFormAction(submission.id),
                )
              }
              type="button"
            >
              {busy === "submit" ? (
                <Spinner className="size-3.5" />
              ) : (
                <SendIcon />
              )}
              Submit for approval
            </Button>
          ) : null}

          {canDecide && pendingStep ? (
            <>
              <Button
                disabled={busy != null}
                onClick={() =>
                  void run(
                    "approve",
                    "form-workflow:approve",
                    "Step approved",
                    () =>
                      approveFormAction(
                        submission.id,
                        pendingStep.approverRole as ApproverRoleValue,
                      ),
                  )
                }
                type="button"
              >
                {busy === "approve" ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <CheckIcon />
                )}
                Approve
              </Button>

              <Dialog
                onOpenChange={(details) => setReturnOpen(details.open)}
                open={returnOpen}
              >
                <Button
                  disabled={busy != null}
                  onClick={() => {
                    setReturnComment("");
                    setReturnOpen(true);
                  }}
                  type="button"
                  variant="outline"
                >
                  <CornerUpLeftIcon />
                  Return
                </Button>
                <DialogContent>
                  <DialogHeader
                    description="Send the submission back to its owner with a comment. The owner can edit and resubmit."
                    title="Return to preparer"
                  />
                  <Textarea
                    autoFocus
                    onChange={(event) => setReturnComment(event.target.value)}
                    placeholder="What needs to be corrected?"
                    value={returnComment}
                  />
                  <DialogFooter>
                    <Button
                      disabled={returnComment.trim().length === 0}
                      onClick={() =>
                        void run(
                          "return",
                          "form-workflow:return",
                          "Returned to preparer",
                          () =>
                            returnFormAction(
                              submission.id,
                              pendingStep.approverRole as ApproverRoleValue,
                              returnComment.trim(),
                            ).then((result) => {
                              if (result.ok) setReturnOpen(false);
                              return result;
                            }),
                        )
                      }
                      type="button"
                    >
                      {busy === "return" ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        <CornerUpLeftIcon />
                      )}
                      Return with comment
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          ) : null}

          {canArchive ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={busy != null} type="button" variant="outline">
                  <ArchiveIcon />
                  Archive
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive this submission?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Archiving is permanent — an archived submission can no
                    longer be edited or reactivated.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogClose asChild>
                    <AlertDialogAction
                      onClick={() =>
                        void run(
                          "archive",
                          "form-workflow:archive",
                          "Submission archived",
                          () => archiveFormAction(submission.id),
                        )
                      }
                      variant="destructive"
                    >
                      <ArchiveIcon />
                      Archive
                    </AlertDialogAction>
                  </AlertDialogClose>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>

      {steps.length > 0 ? (
        <ol className="flex flex-wrap gap-2">
          {steps.map((step) => (
            <li
              className="min-w-40 flex-1 rounded-lg border bg-muted/30 px-3 py-2"
              key={step.id}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">
                  {step.sequenceNo}. {roleLabel(step.approverRole as UserRole)}
                </span>
                <Badge radius="full" variant={DECISION_TONES[step.decision]}>
                  {DECISION_LABELS[step.decision]}
                </Badge>
              </div>
              {step.comment ? (
                <p className="mt-1 text-xs text-muted-foreground italic">
                  “{step.comment}”
                </p>
              ) : null}
              {step.decidedAt ? (
                <p className="mt-0.5 text-[0.65rem] text-muted-foreground">
                  {new Date(step.decidedAt).toLocaleString()}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : status === "draft" || status === "returned" ? (
        <p className="text-xs text-muted-foreground">
          No approval steps yet — the chain is created from this form's
          registered route when you submit.
        </p>
      ) : null}
    </section>
  );
}
