"use client";

import type { Atom, WritableAtom } from "jotai";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { ArchiveIcon, ArrowRightIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
	SAMPLE_MY_SUBMISSIONS,
	SAMPLE_PENDING_APPROVALS,
} from "@/components/charts/obe-sample-data";
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
import { Spinner } from "@/components/ui/spinner";
import { Status } from "@/components/ui/status";
import { toast, toastError } from "@/components/ui/toast";
import { formNeedsApproval } from "@/lib/form-tags";
import { ARCHIVE_ROLES, roleLabel, type UserRole } from "@/lib/roles";
import type { AsyncState } from "@/lib/store/async-atom";
import {
	allSubmissionsDataAtom,
	allSubmissionsStateAtom,
	FORM_STATUS_LABELS,
	type FormSubmissionRecord,
	type FormSubmissionStatus,
	mySubmissionsDataAtom,
	mySubmissionsStateAtom,
	pendingApprovalsDataAtom,
	pendingApprovalsStateAtom,
	refreshAllSubmissionsAtom,
	refreshFormSubmissionsAtom,
	refreshMySubmissionsAtom,
	refreshPendingApprovalsAtom,
} from "@/lib/store/atoms/forms";
import { userAtom } from "@/lib/store/atoms/user";
import { archiveFormAction } from "@/server/actions/forms";

interface InboxAtoms {
	data: Atom<FormSubmissionRecord[]>;
	state: Atom<AsyncState<FormSubmissionRecord[]>>;
	refresh: WritableAtom<null, [], void>;
}

type InboxScope = "mine" | "pending" | "all";

const INBOX_ATOMS: Record<InboxScope, InboxAtoms> = {
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
	all: {
		data: allSubmissionsDataAtom,
		state: allSubmissionsStateAtom,
		refresh: refreshAllSubmissionsAtom,
	},
};

/**
 * Dev-mode preview atoms — synchronous canned rows, so the inboxes render
 * populated during SSR with no API call. `DEVELOPMENT` is only visible to
 * the server, which passes `devPreview` down from the route.
 */
function previewInboxAtoms(data: FormSubmissionRecord[]): InboxAtoms {
	return {
		data: atom(data),
		state: atom<AsyncState<FormSubmissionRecord[]>>({ status: "ready", data }),
		refresh: atom(null, () => {}),
	};
}

const PREVIEW_ATOMS: Record<InboxScope, InboxAtoms> = {
	mine: previewInboxAtoms(SAMPLE_MY_SUBMISSIONS),
	pending: previewInboxAtoms(SAMPLE_PENDING_APPROVALS),
	// NOTE: the canned rows span every status, so the approved-filtered default
	// still renders populated in dev preview.
	all: previewInboxAtoms(SAMPLE_MY_SUBMISSIONS),
};

/**
 * Soft status chips for the inbox pages only — each status keeps its current
 * color family (theme tokens: info=blue-500, warning=amber-500,
 * success=emerald-500, invert=zinc-900, secondary=neutral) in the
 * `border-{c}-200/20 bg-{c}-500/10 text-{c}-500` tint style.
 */
const STATUS_BADGE_CLASS: Record<FormSubmissionRecord["status"], string> = {
	draft: "border-gray-200/20 bg-gray-500/10 text-gray-500",
	submitted: "border-blue-200/20 bg-blue-500/10 text-blue-500",
	returned: "border-amber-200/20 bg-amber-500/10 text-amber-500",
	approved: "border-emerald-200/20 bg-emerald-500/10 text-emerald-500",
	archived: "border-zinc-200/20 bg-zinc-500/10 text-zinc-500",
};

/**
 * Solid dot colors for the leading Status indicator — same hue families as
 * the chip tints (theme tokens: info=blue, warning=amber, success=emerald,
 * secondary=neutral, invert=zinc), passed as custom colors per the Status
 * sample usage.
 */
const STATUS_DOT_CLASS: Record<FormSubmissionRecord["status"], string> = {
	draft: "bg-gray-500",
	submitted: "bg-blue-500",
	returned: "bg-amber-500",
	approved: "bg-emerald-500",
	archived: "bg-zinc-500",
};

/** Status chips for the all-submissions filter (`null` = no filter). */
const STATUS_FILTERS: (FormSubmissionStatus | null)[] = [
	null,
	"draft",
	"submitted",
	"returned",
	"approved",
	"archived",
];

const SCOPE_COPY: Record<InboxScope, { header: string; empty: string }> = {
	mine: {
		header: "Every form you have submitted, with its live approval status.",
		empty: "You haven't submitted any forms yet.",
	},
	pending: {
		header: "Submitted forms waiting for your decision.",
		empty: "Nothing is waiting on your role right now.",
	},
	all: {
		header:
			"Every submission across the institution. Approved forms can be archived from this list.",
		empty: "No submissions found.",
	},
};

/**
 * Submission inbox table shared by `/submissions` (own records),
 * `/approvals` (records waiting on the caller's role), and
 * `/all-submissions` (institution-wide, archive roles — with a status filter
 * defaulting to `approved` and a one-click Archive action). Data comes from
 * the scoped atoms — the backend resolves the scope from the session. With
 * `devPreview` (DEVELOPMENT=true) the canned rows render instead, so the UI
 * can be reviewed without a backend session.
 */
export function SubmissionInbox({
	scope,
	devPreview = false,
}: {
	scope: InboxScope;
	/** True when `DEVELOPMENT=true` — render the canned rows, skip the API. */
	devPreview?: boolean;
}) {
	const atoms = devPreview ? PREVIEW_ATOMS[scope] : INBOX_ATOMS[scope];
	const submissions = useAtomValue(atoms.data);
	const state = useAtomValue(atoms.state);
	const refresh = useSetAtom(atoms.refresh);
	const refreshDashboard = useSetAtom(refreshFormSubmissionsAtom);
	const user = useAtomValue(userAtom);

	// NOTE: the institution-wide list opens on the approved forms — the VPAA's
	// archive queue — with chips to widen to any other status.
	const [statusFilter, setStatusFilter] = useState<FormSubmissionStatus | null>(
		scope === "all" ? "approved" : null,
	);
	const [archivingId, setArchivingId] = useState<string | null>(null);

	// NOTE: Setup/Record-tagged forms file with no approval, so they stay off
	// the "My Submissions" inbox — only approval-bound forms are listed here.
	const visible =
		scope === "mine"
			? submissions.filter(
					(s) => s.formType === undefined || formNeedsApproval(s.formType.code),
				)
			: submissions;
	const rows = statusFilter
		? visible.filter((submission) => submission.status === statusFilter)
		: visible;
	const canArchive = user != null && ARCHIVE_ROLES.includes(user.role);

	async function archive(id: string) {
		setArchivingId(id);
		const result = await archiveFormAction(id);
		if (!result.ok) {
			toastError({
				title: "Archive failed",
				description: result.error,
				status: result.status,
				scope: "inbox:archive",
			});
		} else {
			toast.success({ title: "Submission archived" });
			refresh();
			refreshDashboard();
		}
		setArchivingId(null);
	}

	const emptyCopy =
		scope === "all" && statusFilter
			? `No ${FORM_STATUS_LABELS[statusFilter].toLowerCase()} submissions.`
			: SCOPE_COPY[scope].empty;

	return (
		<section className="bg-card rounded-xl border p-6 shadow-sm">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-muted-foreground text-xs">
					{SCOPE_COPY[scope].header}
				</p>
				<Button
					disabled={state.status === "loading"}
					onClick={() => refresh()}
					type="button"
					variant="outline"
				>
					<RefreshCwIcon />
					Refresh
				</Button>
			</div>

			{scope === "all" ? (
				<div className="mt-4 flex flex-wrap items-center gap-2">
					{STATUS_FILTERS.map((filter) => {
						const active = statusFilter === filter;
						return (
							<Button
								aria-pressed={active}
								className={active ? undefined : "text-muted-foreground"}
								key={filter ?? "all"}
								onClick={() => setStatusFilter(filter)}
								size="sm"
								type="button"
								variant={active ? "default" : "ghost"}
							>
								{filter ? FORM_STATUS_LABELS[filter] : "All"}
							</Button>
						);
					})}
				</div>
			) : null}

			{state.status === "loading" && rows.length === 0 ? (
				<div className="text-muted-foreground mt-6 flex items-center gap-2 text-sm">
					<Spinner className="size-4" /> Loading submissions…
				</div>
			) : state.status === "error" ? (
				<div className="mt-6 space-y-2">
					<p className="text-destructive text-sm">
						Could not load submissions. Please try again.
					</p>
					<Button onClick={() => refresh()} type="button" variant="outline">
						Retry
					</Button>
				</div>
			) : rows.length === 0 ? (
				<p className="text-muted-foreground mt-6 text-sm">{emptyCopy}</p>
			) : (
				<ul className="divide-border mt-4 divide-y">
					{rows.map((submission) => {
						const code = submission.formType?.code;
						return (
							<li
								className="flex flex-wrap items-center gap-3 py-3"
								key={submission.id}
							>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">
										{submission.formType?.name ?? "Form submission"}
									</p>
									<p className="text-muted-foreground truncate text-xs">
										{code ? <span className="font-mono">{code}</span> : null}
										{code ? " · " : null}
										Updated {new Date(submission.updatedAt).toLocaleString()}
										{scope !== "mine" && submission.submittedBy
											? ` · from ${submission.submittedBy.name}`
											: null}
									</p>
								</div>

								<Badge className={STATUS_BADGE_CLASS[submission.status]}>
									<Status
										className={STATUS_DOT_CLASS[submission.status]}
										size="sm"
									/>
									{FORM_STATUS_LABELS[submission.status]}
								</Badge>

								{scope === "pending" && submission.currentApproverRole ? (
									<Badge variant="outline">
										{roleLabel(submission.currentApproverRole as UserRole)}
									</Badge>
								) : null}

								{/* NOTE: one-click archive from the list — the confirm dialog
                    mirrors the permanence warning on the detail screen. */}
								{scope === "all" &&
								submission.status === "approved" &&
								canArchive ? (
									<AlertDialog>
										<AlertDialogTrigger asChild>
											<Button
												disabled={archivingId != null}
												size="sm"
												type="button"
												variant="outline"
											>
												<ArchiveIcon />
												{archivingId === submission.id
													? "Archiving…"
													: "Archive"}
											</Button>
										</AlertDialogTrigger>
										<AlertDialogContent>
											<AlertDialogHeader>
												<AlertDialogTitle>
													Archive this submission?
												</AlertDialogTitle>
												<AlertDialogDescription>
													Archiving is permanent — an archived submission can no
													longer be edited or reactivated.
												</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel>Cancel</AlertDialogCancel>
												<AlertDialogClose asChild>
													<AlertDialogAction
														onClick={() => void archive(submission.id)}
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

								<Button asChild size="sm" variant="ghost">
									<Link href={`/submissions/${submission.id}`}>
										Open <ArrowRightIcon />
									</Link>
								</Button>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
