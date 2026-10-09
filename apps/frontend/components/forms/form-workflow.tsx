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
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { ARCHIVE_ROLES, FORM_ACCESS } from "@/lib/role-access";
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
 * Page-layout signature text for one approval step, in the manual's footer
 * wording ("Approved by <Printed Name> · <role>"). A pending step names who
 * is expected to sign instead; `approver` is null until the step is decided.
 */
function signatureLine(step: ApprovalStepRecord): string {
  const role = roleLabel(step.approverRole as UserRole);
  if (step.decision === "pending") {
    return `${step.sequenceNo}. Awaiting ${role}`;
  }
  const verb = step.decision === "approved" ? "Approved" : "Returned";
  return step.approver?.name
    ? `${step.sequenceNo}. ${verb} by ${step.approver.name} · ${role}`
    : `${step.sequenceNo}. ${verb} by ${role}`;
}

/**
 * Shared approval workflow: status badge, PDCA stage, step progress, the
 * standard-header metadata block (retention / deadline / responsible party),
 * and the ordered approval list rendered as the manual's signature block —
 * "Prepared by …" then "Approved by <Printed Name> · <role>" per step, plus
 * the Submit / Approve / Return (with required comment) / Archive actions.
 *
 * Pass the screen's `submissionId` (from its payload) — `null` renders the
 * "no submission record yet" placeholder. After any action it refetches the
 * submission, refreshes both inbox atoms + the dashboard donut, and notifies
 * the host via `onChanged` so the screen can reload its payload.
 *
 * `layout="bar"` (default) is the compact strip embedded in form screens and
 * keeps the original role/decision chips; `layout="page"` is the full-size
 * card used by the dedicated approval screen (`/submissions/[id]`) and is the
 * only layout that renders the signature block, metadata, or route preview.
 */
export function FormWorkflow({
  submissionId,
  onChanged,
  layout = "bar",
}: {
  submissionId: string | null | undefined;
  onChanged?: () => void;
  layout?: "bar" | "page";
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
      // Host screen surfaces its own load errors; a missing submission just
      // leaves the workflow strip in its empty state.
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

  const isPage = layout === "page";
  const status = submission.status;
  const steps = submission.approvalSteps ?? [];
  const pendingStep = steps.find((step) => step.decision === "pending");
  const isOwner = user?.id != null && submission.submittedByUserId === user.id;
  const isAdmin = user?.role === "system_admin";

  const label = (role: string) => roleLabel(role as UserRole);

  const formMeta = submission.formMeta ?? null;
  // Route preview: `ApprovalStep` rows are only materialized on submit, so a
  // draft/returned submission derives the route from the mirrored registry.
  const previewChain: readonly UserRole[] =
    isPage &&
    steps.length === 0 &&
    (status === "draft" || status === "returned")
      ? (FORM_ACCESS[submission.formType?.code ?? ""]?.chain ?? [])
      : [];

  const responsiblePartyLine = formMeta
    ? [
        ...formMeta.responsibleParty.preparers.map(label),
        ...formMeta.responsibleParty.chain.map(label),
      ].join(" → ")
    : null;

  const totalSteps = steps.length > 0 ? steps.length : previewChain.length;
  const signedSteps = steps.filter(
    (step) => step.decision !== "pending",
  ).length;
  const progressLabel =
    totalSteps === 0
      ? ""
      : status === "approved"
        ? `All ${totalSteps} approved`
        : `Step ${Math.min(signedSteps + 1, totalSteps)} of ${totalSteps}`;

  // The signature block's "Prepared by … — date" row: the audit-trail submit
  // time, falling back to the draft's creation date (never submitted).
  const preparedAt = submission.submittedAt ?? submission.createdAt;

  const metaItems: { label: string; value: string; wide?: boolean }[] = isPage
    ? [
        { label: "PDCA phase", value: submission.formType?.pdcaStage ?? "" },
        { label: "Retention", value: formMeta?.retention ?? "" },
        ...(formMeta?.deadline
          ? [{ label: "Deadline", value: formMeta.deadline }]
          : []),
        ...(responsiblePartyLine
          ? [
              {
                label: "Responsible party",
                value: responsiblePartyLine,
                wide: true,
              },
            ]
          : []),
      ].filter((item) => item.value.length > 0)
    : [];

  // The manual's footer opens with "Prepared by … — Date"; rendered once as
  // the first row of the page-layout signature list.
  const preparedRow =
    isPage && submission.submittedBy ? (
      <li className="flex gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3">
        <span
          aria-hidden
          className="mt-2 size-2 shrink-0 rounded-full bg-muted-foreground/50"
        />
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium">
            Prepared by {submission.submittedBy.name} ·{" "}
            {label(submission.submittedBy.role)}
          </span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {new Date(preparedAt).toLocaleString()}
          </p>
        </div>
      </li>
    ) : null;

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
    status === "approved" && user != null && ARCHIVE_ROLES.includes(user.role);

  const submitterLine =
    !isPage && submission.submittedBy && submission.submittedBy.id !== user?.id
      ? `Submitted by ${submission.submittedBy.name}`
      : null;

  return (
    <section
      className={
        isPage
          ? "space-y-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6"
          : "space-y-3 rounded-xl border bg-card p-4 shadow-sm"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              isPage ? "text-base font-semibold" : "text-sm font-semibold"
            }
          >
            Approval workflow
          </span>
          <Badge variant={FORM_STATUS_TONES[status]}>
            {FORM_STATUS_LABELS[status]}
          </Badge>
          {isPage && submission.formType?.pdcaStage ? (
            <Badge radius="full" variant="outline">
              {submission.formType.pdcaStage}
            </Badge>
          ) : null}
          {isPage && progressLabel ? (
            <Badge radius="full" variant="secondary">
              {progressLabel}
            </Badge>
          ) : null}
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
                <DialogContent className="">
                  <DialogHeader
                    description="Send the submission back to its owner with a comment. The owner can edit and resubmit."
                    title="Return to preparer"
                  />
                  <DialogBody className="my-2">
                    <Textarea
                      autoFocus
                      onChange={(event) => setReturnComment(event.target.value)}
                      placeholder="What needs to be corrected?"
                      value={returnComment}
                      className="inline-flex"
                    />
                  </DialogBody>
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

      {metaItems.length > 0 ? (
        <dl className="grid gap-x-6 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3 sm:grid-cols-3">
          {metaItems.map((item) => (
            <div
              className={item.wide ? "sm:col-span-3" : undefined}
              key={item.label}
            >
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {item.label}
              </dt>
              <dd className="text-sm break-words">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {steps.length > 0 ? (
        <ol className={isPage ? "space-y-3" : "flex flex-wrap gap-2"}>
          {preparedRow}
          {steps.map((step) => (
            <li
              className={
                isPage
                  ? "flex gap-3 rounded-lg border bg-muted/30 px-4 py-3"
                  : "min-w-40 flex-1 rounded-lg border bg-muted/30 px-3 py-2"
              }
              key={step.id}
            >
              {isPage ? (
                <span
                  aria-hidden
                  className="mt-2 size-2 shrink-0 rounded-full bg-primary/60"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={
                      isPage ? "text-sm font-medium" : "text-xs font-medium"
                    }
                  >
                    {isPage ? signatureLine(step) : null}
                    {!isPage ? (
                      <>
                        {step.sequenceNo}. {label(step.approverRole)}
                      </>
                    ) : null}
                  </span>
                  <Badge radius="full" variant={DECISION_TONES[step.decision]}>
                    {DECISION_LABELS[step.decision]}
                  </Badge>
                </div>
                {step.comment ? (
                  <p
                    className={
                      isPage
                        ? "mt-1.5 text-sm text-muted-foreground italic"
                        : "mt-1 text-xs text-muted-foreground italic"
                    }
                  >
                    “{step.comment}”
                  </p>
                ) : null}
                {step.decidedAt ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(step.decidedAt).toLocaleString()}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : previewChain.length > 0 ? (
        <div className="space-y-3">
          <ol className="space-y-3">
            {preparedRow}
            {previewChain.map((role, index) => (
              <li
                className="flex gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3"
                key={role}
              >
                <span
                  aria-hidden
                  className="mt-2 size-2 shrink-0 rounded-full bg-muted-foreground/40"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      {index + 1}. Awaiting {label(role)}
                    </span>
                    <Badge radius="full" variant="secondary">
                      Pending
                    </Badge>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            Route preview — the chain is materialized when you submit.
          </p>
        </div>
      ) : status === "draft" || status === "returned" ? (
        <p className="text-xs text-muted-foreground">
          No approval steps yet — the chain is created from this form's
          registered route when you submit.
        </p>
      ) : null}
    </section>
  );
}
