/**
 * Form-submission atoms — the first DB-backed dataset wired through the store.
 *
 * `formSubmissionsDataAtom` fetches `GET /forms` from the browser on first
 * subscription and refetches when a filter atom changes or `refreshAtom` runs.
 * `formStatusCountsAtom` derives the submission-status distribution for the
 * status donut: it falls back to the sample `MOCK_FORM_STATUSES` only while
 * loading/error, and reports real counts (including empty) once loaded.
 */

import { atom } from "jotai";

import {
  type FormStatusDatum,
  MOCK_FORM_STATUSES,
} from "@/components/charts/obe-sample-data";
import { api } from "@/lib/api-client";
import { atomWithAsyncData } from "@/lib/store/async-atom";

export type FormSubmissionStatus =
  | "draft"
  | "submitted"
  | "returned"
  | "approved"
  | "archived";

export interface ApprovalStepRecord {
  id: string;
  formSubmissionId: string;
  approverRole: string;
  sequenceNo: number;
  decision: "pending" | "approved" | "returned";
  approverUserId: string | null;
  comment: string | null;
  decidedAt: string | null;
}

/** Mirrors the backend `FormSubmission` JSON contract. */
export interface FormSubmissionRecord {
  id: string;
  formTypeId: string;
  classSectionId: string | null;
  programId: string | null;
  termId: string;
  submittedByUserId: string | null;
  status: FormSubmissionStatus;
  currentApproverRole: string | null;
  formData: unknown;
  createdAt: string;
  updatedAt: string;
  approvalSteps?: ApprovalStepRecord[];
}

/** Filters that shape the `GET /forms` query. `null` = no filter. */
export const formTypeIdFilterAtom = atom<string | null>(null);
export const formStatusFilterAtom = atom<FormSubmissionStatus | null>(null);
export const classSectionIdFilterAtom = atom<string | null>(null);

const SUBMISSION_STATUSES: FormSubmissionStatus[] = [
  "draft",
  "submitted",
  "returned",
  "approved",
  "archived",
];

export const {
  dataAtom: formSubmissionsDataAtom,
  stateAtom: formSubmissionsStateAtom,
  refreshAtom: refreshFormSubmissionsAtom,
} = atomWithAsyncData<FormSubmissionRecord[]>([], (get, signal) => {
  const query: Record<string, string> = {};
  const formTypeId = get(formTypeIdFilterAtom);
  const status = get(formStatusFilterAtom);
  const classSectionId = get(classSectionIdFilterAtom);
  if (formTypeId) query.formTypeId = formTypeId;
  if (status) query.status = status;
  if (classSectionId) query.classSectionId = classSectionId;
  return api.get<FormSubmissionRecord[]>("/forms", { query, signal });
});

/** Submission-status distribution for the status donut. */
export const formStatusCountsAtom = atom<FormStatusDatum[]>((get) => {
  const state = get(formSubmissionsStateAtom);
  if (state.status !== "ready") return MOCK_FORM_STATUSES;

  const counts = new Map<FormSubmissionStatus, number>();
  for (const submission of state.data) {
    counts.set(submission.status, (counts.get(submission.status) ?? 0) + 1);
  }
  return SUBMISSION_STATUSES.map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  }));
});
