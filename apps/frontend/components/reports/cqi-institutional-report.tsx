"use client";

import { useCallback, useEffect, useState } from "react";

import {
	CloAttainmentBars,
	PloAttainmentBars,
	ScoreBandBars,
} from "@/components/charts/attainment-charts";
import { LoopStatusDonut } from "@/components/charts/cqi-charts";
import { Badge } from "@/components/reui/badge";
import {
	Frame,
	FrameDescription,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { ProgramSelect } from "@/components/ui/program-select";
import { TermSelect } from "@/components/ui/term-select";
import { toast, toastError } from "@/components/ui/toast";
import {
	type CqiReport,
	type ReportFinding,
	generateCqiNarrative,
	getCqiInstitutionalReport,
	reviewCqiNarrative,
} from "@/server/actions/reports";

type TermOption = { id: string; label: string };

function pct(value: number | null | undefined): string {
	return value === null || value === undefined ? "—" : `${value.toFixed(2)}%`;
}

function statusBadge(status: string) {
	if (status === "MET" || status === "acknowledged") {
		return (
			<Badge variant="success-light">
				{status === "MET" ? "MET" : "Approved"}
			</Badge>
		);
	}
	if (status === "NOT MET" || status === "dismissed") {
		return (
			<Badge variant="destructive-light">
				{status === "NOT MET" ? "NOT MET" : "Dismissed"}
			</Badge>
		);
	}
	return <Badge variant="outline">{status.replaceAll("_", " ")}</Badge>;
}

function priorityBadge(priority: ReportFinding["priority"]) {
	const variant =
		priority === "critical"
			? "destructive-light"
			: priority === "high"
				? "warning-light"
				: priority === "medium"
					? "info-light"
					: "success-light";
	return (
		<Badge variant={variant} className="capitalize">
			{priority}
		</Badge>
	);
}

function FindingList({
	title,
	findings,
	empty,
}: {
	title: string;
	findings: ReportFinding[];
	empty: string;
}) {
	return (
		<div className="space-y-4">
			<h3 className="text-sm font-semibold">{title}</h3>
			{findings.length === 0 ? (
				<p className="text-muted-foreground text-sm">{empty}</p>
			) : (
				<ul className="space-y-2">
					{findings.map((finding) => (
						<li
							key={finding.outcomeKey}
							className="rounded-md border p-3 text-sm"
						>
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium">{finding.outcomeCode}</span>
								{priorityBadge(finding.priority)}
							</div>
							<p className="mt-1">{finding.statement}</p>
							<p className="text-muted-foreground mt-1 text-xs">
								{finding.evidence}
							</p>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-md border p-3">
			<p className="text-muted-foreground text-xs uppercase">{label}</p>
			<p className="mt-1 text-lg font-semibold">{value}</p>
		</div>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<tr className="border-b last:border-0">
			<td className="text-muted-foreground w-56 py-2 pr-4">{label}</td>
			<td className="py-2">{value}</td>
		</tr>
	);
}

function OutcomeTable({ rows }: { rows: CqiReport["outcomes"] }) {
	if (rows.length === 0) {
		return <p className="text-muted-foreground text-sm">No data.</p>;
	}
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="text-muted-foreground border-b text-left">
						<th className="py-2 pr-4">Outcome</th>
						<th className="py-2 pr-4">Program</th>
						<th className="py-2 pr-4 text-right">Target</th>
						<th className="py-2 pr-4 text-right">Direct</th>
						<th className="py-2 pr-4 text-right">Indirect</th>
						<th className="py-2 pr-4 text-right">Composite</th>
						<th className="py-2 pr-4 text-right">Median</th>
						<th className="py-2 pr-4 text-right">N</th>
						<th className="py-2 pr-4">Status</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.key} className="border-b last:border-0">
							<td className="py-2 pr-4">
								<span className="font-medium">{row.code}</span>
								{row.derived ? (
									<Badge variant="outline" className="ml-2">
										derived
									</Badge>
								) : null}
							</td>
							<td className="py-2 pr-4">{row.programCode}</td>
							<td className="py-2 pr-4 text-right">
								{pct(row.effectiveTargetPct)}
							</td>
							<td className="py-2 pr-4 text-right">{pct(row.directPct)}</td>
							<td className="py-2 pr-4 text-right">{pct(row.indirectPct)}</td>
							<td className="py-2 pr-4 text-right font-medium">
								{pct(row.compositePct)}
							</td>
							<td className="py-2 pr-4 text-right">{pct(row.medianPct)}</td>
							<td className="py-2 pr-4 text-right">{row.assessedCount}</td>
							<td className="py-2 pr-4">{statusBadge(row.status)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function StatusHeatmap({ report }: { report: CqiReport }) {
	const programs = report.scope.programs.map((program) => program.code);
	const rows = programs.map((program) => {
		const outcomes = report.outcomes.filter(
			(outcome) =>
				outcome.programCode === program && outcome.outcomeType !== "PEO",
		);
		return {
			program,
			met: outcomes.filter((outcome) => outcome.status === "MET").length,
			notMet: outcomes.filter((outcome) => outcome.status === "NOT MET").length,
			unavailable: outcomes.filter(
				(outcome) => outcome.status === "NOT AVAILABLE",
			).length,
		};
	});
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="text-muted-foreground border-b text-left">
						<th className="py-2 pr-4">Program</th>
						<th className="py-2 pr-4">MET</th>
						<th className="py-2 pr-4">NOT MET</th>
						<th className="py-2 pr-4">Not available</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.program} className="border-b last:border-0">
							<td className="py-2 pr-4 font-medium">{row.program}</td>
							<td className="py-2 pr-4">
								<span className="bg-success/15 text-success-foreground inline-block min-w-8 rounded px-2 py-1 text-center">
									{row.met}
								</span>
							</td>
							<td className="py-2 pr-4">
								<span className="bg-destructive/15 text-destructive-foreground inline-block min-w-8 rounded px-2 py-1 text-center">
									{row.notMet}
								</span>
							</td>
							<td className="py-2 pr-4">
								<span className="bg-muted text-muted-foreground inline-block min-w-8 rounded px-2 py-1 text-center">
									{row.unavailable}
								</span>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export function CqiInstitutionalReportView({ terms }: { terms: TermOption[] }) {
	const [termId, setTermId] = useState(terms[0]?.id ?? "");
	const [programId, setProgramId] = useState("");
	const [report, setReport] = useState<CqiReport | null>(null);
	const [loading, setLoading] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async (nextTermId?: string, nextProgramId?: string) => {
		setLoading(true);
		setError(null);
		const result = await getCqiInstitutionalReport(
			nextTermId || undefined,
			nextProgramId || undefined,
		);
		if (result.ok) setReport(result.data);
		else {
			setReport(null);
			setError(result.error);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		void load(termId, programId);
	}, [termId, programId, load]);

	const generate = useCallback(async () => {
		setGenerating(true);
		try {
			const result = await generateCqiNarrative(termId || undefined, programId || undefined);
			if (!result.ok) {
				toastError({
					title: "Narrative generation failed",
					description: result.error,
					scope: "cqi-report:narrative",
				});
				return;
			}
			if (result.data.status !== "ok") {
				toast.create({
					title: "AI narrative unavailable",
					description:
						result.data.error ??
						result.data.reason ??
						"The report will print without an AI narrative.",
					type: "warning",
				});
			} else {
				toast.create({
					title: "Narrative saved as pending review",
					type: "success",
				});
			}
			await load(termId, programId);
		} finally {
			setGenerating(false);
		}
	}, [termId, programId, load]);

	const review = useCallback(
		async (status: "acknowledged" | "dismissed") => {
			if (!report?.narrative) return;
			const result = await reviewCqiNarrative(report.narrative.id, status);
			if (!result.ok) {
				toastError({
					title: "Review failed",
					description: result.error,
					scope: "cqi-report:review",
				});
				return;
			}
			toast.create({ title: "Review saved", type: "success" });
			await load(termId, programId);
		},
		[report, termId, programId, load],
	);

	const exportPdf = useCallback(async () => {
		if (!report) return;
		setExporting(true);
		try {
			const win = window.open("", "_blank");
			if (!win) {
				toastError({
					title: "Pop-up blocked",
					description: "Allow pop-ups for this site to view the PDF.",
					scope: "cqi-report:pdf",
				});
				return;
			}
			const [{ pdf }, { CqiInstitutionalPdf }] = await Promise.all([
				import("@react-pdf/renderer"),
				import("@/components/pdf/cqi-institutional-pdf"),
			]);
			const blob = await pdf(<CqiInstitutionalPdf report={report} />).toBlob();
			win.location.href = URL.createObjectURL(blob);
		} catch {
			toastError({
				title: "PDF export failed",
				description: "Could not build the institutional report PDF.",
				scope: "cqi-report:pdf",
			});
		} finally {
			setExporting(false);
		}
	}, [report]);

	const cloRows =
		report?.outcomes.filter((row) => row.outcomeType === "CLO") ?? [];
	const ploRows =
		report?.outcomes.filter((row) => row.outcomeType === "PLO") ?? [];
	const peoRows =
		report?.outcomes.filter((row) => row.outcomeType === "PEO") ?? [];
	const narrative = report?.narrative ?? null;

	return (
		<div className="m-6 space-y-4">
			<Frame>
				<FrameHeader>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<FrameTitle>CQI Institutional Report</FrameTitle>
							<FrameDescription>
								Institution-wide end-of-cycle report. Statistics are computed
								from stored attainment; the AI narrative is advisory.
							</FrameDescription>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<TermSelect
								className="w-56"
								value={termId}
								onValueChange={setTermId}
								placeholder="Select term"
							/>
							<ProgramSelect
								className="w-56"
								value={programId || undefined}
								onValueChange={setProgramId}
								placeholder="All programs"
							/>
							<Button
								variant="outline"
								onClick={() => void load(termId, programId)}
								disabled={loading}
							>
								{loading ? "Loading…" : "Refresh"}
							</Button>
							<Button
								onClick={() => void generate()}
								disabled={generating || !report}
							>
								{generating ? "Generating…" : "Generate AI narrative"}
							</Button>
							<Button
								variant="outline"
								onClick={() => void exportPdf()}
								disabled={exporting || !report}
							>
								{exporting ? "Building…" : "Export PDF"}
							</Button>
						</div>
					</div>
				</FrameHeader>
				<FramePanel>
					{error ? (
						<p className="text-destructive text-sm">{error}</p>
					) : !report ? (
						<p className="text-muted-foreground text-sm">
							{loading ? "Assembling report…" : "No report data for this term."}
						</p>
					) : (
						<div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm">
							<span>
								<strong className="text-foreground">Term:</strong>{" "}
								{report.term.schoolYear} {report.term.semester}
							</span>
							<span>
								<strong className="text-foreground">Programs:</strong>{" "}
								{report.scope.programs
									.map((program) => program.code)
									.join(", ") || "—"}
							</span>
							<span>
								<strong className="text-foreground">Sections:</strong>{" "}
								{report.scope.sections}
							</span>
							<span>
								<strong className="text-foreground">Generated:</strong>{" "}
								{new Date(report.generatedAt).toLocaleString()}
							</span>
						</div>
					)}
				</FramePanel>
			</Frame>

			{report ? (
				<>
					{/* 1. Executive summary */}
					<Frame>
						<FrameHeader>
							<FrameTitle>1. Executive Summary</FrameTitle>
							<FrameDescription>
								Assessment cycle, population, overall attainment, and priority
								areas.
							</FrameDescription>
						</FrameHeader>
						<FramePanel className="space-y-4">
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
								<Metric
									label="Enrolled"
									value={String(report.statistics.enrolledCount)}
								/>
								<Metric
									label="Assessed"
									value={String(report.statistics.assessedCount)}
								/>
								<Metric
									label="Mean composite"
									value={pct(report.statistics.meanPct)}
								/>
								<Metric
									label="Median composite"
									value={pct(report.statistics.medianPct)}
								/>
							</div>
							{report.programSummaries.length > 0 ? (
								<div className="rounded-md border p-3 text-sm">
									<p className="font-medium">Program-level at-risk</p>
									<ul className="text-muted-foreground mt-1 list-disc pl-5 text-sm">
										{report.programSummaries.map((program) => (
											<li key={program.programCode}>
												{program.programCode}: {program.atRiskCount}/
												{program.totalStudents} at-risk
											</li>
										))}
									</ul>
								</div>
							) : null}
							{narrative?.summary ? (
								<div className="rounded-md border p-3 text-sm">
									<p>{narrative.summary}</p>
									<p className="text-muted-foreground mt-2 text-xs">
										AI narrative · {narrative.status.replaceAll("_", " ")}
									</p>
								</div>
							) : (
								<p className="text-muted-foreground text-sm">
									No AI narrative has been generated for this term. The report
									still prints from computed data.
								</p>
							)}
							<div className="grid gap-4 lg:grid-cols-2">
								<FindingList
									title="Major strengths"
									findings={report.findings.strengths}
									empty="No outcome clears its target with a reportable group size."
								/>
								<FindingList
									title="Priority weaknesses"
									findings={report.findings.weaknesses}
									empty="No outcome is below its target with a reportable group size."
								/>
							</div>
						</FramePanel>
					</Frame>

					{/* 2. Scope and methodology */}
					<Frame>
						<FrameHeader>
							<FrameTitle>2. Assessment Scope and Methodology</FrameTitle>
							<FrameDescription>
								Population, thresholds, completeness, and limits of the
								evidence.
							</FrameDescription>
						</FrameHeader>
						<FramePanel className="space-y-4">
							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<tbody>
										<Row
											label="Academic period"
											value={`${report.term.schoolYear} ${report.term.semester}`}
										/>
										<Row
											label="Programs"
											value={
												report.scope.programs.map((p) => p.name).join("; ") ||
												"—"
											}
										/>
										<Row
											label="Sections / courses"
											value={`${report.scope.sections} section(s), ${report.scope.courses} course(s)`}
										/>
										<Row
											label="Enrolled vs assessed"
											value={`${report.scope.enrolledCount} enrolled / ${report.scope.assessedCount} assessed`}
										/>
										<Row
											label="Thresholds"
											value={report.scope.thresholds.targetSource}
										/>
										<Row
											label="Data completeness"
											value={`${pct(report.completeness.completenessPct)} of ${report.completeness.snapshotRecords} ETL record(s)`}
										/>
										<Row
											label="Incomplete records"
											value={String(report.completeness.incompleteRecords)}
										/>
										<Row
											label="Missing indirect ratings"
											value={String(report.completeness.missingIndirectRecords)}
										/>
									</tbody>
								</table>
							</div>
							{report.completeness.missingSections.length > 0 ? (
								<div className="rounded-md border border-dashed p-3 text-sm">
									<p className="font-medium">Missing / insufficient data</p>
									<ul className="text-muted-foreground mt-1 list-disc pl-5 text-xs">
										{report.completeness.missingSections.map((item) => (
											<li key={item}>{item}</li>
										))}
									</ul>
								</div>
							) : null}
						</FramePanel>
					</Frame>

					{/* 3. OBE alignment */}
					<Frame>
						<FrameHeader>
							<FrameTitle>3. OBE Alignment Analysis</FrameTitle>
							<FrameDescription>
								PEO attainment appears only where evidence exists. PLO
								direct/indirect values are derived from mapped CLOs.
							</FrameDescription>
						</FrameHeader>
						<FramePanel className="space-y-5">
							<div>
								<h3 className="mb-2 text-sm font-semibold">PEO attainment</h3>
								{peoRows.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										Not available — PEO attainment is not captured yet.
									</p>
								) : (
									<OutcomeTable rows={peoRows} />
								)}
							</div>
							<div>
								<h3 className="mb-2 text-sm font-semibold">PLO attainment</h3>
								<OutcomeTable rows={ploRows} />
							</div>
							<div>
								<h3 className="mb-2 text-sm font-semibold">CLO attainment</h3>
								<OutcomeTable rows={cloRows} />
							</div>
							<div>
								<h3 className="mb-2 text-sm font-semibold">
									Outcome status heatmap (program × status)
								</h3>
								<StatusHeatmap report={report} />
							</div>
						</FramePanel>
					</Frame>

					{/* 4. Statistics */}
					<Frame>
						<FrameHeader>
							<FrameTitle>4. Statistical and Student Performance</FrameTitle>
							<FrameDescription>
								Counts are students; percentages always carry their numerator
								and denominator.
							</FrameDescription>
						</FrameHeader>
						<FramePanel className="space-y-4">
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
								<Metric
									label="Assessed population"
									value={String(report.statistics.assessedCount)}
								/>
								<Metric
									label="Meeting expectations (≥70%)"
									value={`${report.statistics.meetingCount} of ${report.statistics.assessedCount}`}
								/>
								<Metric
									label="Below expectations"
									value={`${report.statistics.belowCount} of ${report.statistics.assessedCount}`}
								/>
								<Metric
									label="At-risk population"
									value={String(report.statistics.atRiskCount)}
								/>
								<Metric
									label="Mean composite"
									value={pct(report.statistics.meanPct)}
								/>
								<Metric
									label="Median composite"
									value={pct(report.statistics.medianPct)}
								/>
								<Metric
									label="Assessment records"
									value={String(report.statistics.recordCount)}
								/>
								<Metric
									label="Overall attainment"
									value={pct(report.statistics.attainmentPct)}
								/>
							</div>
							<div className="grid gap-4 lg:grid-cols-2">
								<div className="h-72">
									<ScoreBandBars
										data={report.statistics.distribution.map((bucket) => ({
											band: bucket.band as
												| "Exceptional (9-10)"
												| "Proficient (7-8)"
												| "Basic (6)"
												| "Below Basic (≤5)",
											studentCount: bucket.count,
										}))}
									/>
								</div>
								<div className="h-72">
									<LoopStatusDonut
										data={[
											{
												status: "CLOSED" as const,
												count: report.nextCycle.openLoops.closed,
											},
											{
												status: "OPEN — Re-assess" as const,
												count: report.nextCycle.openLoops.openReassess,
											},
											{
												status: "OPEN — Not Implemented" as const,
												count: report.nextCycle.openLoops.openNotImplemented,
											},
										]}
									/>
								</div>
							</div>
						</FramePanel>
					</Frame>

					{/* 5. Visualizations */}
					<Frame>
						<FrameHeader>
							<FrameTitle>5. Visualizations</FrameTitle>
							<FrameDescription>
								Aggregate outcome-level charts only — no student-level data.
							</FrameDescription>
						</FrameHeader>
						<FramePanel className="grid gap-4 lg:grid-cols-2">
							<div className="h-80">
								<CloAttainmentBars
									data={cloRows.map((row) => ({
										cloCode: row.code,
										cloDescription: row.description,
										directScorePct: row.directPct ?? undefined,
										indirectScorePct: row.indirectPct ?? undefined,
										compositeScorePct: row.compositePct ?? 0,
										isBelowThreshold: row.status !== "MET",
									}))}
								/>
							</div>
							<div className="h-80">
								<PloAttainmentBars
									data={ploRows.map((row) => ({
										ploCode: row.code,
										description: row.description,
										attainedPct: row.compositePct ?? 0,
										targetAttainmentPct: row.effectiveTargetPct,
										studentsBelowTargetCount: row.belowCount,
									}))}
								/>
							</div>
							<div className="h-80 lg:col-span-2">
								<h3 className="mb-2 text-sm font-semibold">
									Historical performance trend
								</h3>
								{report.priorComparisons.filter(
									(row) => row.direction !== "insufficient",
								).length === 0 ? (
									<p className="text-muted-foreground text-sm">
										Insufficient comparable data — at least two comparable
										cycles are required for a trend.
									</p>
								) : (
									<div className="overflow-x-auto">
										<table className="w-full text-sm">
											<thead>
												<tr className="text-muted-foreground border-b text-left">
													<th className="py-2 pr-4">Outcome</th>
													<th className="py-2 pr-4 text-right">Prior</th>
													<th className="py-2 pr-4 text-right">Current</th>
													<th className="py-2 pr-4 text-right">Delta</th>
												</tr>
											</thead>
											<tbody>
												{report.priorComparisons
													.filter((row) => row.direction !== "insufficient")
													.map((row) => (
														<tr
															key={row.outcomeKey}
															className="border-b last:border-0"
														>
															<td className="py-2 pr-4">{row.outcomeCode}</td>
															<td className="py-2 pr-4 text-right">
																{pct(row.priorPct)}
															</td>
															<td className="py-2 pr-4 text-right">
																{pct(row.currentPct)}
															</td>
															<td className="py-2 pr-4 text-right">
																{row.deltaPct === null
																	? "—"
																	: `${row.deltaPct > 0 ? "+" : ""}${row.deltaPct.toFixed(2)} pp`}
															</td>
														</tr>
													))}
											</tbody>
										</table>
									</div>
								)}
							</div>
						</FramePanel>
					</Frame>

					{/* 6. Institutional findings */}
					<Frame>
						<FrameHeader>
							<FrameTitle>6. Institutional Findings</FrameTitle>
							<FrameDescription>
								Established findings are computed. Hypotheses are explicitly
								pending Program Chair confirmation.
							</FrameDescription>
						</FrameHeader>
						<FramePanel className="space-y-5">
							<div className="grid gap-4 lg:grid-cols-2">
								<FindingList
									title="Established strengths"
									findings={report.findings.strengths}
									empty="None reportable."
								/>
								<FindingList
									title="Established weaknesses"
									findings={report.findings.weaknesses}
									empty="None reportable."
								/>
							</div>
							<div>
								<h3 className="text-sm font-semibold">
									Possible contributing factors (hypotheses)
								</h3>
								<p className="text-muted-foreground mb-2 text-xs">
									Pending Program Chair confirmation — not established findings.
								</p>
								{report.findings.hypotheses.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										No hypotheses have been generated. Generate the AI narrative
										to populate this section.
									</p>
								) : (
									<ul className="space-y-2">
										{report.findings.hypotheses.map((hypothesis) => (
											<li
												key={hypothesis.hypothesis}
												className="rounded-md border p-3 text-sm"
											>
												<div className="flex flex-wrap items-center gap-2">
													<Badge variant="warning-light">Hypothesis</Badge>
													<span className="text-muted-foreground text-xs">
														{hypothesis.rootCauseCategory}
													</span>
												</div>
												<p className="mt-1">{hypothesis.hypothesis}</p>
											</li>
										))}
									</ul>
								)}
							</div>
						</FramePanel>
					</Frame>

					{/* 7. Recommendations */}
					<Frame>
						<FrameHeader>
							<FrameTitle>
								7. CQI Recommendations and Intervention Plans
							</FrameTitle>
							<FrameDescription>
								AI recommendations are proposed, pending faculty review.
								Existing interventions and proposed additions are shown
								separately.
							</FrameDescription>
						</FrameHeader>
						<FramePanel className="space-y-4">
							{narrative ? (
								<div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
									<span className="font-medium">AI narrative:</span>
									{statusBadge(narrative.status)}
									<span className="text-muted-foreground text-xs">
										{narrative.recommendations.length} recommendation(s)
									</span>
									<div className="ml-auto flex gap-2">
										<Button
											size="sm"
											variant="outline"
											onClick={() => void review("acknowledged")}
											disabled={narrative.status === "acknowledged"}
										>
											Approve
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => void review("dismissed")}
											disabled={narrative.status === "dismissed"}
										>
											Dismiss
										</Button>
									</div>
								</div>
							) : null}
							{narrative?.recommendations.length ? (
								narrative.recommendations.map((recommendation, index) => (
									<div
										key={`${recommendation.problem}-${index}`}
										className="rounded-md border p-3 text-sm"
									>
										<div className="flex flex-wrap items-center gap-2">
											<Badge variant="info-light">
												Proposed, pending faculty review
											</Badge>
											<span className="text-muted-foreground text-xs">
												{recommendation.responsible_role}
												{recommendation.timeline
													? ` · ${recommendation.timeline}`
													: ""}
											</span>
										</div>
										<p className="mt-2 font-medium">{recommendation.problem}</p>
										<dl className="mt-2 space-y-2">
											<div>
												<dt className="text-muted-foreground text-xs uppercase">
													Existing intervention assessment
												</dt>
												<dd>
													{recommendation.existing_intervention_assessment ??
														"None supplied."}
												</dd>
											</div>
											<div>
												<dt className="text-muted-foreground text-xs uppercase">
													Proposed additions
												</dt>
												<dd>{recommendation.proposed_additions}</dd>
											</div>
											<div>
												<dt className="text-muted-foreground text-xs uppercase">
													Success indicator / verification
												</dt>
												<dd>
													{recommendation.success_indicator} ·{" "}
													{recommendation.verification_method}
													{recommendation.target !== null
														? ` · target ${recommendation.target.toFixed(2)}%`
														: ""}
												</dd>
											</div>
										</dl>
									</div>
								))
							) : (
								<p className="text-muted-foreground text-sm">
									No AI recommendations stored. Existing CQI interventions are
									listed under Section 8.
								</p>
							)}
						</FramePanel>
					</Frame>

					{/* 8. Previous CQI effectiveness */}
					<Frame>
						<FrameHeader>
							<FrameTitle>8. Previous CQI Effectiveness Evaluation</FrameTitle>
							<FrameDescription>
								Prior vs current attainment and loop status. KPI achievement is
								not machine-verifiable because the KPI is free text.
							</FrameDescription>
						</FrameHeader>
						<FramePanel>
							{report.previousCqi.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									Insufficient data — no CQI action entries are recorded for
									this cycle.
								</p>
							) : (
								<div className="overflow-x-auto">
									<table className="w-full text-sm">
										<thead>
											<tr className="text-muted-foreground border-b text-left">
												<th className="py-2 pr-4">Outcome</th>
												<th className="py-2 pr-4">Prior</th>
												<th className="py-2 pr-4">Current</th>
												<th className="py-2 pr-4">Delta</th>
												<th className="py-2 pr-4">Implemented</th>
												<th className="py-2 pr-4">Loop</th>
												<th className="py-2 pr-4">Owner role</th>
											</tr>
										</thead>
										<tbody>
											{report.previousCqi.map((entry) => (
												<tr
													key={entry.entryId}
													className="border-b last:border-0"
												>
													<td className="py-2 pr-4 font-medium">
														{entry.outcomeCode}
													</td>
													<td className="py-2 pr-4">
														{pct(entry.priorAttainmentPct)}
													</td>
													<td className="py-2 pr-4">
														{pct(entry.currentAttainmentPct)}
													</td>
													<td className="py-2 pr-4">
														{entry.deltaPct === null
															? "—"
															: `${entry.deltaPct > 0 ? "+" : ""}${entry.deltaPct.toFixed(2)} pp`}
													</td>
													<td className="py-2 pr-4 capitalize">
														{entry.implementationStatus ?? "not recorded"}
													</td>
													<td className="py-2 pr-4">
														{entry.loopStatus?.replaceAll("_", " ") ?? "—"}
													</td>
													<td className="py-2 pr-4">
														{entry.ownerRole || "—"}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</FramePanel>
					</Frame>

					{/* 9. Conclusion */}
					<Frame>
						<FrameHeader>
							<FrameTitle>9. Conclusion and Next-Cycle Priorities</FrameTitle>
							<FrameDescription>
								Computed from prior-vs-current values, open loops, escalations,
								and priority weaknesses.
							</FrameDescription>
						</FrameHeader>
						<FramePanel className="space-y-4">
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
								<Metric
									label="Intervention completion"
									value={
										report.nextCycle.interventionCompletion.ratePct === null
											? "—"
											: pct(report.nextCycle.interventionCompletion.ratePct)
									}
								/>
								<Metric
									label="Open loops"
									value={String(
										report.nextCycle.openLoops.openReassess +
											report.nextCycle.openLoops.openNotImplemented,
									)}
								/>
								<Metric
									label="Escalated outcomes"
									value={String(report.nextCycle.escalatedOutcomes.length)}
								/>
								<Metric
									label="Previously MET, now below"
									value={String(report.nextCycle.previouslyMetDeclining.length)}
								/>
							</div>
							{report.nextCycle.previouslyMetDeclining.length > 0 ? (
								<p className="text-sm">
									<strong>Declined below the floor:</strong>{" "}
									{report.nextCycle.previouslyMetDeclining.join(", ")}
								</p>
							) : null}
							<FindingList
								title="Recommended next-cycle priorities"
								findings={report.nextCycle.priorities}
								empty="No computed priority exceeds the reporting threshold."
							/>
						</FramePanel>
					</Frame>

					{/* 10. Appendices */}
					<Frame>
						<FrameHeader>
							<FrameTitle>10. Appendices and Supporting Evidence</FrameTitle>
							<FrameDescription>
								Outcome mapping, computation runs, and validation records.
							</FrameDescription>
						</FrameHeader>
						<FramePanel className="space-y-4 text-sm">
							<div>
								<h3 className="mb-1 font-semibold">
									Statistical computation details
								</h3>
								<p className="text-muted-foreground">
									Attainment values are read from the latest persisted
									computation run per section. No 70/30 composite is
									recalculated in the webapp. Status uses the stricter of the{" "}
									{report.scope.thresholds.floorPct}% floor and the F04 target.
								</p>
							</div>
							<div>
								<h3 className="mb-1 font-semibold">Data validation records</h3>
								<ul className="text-muted-foreground list-disc pl-5 text-xs">
									<li>
										{report.completeness.incompleteRecords} incomplete ETL
										record(s)
									</li>
									<li>
										{report.completeness.missingIndirectRecords} missing
										indirect rating(s)
									</li>
									<li>
										{report.completeness.missingTargets.length} outcome(s)
										without an F04 target
									</li>
									<li>
										{report.scope.computationRunIds.length} computation run(s)
										included
									</li>
								</ul>
							</div>
							<div>
								<h3 className="mb-1 font-semibold">Computation run ids</h3>
								<p className="text-muted-foreground text-xs break-all">
									{report.scope.computationRunIds.join(", ")}
								</p>
							</div>
						</FramePanel>
					</Frame>
				</>
			) : null}
		</div>
	);
}
