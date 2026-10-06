"use client";

import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { FormWorkflow } from "@/components/forms/form-workflow";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { formPathByCode } from "@/config/navigation";
import { api } from "@/lib/api-client";
import { roleLabel, type UserRole } from "@/lib/roles";
import {
  FORM_STATUS_LABELS,
  FORM_STATUS_TONES,
  type FormSubmissionRecord,
} from "@/lib/store/atoms/forms";
import { SubmissionEvidence } from "./submission-evidence";
import { SubmissionJustification } from "./submission-justification";

/**
 * `/submissions/[id]` — the dedicated approval screen, shared by every form
 * code: identity header (form type, PDCA stage, status, waiting-on role), the
 * workflow card (`FormWorkflow` in `layout="page"` — timeline + all actions),
 * the read-only pedagogical justification (Bloom's / I-P-D / assessment
 * evidence), and the read-only evidence panel.
 *
 * `initial` comes from the server page (which already applied the backend
 * visibility gate); `onChanged` re-reads the submission after every workflow
 * action so the header badges stay in sync with the stepper below.
 */
export function SubmissionApprovalScreen({
  submissionId,
  initial,
}: {
  submissionId: string;
  initial: FormSubmissionRecord;
}) {
  const [submission, setSubmission] = useState<FormSubmissionRecord>(initial);

  const load = useCallback(async () => {
    try {
      setSubmission(
        await api.get<FormSubmissionRecord>(`/forms/${submissionId}`),
      );
    } catch {
      // Keep showing the last known state; the workflow card surfaces its own
      // action errors as toasts.
    }
  }, [submissionId]);

  const status = submission.status;
  const formType = submission.formType;
  const pendingStep = (submission.approvalSteps ?? []).find(
    (step) => step.decision === "pending",
  );
  const formPath = formType ? formPathByCode[formType.code] : undefined;

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Link
            className="transition-colors hover:text-foreground"
            href="/submissions"
          >
            Submissions
          </Link>
          <span aria-hidden>/</span>
          <span className="font-mono text-xs">
            {formType?.code ?? submission.id}
          </span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-xl font-semibold tracking-tight">
              {formType?.name ?? "Form submission"}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={FORM_STATUS_TONES[status]}>
                {FORM_STATUS_LABELS[status]}
              </Badge>
              {formType?.pdcaStage ? (
                <Badge variant="outline">PDCA · {formType.pdcaStage}</Badge>
              ) : null}
              {status === "submitted" && pendingStep ? (
                <Badge variant="outline">
                  Waiting on {roleLabel(pendingStep.approverRole as UserRole)}
                </Badge>
              ) : null}
            </div>
          </div>

          {formPath ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={formPath}>
                Open form screen <ArrowUpRightIcon />
              </Link>
            </Button>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground">
          {submission.submittedBy
            ? `Prepared by ${submission.submittedBy.name} · `
            : ""}
          Updated {new Date(submission.updatedAt).toLocaleString()}
        </p>
      </section>

      <FormWorkflow
        layout="page"
        onChanged={() => void load()}
        submissionId={submissionId}
      />

      {/* NOTE: above the evidence card so the approver reads the alignment
          (Bloom's / I-P-D / assessment evidence) before the raw payload. */}
      <SubmissionJustification submissionId={submissionId} />

      <SubmissionEvidence submissionId={submissionId} />
    </div>
  );
}
