"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/reui/badge";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api-client";
import { IPD_STAGES } from "@/lib/constants/obe";

/**
 * Mirrors `SubmissionJustification` from
 * `apps/backend/lib/forms/justification.ts`, reached through
 * `GET /forms/:id/evidence`. Read-only — nothing here is derived client-side.
 */
export interface JustificationRowRecord {
	cloCode: string;
	ploCode: string | null;
	bloomsLevel: string | null;
	ipdStage: string | null;
	assessmentTypes: string[] | null;
	weightInGradePct: number | null;
}

export interface AssessmentEvidenceRowRecord {
	cloCode: string;
	assessmentType: string;
	attainmentPct: number | null;
	belowBenchmark: boolean | null;
}

export interface SubmissionJustificationRecord {
	kind: "car" | "curriculum_map" | "details";
	rows: JustificationRowRecord[];
	assessmentEvidence: AssessmentEvidenceRowRecord[];
	coverage: {
		i: number;
		p: number;
		d: number;
		unstaged: number;
		courses: number;
	} | null;
	uncoveredPlos: string[];
	notes: string[];
}

function Empty({ message }: { message: string }) {
	return <p className="text-muted-foreground text-sm">{message}</p>;
}

/** One I-P-D coverage tile — letter badge plus the spelled-out stage name. */
function StageTile({
	stage,
	count,
}: {
	stage: keyof typeof IPD_STAGES;
	count: number;
}) {
	const meta = IPD_STAGES[stage];
	return (
		<div className="bg-muted/30 rounded-lg border px-3 py-2">
			<p className="text-lg font-semibold tabular-nums">{count}</p>
			<p className="text-muted-foreground flex items-center gap-1.5 text-xs">
				<Badge radius="full" size="xs" variant="outline">
					{meta.letter}
				</Badge>
				{meta.label}
			</p>
		</div>
	);
}

function AlignmentTable({ rows }: { rows: JustificationRowRecord[] }) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="text-muted-foreground border-b text-left">
						<th className="py-2 pr-4">CLO</th>
						<th className="py-2 pr-4">PLO</th>
						<th className="py-2 pr-4">Bloom's</th>
						<th className="py-2 pr-4">I-P-D</th>
						<th className="py-2 pr-4">Assessment types</th>
						<th className="py-2 pr-4 text-right">Weight</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => {
						const stage = row.ipdStage
							? IPD_STAGES[row.ipdStage.toLowerCase()]
							: undefined;
						return (
							<tr className="border-b last:border-0" key={row.cloCode}>
								<td className="py-2 pr-4 font-medium">{row.cloCode}</td>
								<td className="py-2 pr-4">{row.ploCode ?? "—"}</td>
								<td className="py-2 pr-4">
									{row.bloomsLevel ? (
										<Badge variant="info-light">{row.bloomsLevel}</Badge>
									) : (
										<span className="text-muted-foreground">—</span>
									)}
								</td>
								<td className="py-2 pr-4">
									{stage ? (
										<span className="inline-flex items-center gap-1.5">
											<Badge variant="outline">{stage.letter}</Badge>
											<span className="text-muted-foreground text-xs">
												{stage.label}
											</span>
										</span>
									) : (
										<span className="text-muted-foreground">—</span>
									)}
								</td>
								<td className="py-2 pr-4">
									{row.assessmentTypes?.length
										? row.assessmentTypes.join(", ")
										: "—"}
								</td>
								<td className="py-2 pr-4 text-right tabular-nums">
									{row.weightInGradePct != null
										? `${row.weightInGradePct}%`
										: "—"}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

function AssessmentEvidenceTable({
	rows,
}: {
	rows: AssessmentEvidenceRowRecord[];
}) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="text-muted-foreground border-b text-left">
						<th className="py-2 pr-4">CLO</th>
						<th className="py-2 pr-4">Assessment event</th>
						<th className="py-2 pr-4 text-right">Attainment</th>
						<th className="py-2 pr-4">Against 70% benchmark</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr
							className="border-b last:border-0"
							key={`${row.cloCode}-${row.assessmentType}`}
						>
							<td className="py-2 pr-4 font-medium">{row.cloCode}</td>
							<td className="py-2 pr-4">{row.assessmentType}</td>
							<td className="py-2 pr-4 text-right tabular-nums">
								{row.attainmentPct != null ? `${row.attainmentPct}%` : "—"}
							</td>
							<td className="py-2 pr-4">
								{row.belowBenchmark === null ? (
									<span className="text-muted-foreground">—</span>
								) : row.belowBenchmark ? (
									<Badge variant="destructive-light">Below benchmark</Badge>
								) : (
									<Badge variant="success-light">Met</Badge>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

/**
 * `/submissions/[id]` — read-only pedagogical justification for the approval
 * chain: Bloom's Taxonomy, I-P-D stage and assessment evidence as plain text,
 * so an approver can sign off on alignment instead of raw numbers
 * (system-docs/testing_results §2).
 *
 * Sits above the workflow card on purpose — display only, it never gates the
 * Approve action. Data comes from `GET /forms/:id/evidence.justification`,
 * resolved server-side per form code.
 */
export function SubmissionJustification({
	submissionId,
}: {
	submissionId: string;
}) {
	const [justification, setJustification] =
		useState<SubmissionJustificationRecord | null>(null);
	const [loading, setLoading] = useState(true);
	const [failed, setFailed] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const record = await api.get<{
				justification: SubmissionJustificationRecord | null;
			}>(`/forms/${submissionId}/evidence`);
			setJustification(record.justification ?? null);
			setFailed(false);
		} catch {
			// The screen already passed the visibility gate; a failed refresh just
			// leaves this panel empty with a muted note (the evidence card below
			// reports its own load state).
			setFailed(true);
		} finally {
			setLoading(false);
		}
	}, [submissionId]);

	useEffect(() => {
		void load();
	}, [load]);

	if (loading && !justification) {
		return (
			<section className="bg-card rounded-xl border p-5 shadow-sm sm:p-6">
				<div className="text-muted-foreground flex items-center gap-2 text-sm">
					<Spinner className="size-4" /> Loading pedagogical justification…
				</div>
			</section>
		);
	}

	if (failed) {
		return (
			<section className="bg-card rounded-xl border p-5 shadow-sm sm:p-6">
				<h3 className="text-base font-semibold">Pedagogical justification</h3>
				<p className="text-muted-foreground mt-2 text-sm">
					Justification could not be loaded for this submission.
				</p>
			</section>
		);
	}

	return (
		<section className="bg-card space-y-4 rounded-xl border p-5 shadow-sm sm:p-6">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<h3 className="text-base font-semibold">Pedagogical justification</h3>
					{justification ? (
						<Badge variant="outline">
							{justification.kind === "car" ? "CAR" : justification.kind === "curriculum_map" ? "Curriculum map" : "Form details"}
						</Badge>
					) : null}
				</div>
				<p className="text-muted-foreground text-xs">
					Bloom's Taxonomy · I-P-D stage · assessment evidence
				</p>
			</div>

			{!justification ? (
				<Empty message="No pedagogical justification recorded for this form type." />
			) : (
				<div className="space-y-4">
					{justification.notes.length > 0 ? (
						<ul className="space-y-1.5">
							{justification.notes.map((note) => (
								<li
									className="text-muted-foreground text-sm"
									key={note.slice(0, 64)}
								>
									{note}
								</li>
							))}
						</ul>
					) : null}

					{justification.kind === "car" ? (
						<>
							{justification.rows.length > 0 ? (
								<AlignmentTable rows={justification.rows} />
							) : (
								<Empty message="No CLO-to-PLO alignment saved on this CAR yet." />
							)}

							<div className="space-y-2">
								<p className="text-sm font-medium">Assessment evidence</p>
								{justification.assessmentEvidence.length > 0 ? (
									<AssessmentEvidenceTable
										rows={justification.assessmentEvidence}
									/>
								) : (
									<Empty message="No assessment attainment captured for this section yet." />
								)}
							</div>
						</>
					) : null}

					{justification.coverage ? (
						<div className="space-y-3">
							<p className="text-sm font-medium">I-P-D coverage</p>
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
								<StageTile count={justification.coverage.i} stage="i" />
								<StageTile count={justification.coverage.p} stage="p" />
								<StageTile count={justification.coverage.d} stage="d" />
								<div className="bg-muted/30 rounded-lg border px-3 py-2">
									<p className="text-lg font-semibold tabular-nums">
										{justification.coverage.unstaged}
									</p>
									<p className="text-muted-foreground text-xs">
										Unstaged · {justification.coverage.courses} courses
									</p>
								</div>
							</div>
							{justification.uncoveredPlos.length > 0 ? (
								<p className="text-muted-foreground text-sm">
									No D-stage course yet for{" "}
									<span className="text-foreground font-medium">
										{justification.uncoveredPlos.join(", ")}
									</span>
									.
								</p>
							) : null}
						</div>
					) : null}
				</div>
			)}
		</section>
	);
}
