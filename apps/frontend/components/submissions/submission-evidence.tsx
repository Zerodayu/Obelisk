"use client";

import { useAtomValue } from "jotai";
import { ArrowUpRightIcon, ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formPathForCode } from "@/config/navigation";
import { api } from "@/lib/api-client";
import { userAtom } from "@/lib/store/atoms/user";

import type { SubmissionJustificationRecord } from "./submission-justification";

/**
 * Mirrors `SubmissionEvidence` from `apps/backend/src/v1/forms/service.ts`
 * (`GET /forms/:id/evidence`). Counts only — the backend never returns raw
 * student scores to this endpoint, so any reviewer in the approval chain can
 * read it.
 */
export interface SubmissionEvidenceRecord {
	code: string;
	classSectionId: string | null;
	formData: Record<string, unknown>;
	justification: SubmissionJustificationRecord | null;
	classSection: {
		id: string;
		sectionCode: string;
		course: { code: string; title: string };
		term: { schoolYear: string; semester: string };
	} | null;
	capture: {
		attainmentRows: number;
		students: number;
		belowThresholdRows: number;
		atRiskStudents: number;
		computationRunId: string | null;
		runAt: string | null;
	} | null;
}

/** One server-computed counter; `highlight` reddens non-zero problem counts. */
function Stat({
	label,
	value,
	highlight = false,
}: {
	label: string;
	value: number;
	highlight?: boolean;
}) {
	return (
		<div className="bg-muted/30 rounded-lg border px-3 py-2">
			<p
				className={`text-lg font-semibold tabular-nums ${
					highlight && value > 0 ? "text-destructive" : ""
				}`}
			>
				{value}
			</p>
			<p className="text-muted-foreground text-xs">{label}</p>
		</div>
	);
}

/**
 * Read-only evidence panel for the approval screen: the bound class section
 * (course/term), the capture summary for it (rows, students, below-threshold,
 * at-risk, latest computation run), and the stored `formData` payload — the
 * last one collapsed behind a toggle now, since the pedagogical
 * justification above carries what an approver actually reads. Data comes
 * from `GET /forms/:id/evidence` — nothing is derived client-side.
 */
export function SubmissionEvidence({ submissionId }: { submissionId: string }) {
	const [evidence, setEvidence] = useState<SubmissionEvidenceRecord | null>(
		null,
	);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	// NOTE: raw JSON is advanced detail — approvers read the justification card.
	const [showPayload, setShowPayload] = useState(false);
	const user = useAtomValue(userAtom);

	const load = useCallback(async () => {
		setLoading(true);
		setShowPayload(false);
		try {
			setEvidence(
				await api.get<SubmissionEvidenceRecord>(
					`/forms/${submissionId}/evidence`,
				),
			);
			setError(false);
		} catch {
			// The screen already passed the visibility gate; a failed refresh just
			// leaves the panel empty with a retry-free muted note.
			setError(true);
		} finally {
			setLoading(false);
		}
	}, [submissionId]);

	useEffect(() => {
		void load();
	}, [load]);

	// Role-aware: capture-only screens stay unlinked for roles that lost them.
	const formPath = evidence
		? formPathForCode(evidence.code, user?.role)
		: undefined;
	const payload = evidence ? Object.entries(evidence.formData ?? {}) : [];
	const section = evidence?.classSection ?? null;
	const capture = evidence?.capture ?? null;

	return (
		<section className="bg-card space-y-4 rounded-xl border p-5 shadow-sm sm:p-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<h3 className="text-base font-semibold">Evidence</h3>
					{evidence ? (
						<span className="text-muted-foreground font-mono text-xs">
							{evidence.code}
						</span>
					) : null}
				</div>
				{formPath ? (
					<Button asChild size="sm" variant="ghost">
						<Link href={formPath}>
							Open form screen <ArrowUpRightIcon />
						</Link>
					</Button>
				) : null}
			</div>

			{loading && !evidence ? (
				<div className="text-muted-foreground flex items-center gap-2 text-sm">
					<Spinner className="size-4" /> Loading evidence…
				</div>
			) : error || !evidence ? (
				<p className="text-muted-foreground text-sm">
					Evidence could not be loaded for this submission.
				</p>
			) : (
				<div className="space-y-4">
					{section ? (
						<div className="space-y-3">
							<div className="flex flex-wrap items-center gap-2">
								<span className="text-sm font-medium">
									{section.course.code} · Section {section.sectionCode}
								</span>
								<span className="text-muted-foreground text-xs">
									{section.course.title} — {section.term.schoolYear},{" "}
									{section.term.semester} semester
								</span>
							</div>
							{capture ? (
								<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
									<Stat
										label="Attainment rows"
										value={capture.attainmentRows}
									/>
									<Stat label="Students" value={capture.students} />
									<Stat
										highlight
										label="Below 70% rows"
										value={capture.belowThresholdRows}
									/>
									<Stat
										highlight
										label="At-risk students"
										value={capture.atRiskStudents}
									/>
								</div>
							) : (
								<p className="text-muted-foreground text-sm">
									No class records captured for this section yet.
								</p>
							)}
							{capture?.computationRunId ? (
								<p className="text-muted-foreground text-xs">
									Latest computation{" "}
									<span className="font-mono">
										{capture.computationRunId.slice(0, 8)}
									</span>
									{capture.runAt
										? ` · ${new Date(capture.runAt).toLocaleString()}`
										: ""}
								</p>
							) : null}
						</div>
					) : (
						<p className="text-muted-foreground text-sm">
							No class section bound to this submission.
						</p>
					)}

					{payload.length > 0 ? (
						<div className="space-y-2">
							<Button
								aria-expanded={showPayload}
								className="-ml-2 h-7 px-2"
								onClick={() => setShowPayload((open) => !open)}
								type="button"
								variant="ghost"
							>
								Stored payload
								<ChevronDownIcon
									className={`transition-transform duration-200 ${
										showPayload ? "rotate-180" : ""
									}`}
								/>
							</Button>
							{showPayload ? (
								<pre className="bg-muted/30 max-h-80 overflow-auto rounded-lg border p-3 text-xs">
									{JSON.stringify(evidence.formData, null, 2)}
								</pre>
							) : null}
						</div>
					) : (
						<p className="text-muted-foreground text-sm">
							No stored payload — the content lives on the form screen.
						</p>
					)}
				</div>
			)}
		</section>
	);
}
