/**
 * Duty-status resolver — pure functions that turn the two submission lists
 * the dashboard already loads into a per-step state for the "What you need
 * to do" checklist (`components/dashboard/role-checklist.tsx`).
 *
 * Data sources (no new endpoints):
 * - `GET /forms?scope=mine` (`mySubmissionsStateAtom`) — resolves `prepare`
 *   steps: did this role create/submit the form?
 * - `GET /forms?scope=pending` (`pendingApprovalsStateAtom`) — resolves
 *   `approve` steps: is anything waiting on this role?
 *
 * NOTE: the list endpoints carry no term filter, so a step reads "Done" off
 * the newest matching submission in **any** term. Once `GET /forms` accepts a
 * `termId`, pass the active term here to make the checklist term-scoped.
 */

import type { DutyStatus } from "@/config/role-duties";
import type { AsyncState } from "@/lib/store/async-atom";
import type { FormSubmissionRecord } from "@/lib/store/atoms/forms";

export type DutyState =
	/** First fetch in flight — render an ellipsis, never a guess. */
	| { kind: "loading" }
	/** The dataset failed to load — render an em dash instead of "Not started". */
	| { kind: "unavailable" }
	/** Prepare step with no submission for this form code yet. */
	| { kind: "idle" }
	/** Every matching submission still sits in `draft`. */
	| { kind: "draft"; count: number }
	/** Some are `submitted`/`returned`, waiting on the chain. */
	| { kind: "progress"; count: number }
	/** Every matching submission is `approved` or `archived`. */
	| { kind: "done" }
	/** Approve step: `count` submissions await this role. */
	| { kind: "waiting"; count: number }
	/** Approve step with nothing pending. */
	| { kind: "clear" }
	/** Link step (PLO management, archives, AI) — no computed state. */
	| { kind: "open" };

export interface DutyContext {
	/** `AsyncState` from `mySubmissionsStateAtom`; `null` when not subscribed. */
	mine?: AsyncState<FormSubmissionRecord[]> | null;
	/** `AsyncState` from `pendingApprovalsStateAtom`; `null` when not subscribed. */
	pending?: AsyncState<FormSubmissionRecord[]> | null;
}

/** Statuses that still owe the role an action. */
const OUTSTANDING = new Set<FormSubmissionRecord["status"]>([
	"draft",
	"submitted",
	"returned",
]);

/** Resolve one duty step's state. Never throws; never invents data. */
export function resolveDutyState(
	status: DutyStatus,
	ctx: DutyContext,
): DutyState {
	if (status.kind === "link") return { kind: "open" };

	const state = status.kind === "prepare" ? ctx.mine : ctx.pending;
	if (!state || state.status === "loading") return { kind: "loading" };
	if (state.status === "error") return { kind: "unavailable" };

	if (status.kind === "approve") {
		// `pending` is already scoped to the caller's role by the backend; `codes`
		// narrows it further when the duty names specific forms.
		const codes = status.codes;
		const rows = codes
			? state.data.filter(
					(row) =>
						row.formType !== undefined && codes.includes(row.formType.code),
				)
			: state.data;
		return rows.length > 0
			? { kind: "waiting", count: rows.length }
			: { kind: "clear" };
	}

	// prepare: one duty can span several submissions (one per class section).
	const rows = state.data.filter((row) => row.formType?.code === status.code);
	if (rows.length === 0) return { kind: "idle" };

	const outstanding = rows.filter((row) => OUTSTANDING.has(row.status));
	if (outstanding.length === 0) return { kind: "done" };

	const allDrafts = outstanding.every((row) => row.status === "draft");
	return allDrafts
		? { kind: "draft", count: outstanding.length }
		: { kind: "progress", count: outstanding.length };
}

/** Has the checklist finished loading every step it tracks? */
export function isDutyStateReady(state: DutyState): boolean {
	return state.kind !== "loading" && state.kind !== "unavailable";
}
