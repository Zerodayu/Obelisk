/**
 * Form-submission atoms — the first DB-backed dataset wired through the store.
 *
 * `formSubmissionsDataAtom` fetches `GET /forms?scope=visible` from the browser
 * on first subscription and refetches when a filter atom changes or
 * `refreshAtom` runs. `scope=visible` is the **chain-entitled** read the
 * backend resolves from the session: the caller's own submissions plus every
 * form whose approval chain contains their role — so faculty sees only its
 * own, a program chair sees what faculty/chair prepared, a dean sees those
 * plus its own, and vpaa/system_admin see everything (institution-wide). The
 * dashboard therefore never shows data a role has no business acting on,
 * and never shows another user's rows just because they share a role.
 * `formStatusCountsAtom` derives the submission-status distribution for the
 * status donut: it holds an empty list while the fetch is pending or failed
 * (the donut renders its empty state) and reports real counts — including
 * zeros — once loaded.
 */

import { atom } from "jotai";

import type { FormStatusDatum } from "@/components/charts/obe-sample-data";
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
	/** Printed name for the signature row. Null until this step is decided. */
	approver?: { id: string; name: string; role: string } | null;
}

/** Form-type identity joined by `GET /forms` / `GET /forms/:id`. */
export interface FormTypeRef {
	code: string;
	name: string;
	pdcaStage: string;
}

/** Submitter identity joined by `GET /forms` / `GET /forms/:id`. */
export interface SubmissionUserRef {
	id: string;
	name: string;
	role: string;
}

/**
 * Standard-header metadata joined by `GET /forms/:id` only
 * (`apps/backend/lib/forms/form-meta.ts`). Role *codes* — `ROLE_LABELS` owns
 * the display labels. `deadline` is absent when the manual states none.
 */
export interface FormMetaRef {
	retention: string;
	responsibleParty: {
		preparers: string[];
		chain: string[];
	};
	deadline?: string;
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
	formType?: FormTypeRef;
	submittedBy?: SubmissionUserRef | null;
	/** Audit-trail submit time; null while the chain has never run (draft). */
	submittedAt?: string | null;
	formMeta?: FormMetaRef | null;
}

/** Display labels + badge tones for each submission status. */
export const FORM_STATUS_LABELS: Record<FormSubmissionStatus, string> = {
	draft: "Draft",
	submitted: "Submitted",
	returned: "Returned",
	approved: "Approved",
	archived: "Archived",
};

/** `Badge` variant tone per status (matches `components/reui/badge.tsx`). */
export const FORM_STATUS_TONES: Record<
	FormSubmissionStatus,
	"secondary" | "info" | "warning" | "success" | "invert"
> = {
	draft: "secondary",
	submitted: "info",
	returned: "warning",
	approved: "success",
	archived: "invert",
};

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
	// NOTE: chain-entitled scope — own + every form whose approval chain
	// contains the caller's role (institution-wide for vpaa/system_admin).
	// Never an unscoped read: two accounts of the same role only share what
	// that role is entitled to act on. Institution-wide explicitly goes through
	// `allSubmissionsDataAtom` (`scope=all`, archive roles only).
	query.scope = "visible";
	return api.get<FormSubmissionRecord[]>("/forms", { query, signal });
});

/** Submission-status distribution for the status donut (chain-entitled rows). */
export const formStatusCountsAtom = atom<FormStatusDatum[]>((get) => {
	const state = get(formSubmissionsStateAtom);
	// No submissions resolved yet (loading or error) — render the empty state
	// rather than a fabricated distribution.
	if (state.status !== "ready") return [];

	const counts = new Map<FormSubmissionStatus, number>();
	for (const submission of state.data) {
		counts.set(submission.status, (counts.get(submission.status) ?? 0) + 1);
	}
	return SUBMISSION_STATUSES.map((status) => ({
		status,
		count: counts.get(status) ?? 0,
	}));
});

/**
 * "My Submissions" inbox — the session user's own submissions
 * (`GET /forms?scope=mine`; scoping is resolved server-side from the session).
 */
export const {
	dataAtom: mySubmissionsDataAtom,
	stateAtom: mySubmissionsStateAtom,
	refreshAtom: refreshMySubmissionsAtom,
} = atomWithAsyncData<FormSubmissionRecord[]>([], (_get, signal) =>
	api.get<FormSubmissionRecord[]>("/forms", {
		query: { scope: "mine" },
		signal,
	}),
);

/**
 * "Pending Approvals" inbox — submitted records waiting on the session's
 * role (`GET /forms?scope=pending`; a system_admin sees every pending step).
 */
export const {
	dataAtom: pendingApprovalsDataAtom,
	stateAtom: pendingApprovalsStateAtom,
	refreshAtom: refreshPendingApprovalsAtom,
} = atomWithAsyncData<FormSubmissionRecord[]>([], (_get, signal) =>
	api.get<FormSubmissionRecord[]>("/forms", {
		query: { scope: "pending" },
		signal,
	}),
);

/**
 * "Submissions" inbox — the institution-wide list for the archive roles
 * (`GET /forms?scope=all`; the backend matches nothing for any other role).
 * Backs the VPAA's approved-forms/archive screen at `/all-submissions`.
 */
export const {
	dataAtom: allSubmissionsDataAtom,
	stateAtom: allSubmissionsStateAtom,
	refreshAtom: refreshAllSubmissionsAtom,
} = atomWithAsyncData<FormSubmissionRecord[]>([], (_get, signal) =>
	api.get<FormSubmissionRecord[]>("/forms", {
		query: { scope: "all" },
		signal,
	}),
);
