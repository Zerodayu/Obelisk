"use client";

import type { Atom, WritableAtom } from "jotai";
import { useAtomValue, useSetAtom } from "jotai";
import { ArrowRightIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formPathByCode } from "@/config/navigation";
import { roleLabel, type UserRole } from "@/lib/roles";
import type { AsyncState } from "@/lib/store/async-atom";
import {
  FORM_STATUS_LABELS,
  FORM_STATUS_TONES,
  type FormSubmissionRecord,
  mySubmissionsDataAtom,
  mySubmissionsStateAtom,
  pendingApprovalsDataAtom,
  pendingApprovalsStateAtom,
  refreshMySubmissionsAtom,
  refreshPendingApprovalsAtom,
} from "@/lib/store/atoms/forms";

interface InboxAtoms {
  data: Atom<FormSubmissionRecord[]>;
  state: Atom<AsyncState<FormSubmissionRecord[]>>;
  refresh: WritableAtom<null, [], void>;
}

const INBOX_ATOMS: Record<"mine" | "pending", InboxAtoms> = {
  mine: {
    data: mySubmissionsDataAtom,
    state: mySubmissionsStateAtom,
    refresh: refreshMySubmissionsAtom,
  },
  pending: {
    data: pendingApprovalsDataAtom,
    state: pendingApprovalsStateAtom,
    refresh: refreshPendingApprovalsAtom,
  },
};

/**
 * Submission inbox table shared by `/submissions` (own records) and
 * `/approvals` (records waiting on the caller's role). Data comes from the
 * scoped atoms — the backend resolves the scope from the session.
 */
export function SubmissionInbox({ scope }: { scope: "mine" | "pending" }) {
  const atoms = INBOX_ATOMS[scope];
  const submissions = useAtomValue(atoms.data);
  const state = useAtomValue(atoms.state);
  const refresh = useSetAtom(atoms.refresh);

  const emptyCopy =
    scope === "mine"
      ? "You haven't submitted any forms yet."
      : "Nothing is waiting on your role right now.";

  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {scope === "mine"
            ? "Every form you have submitted, with its live approval status."
            : "Submitted forms waiting for your decision."}
        </p>
        <Button
          disabled={state.status === "loading"}
          onClick={() => refresh()}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCwIcon />
          Refresh
        </Button>
      </div>

      {state.status === "loading" && submissions.length === 0 ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading submissions…
        </div>
      ) : state.status === "error" ? (
        <div className="mt-6 space-y-2">
          <p className="text-sm text-destructive">
            Could not load submissions. Please try again.
          </p>
          <Button
            onClick={() => refresh()}
            size="sm"
            type="button"
            variant="outline"
          >
            Retry
          </Button>
        </div>
      ) : submissions.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{emptyCopy}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {submissions.map((submission) => {
            const code = submission.formType?.code;
            const path = code ? formPathByCode[code] : undefined;
            return (
              <li
                className="flex flex-wrap items-center gap-3 py-3"
                key={submission.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {submission.formType?.name ?? "Form submission"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {code ? <span className="font-mono">{code}</span> : null}
                    {code ? " · " : null}
                    Updated {new Date(submission.updatedAt).toLocaleString()}
                    {scope === "pending" && submission.submittedBy
                      ? ` · from ${submission.submittedBy.name}`
                      : null}
                  </p>
                </div>

                <Badge variant={FORM_STATUS_TONES[submission.status]}>
                  {FORM_STATUS_LABELS[submission.status]}
                </Badge>

                {scope === "pending" && submission.currentApproverRole ? (
                  <Badge variant="outline">
                    {roleLabel(submission.currentApproverRole as UserRole)}
                  </Badge>
                ) : null}

                {path ? (
                  <Link
                    className="inline-flex h-7 items-center gap-1.5 rounded-2xl px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    href={path}
                  >
                    Open <ArrowRightIcon className="size-3.5" />
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
