"use client";

import { useAtomValue } from "jotai";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api-client";
import { roleLabel, type UserRole } from "@/lib/roles";
import {
  FORM_STATUS_LABELS,
  FORM_STATUS_TONES,
  type FormSubmissionRecord,
} from "@/lib/store/atoms/forms";
import { userAtom } from "@/lib/store/atoms/user";

/**
 * Compact approval-status line for form screens: current status, the role the
 * submission is waiting on, and one link into the dedicated approval screen
 * (`/submissions/[id]`) where the workflow actions and evidence panel live.
 *
 * Pass the screen's `submissionId` (from its payload) — `null` renders the
 * "no submission record yet" placeholder. Form screens keep only this link;
 * the stepper and the Submit/Approve/Return/Archive buttons moved to the
 * approval screen.
 */
export function SubmissionStatusCard({
  submissionId,
}: {
  submissionId: string | null | undefined;
}) {
  const user = useAtomValue(userAtom);
  const [submission, setSubmission] = useState<FormSubmissionRecord | null>(
    null,
  );
  // NOTE: start "loading" for an id so SSR/first paint shows the spinner
  // instead of rendering nothing until the effect fires.
  const [loading, setLoading] = useState(Boolean(submissionId));

  const load = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    try {
      setSubmission(
        await api.get<FormSubmissionRecord>(`/forms/${submissionId}`),
      );
    } catch {
      // A missing/invisible submission leaves the card in its empty state —
      // the form screen already carries its own load errors.
      setSubmission(null);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    void load();
  }, [load]);

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
  const pendingStep = (submission.approvalSteps ?? []).find(
    (step) => step.decision === "pending",
  );
  const submitterLine =
    submission.submittedBy && submission.submittedBy.id !== user?.id
      ? `Submitted by ${submission.submittedBy.name}`
      : null;

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Approval</span>
        <Badge variant={FORM_STATUS_TONES[status]}>
          {FORM_STATUS_LABELS[status]}
        </Badge>
        {status === "submitted" && pendingStep ? (
          <Badge variant="outline">
            Waiting on {roleLabel(pendingStep.approverRole as UserRole)}
          </Badge>
        ) : null}
        {submitterLine ? (
          <span className="text-xs text-muted-foreground">{submitterLine}</span>
        ) : null}
      </div>

      <Button asChild size="sm" variant="ghost">
        <Link href={`/submissions/${submission.id}`}>
          Open approval screen <ArrowRightIcon />
        </Link>
      </Button>
    </section>
  );
}
