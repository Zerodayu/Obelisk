"use client";

import { atom, useAtomValue } from "jotai";
import Link from "next/link";

import { Badge, type BadgeProps } from "@/components/reui/badge";
import {
	Frame,
	FrameDescription,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import {
	type DutySection,
	type DutyStep,
	dutiesFor,
} from "@/config/role-duties";
import { type DutyState, resolveDutyState } from "@/lib/duty-status";
import type { UserRole } from "@/lib/role-access";
import type { AsyncState } from "@/lib/store/async-atom";
import {
	type FormSubmissionRecord,
	mySubmissionsStateAtom,
	pendingApprovalsStateAtom,
} from "@/lib/store/atoms/forms";

/**
 * Stand-in read for a dataset a role's duties never touch, so subscribing is
 * free: it reports `loading`, and no duty resolves against it (nothing
 * fetches — the atom is only read, and `atomWithAsyncData` skips SSR reads).
 * Keeps faculty from requesting `scope=pending` and vpaa from requesting
 * `scope=mine`.
 */
const skipState = atom<AsyncState<FormSubmissionRecord[]>>({
	status: "loading",
	data: [],
});

/** Badge copy + tone per resolved duty state. */
function dutyBadge(state: DutyState): {
	variant: BadgeProps["variant"];
	label: string;
} {
	switch (state.kind) {
		case "loading":
			return { variant: "outline", label: "…" };
		case "unavailable":
			return { variant: "outline", label: "—" };
		case "idle":
			return { variant: "secondary", label: "Not started" };
		case "draft":
			return { variant: "warning", label: `Draft · ${state.count}` };
		case "progress":
			return { variant: "info", label: `In progress · ${state.count}` };
		case "done":
			return { variant: "success", label: "Done" };
		case "waiting":
			return { variant: "warning", label: `Waiting on you · ${state.count}` };
		case "clear":
			return { variant: "success", label: "All clear" };
		case "open":
			return { variant: "secondary", label: "Open" };
	}
}

function DutyRow({ step, state }: { step: DutyStep; state: DutyState }) {
	const badge = dutyBadge(state);
	return (
		<li className="flex items-start gap-3">
			<span className="bg-muted text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border">
				<step.icon className="size-3.5" aria-hidden />
			</span>
			<div className="min-w-0 flex-1">
				<Link
					href={step.url}
					className="hover:text-foreground text-sm font-medium hover:underline"
				>
					{step.title}
				</Link>
				<p className="text-muted-foreground text-xs">{step.detail}</p>
			</div>
			<Badge variant={badge.variant} size="sm" radius="full">
				{badge.label}
			</Badge>
		</li>
	);
}

/**
 * "What you need to do" — the role's duty registry
 * (`config/role-duties.ts`) with each step's live state, resolved from the
 * submission lists in `lib/store/atoms/forms.ts`. Renders nothing for roles
 * without a duty list (`system_admin`, `user`).
 *
 * The backend stays the source of truth: this only *displays* statuses the
 * server already computed; it never re-derives attainment or workflow rules.
 */
export function RoleChecklist({ role }: { role: UserRole }) {
	const sections: DutySection[] = dutiesFor(role);
	const needsMine = sections.some((section) =>
		section.steps.some((step) => step.status.kind === "prepare"),
	);
	const needsPending = sections.some((section) =>
		section.steps.some((step) => step.status.kind === "approve"),
	);

	const mine = useAtomValue(needsMine ? mySubmissionsStateAtom : skipState);
	const pending = useAtomValue(
		needsPending ? pendingApprovalsStateAtom : skipState,
	);

	if (sections.length === 0) return null;

	const ctx = { mine, pending };
	const steps = sections.flatMap((section) => section.steps);
	const states = new Map(
		steps.map((step) => [step.id, resolveDutyState(step.status, ctx)]),
	);

	// Progress counts only steps with a computable state; `link` steps stay
	// listed but never become "Done" (they are destinations, not deliverables).
	const tracked = steps.filter((step) => step.status.kind !== "link");
	const finished = tracked.filter(
		(step) =>
			states.get(step.id)?.kind === "done" ||
			states.get(step.id)?.kind === "clear",
	).length;

	const summary =
		tracked.length > 0
			? `${finished} of ${tracked.length} steps done`
			: undefined;

	return (
		<Frame className="w-full">
			<FrameHeader>
				<FrameTitle>What you need to do</FrameTitle>
				{summary ? <FrameDescription>{summary}</FrameDescription> : null}
			</FrameHeader>
			<FramePanel>
				<ol className="space-y-4">
					{sections.map((section, index) => (
						<li key={section.label}>
							<p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
								{index + 1} · {section.label}
							</p>
							<ul className="space-y-3">
								{section.steps.map((step) => (
									<DutyRow
										key={step.id}
										step={step}
										state={states.get(step.id) ?? { kind: "loading" }}
									/>
								))}
							</ul>
						</li>
					))}
				</ol>
			</FramePanel>
		</Frame>
	);
}
