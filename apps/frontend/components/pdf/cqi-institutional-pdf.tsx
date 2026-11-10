/**
 * Print layout for the institution-wide CQI report.
 *
 * NOTE: react-pdf primitives only — the web charts cannot be embedded, so the
 * visualization section prints as comparison bars drawn with plain views.
 */

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { CqiReport, ReportFinding } from "@/server/actions/reports";

const styles = StyleSheet.create({
	page: {
		paddingTop: 36,
		paddingHorizontal: 32,
		paddingBottom: 36,
		fontFamily: "Helvetica",
		fontSize: 8.5,
		lineHeight: 1.35,
		color: "#1f2937",
	},
	brand: {
		fontSize: 7,
		letterSpacing: 1,
		color: "#6b7280",
		textTransform: "uppercase",
	},
	institution: { fontFamily: "Helvetica-Bold", fontSize: 13, marginTop: 2 },
	title: { fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 10 },
	meta: { fontSize: 8, color: "#6b7280", marginTop: 2 },
	divider: {
		borderBottomWidth: 1,
		borderBottomColor: "#d1d5db",
		marginTop: 8,
		marginBottom: 8,
	},
	section: { marginTop: 12 },
	sectionTitle: {
		fontFamily: "Helvetica-Bold",
		fontSize: 10,
		color: "#111827",
		marginBottom: 3,
	},
	paragraph: { marginBottom: 3 },
	note: { fontSize: 8, color: "#6b7280", fontStyle: "italic" },
	kv: {
		flexDirection: "row",
		paddingVertical: 2,
		borderBottomWidth: 0.5,
		borderBottomColor: "#e5e7eb",
	},
	kvLabel: { width: "34%", color: "#4b5563", paddingRight: 8 },
	kvValue: { width: "66%" },
	table: { borderWidth: 0.5, borderColor: "#d1d5db", marginTop: 2 },
	tableHeaderRow: { flexDirection: "row", backgroundColor: "#f3f4f6" },
	tableRow: {
		flexDirection: "row",
		borderTopWidth: 0.5,
		borderTopColor: "#d1d5db",
	},
	cell: { flex: 1, padding: 3, fontSize: 7.5 },
	cellRight: { flex: 1, padding: 3, fontSize: 7.5, textAlign: "right" },
	headerCell: {
		flex: 1,
		padding: 3,
		fontSize: 7.5,
		fontFamily: "Helvetica-Bold",
	},
	headerCellRight: {
		flex: 1,
		padding: 3,
		fontSize: 7.5,
		fontFamily: "Helvetica-Bold",
		textAlign: "right",
	},
	bullet: { flexDirection: "row", paddingVertical: 1 },
	bulletDot: { width: 8 },
	card: {
		borderWidth: 0.5,
		borderColor: "#d1d5db",
		padding: 5,
		marginBottom: 4,
	},
	cardTitle: { fontFamily: "Helvetica-Bold", fontSize: 8.5 },
	barTrack: {
		height: 6,
		backgroundColor: "#e5e7eb",
		marginVertical: 2,
		flexDirection: "row",
	},
	barFill: { height: 6, backgroundColor: "#4b5563" },
	barTarget: { height: 6, backgroundColor: "#9ca3af" },
	footer: {
		marginTop: 18,
		paddingTop: 6,
		borderTopWidth: 1,
		borderTopColor: "#d1d5db",
	},
	signatureGrid: { flexDirection: "row", marginTop: 10 },
	signatureCol: { flex: 1, paddingRight: 12 },
	signatureLine: {
		borderTopWidth: 0.5,
		borderTopColor: "#9ca3af",
		marginTop: 26,
		paddingTop: 3,
	},
	signatureRole: { fontFamily: "Helvetica-Bold", fontSize: 8 },
	signatureNote: { fontSize: 7.5, color: "#6b7280" },
	pageNumber: {
		position: "absolute",
		bottom: 16,
		left: 0,
		right: 0,
		textAlign: "center",
		fontSize: 7,
		color: "#9ca3af",
	},
});

function pct(value: number | null | undefined): string {
	return value === null || value === undefined ? "—" : `${value.toFixed(2)}%`;
}

function delta(value: number | null): string {
	if (value === null) return "—";
	return `${value > 0 ? "+" : ""}${value.toFixed(2)} pp`;
}

function KV({ label, value }: { label: string; value: string }) {
	return (
		<View style={styles.kv}>
			<Text style={styles.kvLabel}>{label}</Text>
			<Text style={styles.kvValue}>{value}</Text>
		</View>
	);
}

function FindingBlock({ findings }: { findings: ReportFinding[] }) {
	if (findings.length === 0) {
		return <Text style={styles.note}>None reportable.</Text>;
	}
	return (
		<View>
			{findings.map((finding) => (
				<View key={finding.outcomeKey} style={styles.card} wrap={false}>
					<Text style={styles.cardTitle}>
						{finding.outcomeCode} · {finding.priority.toUpperCase()}
					</Text>
					<Text>{finding.statement}</Text>
					<Text style={styles.note}>{finding.evidence}</Text>
				</View>
			))}
		</View>
	);
}

function OutcomeTable({ rows }: { rows: CqiReport["outcomes"] }) {
	if (rows.length === 0) return <Text style={styles.note}>No data.</Text>;
	return (
		<View style={styles.table}>
			<View style={styles.tableHeaderRow}>
				<Text style={styles.headerCell}>Outcome</Text>
				<Text style={styles.headerCell}>Program</Text>
				<Text style={styles.headerCellRight}>Target</Text>
				<Text style={styles.headerCellRight}>Direct</Text>
				<Text style={styles.headerCellRight}>Indirect</Text>
				<Text style={styles.headerCellRight}>Composite</Text>
				<Text style={styles.headerCellRight}>N</Text>
				<Text style={styles.headerCell}>Status</Text>
			</View>
			{rows.map((row) => (
				<View key={row.key} style={styles.tableRow} wrap={false}>
					<Text style={styles.cell}>
						{row.code}
						{row.derived ? " (derived)" : ""}
					</Text>
					<Text style={styles.cell}>{row.programCode}</Text>
					<Text style={styles.cellRight}>{pct(row.effectiveTargetPct)}</Text>
					<Text style={styles.cellRight}>{pct(row.directPct)}</Text>
					<Text style={styles.cellRight}>{pct(row.indirectPct)}</Text>
					<Text style={styles.cellRight}>{pct(row.compositePct)}</Text>
					<Text style={styles.cellRight}>{row.assessedCount}</Text>
					<Text style={styles.cell}>{row.status}</Text>
				</View>
			))}
		</View>
	);
}

/** Simple 0-100 bars: composite (dark) against the effective target (light). */
function AttainmentBars({ rows }: { rows: CqiReport["outcomes"] }) {
	const scored = rows.filter((row) => row.compositePct !== null).slice(0, 12);
	if (scored.length === 0) return <Text style={styles.note}>No data.</Text>;
	return (
		<View>
			{scored.map((row) => (
				<View key={row.key} style={{ marginBottom: 3 }}>
					<Text>
						{row.code} · {pct(row.compositePct)} / target{" "}
						{pct(row.effectiveTargetPct)}
					</Text>
					<View style={styles.barTrack}>
						<View
							style={[
								styles.barFill,
								{ width: `${Math.max(0, Math.min(100, row.compositePct ?? 0))}%` },
							]}
						/>
					</View>
					<View style={styles.barTrack}>
						<View
							style={[
								styles.barTarget,
								{
									width: `${Math.max(0, Math.min(100, row.effectiveTargetPct))}%`,
								},
							]}
						/>
					</View>
				</View>
			))}
		</View>
	);
}

/** Coverage per outcome level — how much of the OBE chain has evidence. */
function OutcomeCoverage({ report }: { report: CqiReport }) {
	return (
		<View style={styles.table}>
			<View style={styles.tableHeaderRow}>
				<Text style={styles.headerCell}>Outcome level</Text>
				<Text style={styles.headerCellRight}>Outcomes</Text>
				<Text style={styles.headerCellRight}>MET</Text>
				<Text style={styles.headerCellRight}>NOT MET</Text>
				<Text style={styles.headerCellRight}>Not available</Text>
			</View>
			{(["PEO", "PLO", "CLO"] as const).map((type) => {
				const rows = report.outcomes.filter(
					(row) => row.outcomeType === type,
				);
				return (
					<View key={type} style={styles.tableRow} wrap={false}>
						<Text style={styles.cell}>{type}</Text>
						<Text style={styles.cellRight}>{rows.length}</Text>
						<Text style={styles.cellRight}>
							{rows.filter((row) => row.status === "MET").length}
						</Text>
						<Text style={styles.cellRight}>
							{rows.filter((row) => row.status === "NOT MET").length}
						</Text>
						<Text style={styles.cellRight}>
							{rows.filter((row) => row.status === "NOT AVAILABLE").length}
						</Text>
					</View>
				);
			})}
		</View>
	);
}

/** Program × status counts — the report's alignment heatmap. */
function StatusHeatmap({ report }: { report: CqiReport }) {
	if (report.scope.programs.length === 0) {
		return <Text style={styles.note}>No data.</Text>;
	}
	return (
		<View style={styles.table}>
			<View style={styles.tableHeaderRow}>
				<Text style={styles.headerCell}>Program</Text>
				<Text style={styles.headerCellRight}>MET</Text>
				<Text style={styles.headerCellRight}>NOT MET</Text>
				<Text style={styles.headerCellRight}>Not available</Text>
			</View>
			{report.scope.programs.map((program) => {
				const rows = report.outcomes.filter(
					(row) => row.programCode === program.code,
				);
				return (
					<View key={program.code} style={styles.tableRow} wrap={false}>
						<Text style={styles.cell}>{program.code}</Text>
						<Text style={styles.cellRight}>
							{rows.filter((row) => row.status === "MET").length}
						</Text>
						<Text style={styles.cellRight}>
							{rows.filter((row) => row.status === "NOT MET").length}
						</Text>
						<Text style={styles.cellRight}>
							{rows.filter((row) => row.status === "NOT AVAILABLE").length}
						</Text>
					</View>
				);
			})}
		</View>
	);
}

/** Count bars per score band, scaled to the largest bucket. */
function DistributionBars({
	buckets,
}: {
	buckets: CqiReport["statistics"]["distribution"];
}) {
	const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
	return (
		<View>
			{buckets.map((bucket) => (
				<View key={bucket.band} style={{ marginBottom: 3 }}>
					<Text>
						{bucket.band} · {bucket.count}
					</Text>
					<View style={styles.barTrack}>
						<View
							style={[
								styles.barFill,
								{ width: `${(bucket.count / max) * 100}%` },
							]}
						/>
					</View>
				</View>
			))}
		</View>
	);
}

/** Prior vs current, only rows with comparable data. */
function TrendTable({
	comparisons,
}: {
	comparisons: CqiReport["priorComparisons"];
}) {
	const rows = comparisons.filter(
		(row) => row.direction !== "insufficient",
	);
	if (rows.length === 0) {
		return (
			<Text style={styles.note}>
				Insufficient comparable data — at least two comparable cycles are
				required for a trend.
			</Text>
		);
	}
	return (
		<View style={styles.table}>
			<View style={styles.tableHeaderRow}>
				<Text style={styles.headerCell}>Outcome</Text>
				<Text style={styles.headerCellRight}>Prior</Text>
				<Text style={styles.headerCellRight}>Current</Text>
				<Text style={styles.headerCellRight}>Delta</Text>
			</View>
			{rows.map((row) => (
				<View key={row.outcomeKey} style={styles.tableRow} wrap={false}>
					<Text style={styles.cell}>{row.outcomeCode}</Text>
					<Text style={styles.cellRight}>{pct(row.priorPct)}</Text>
					<Text style={styles.cellRight}>{pct(row.currentPct)}</Text>
					<Text style={styles.cellRight}>{delta(row.deltaPct)}</Text>
				</View>
			))}
		</View>
	);
}

export function CqiInstitutionalPdf({ report }: { report: CqiReport }) {
	const cloRows = report.outcomes.filter((row) => row.outcomeType === "CLO");
	const ploRows = report.outcomes.filter((row) => row.outcomeType === "PLO");
	const peoRows = report.outcomes.filter((row) => row.outcomeType === "PEO");
	const narrative = report.narrative;

	return (
		<Document
			author="Obelisk"
			subject="CQI Institutional Report"
			title={`CQI Institutional Report - ${report.term.schoolYear} ${report.term.semester}`}
		>
			<Page size="A4" style={styles.page} wrap>
				<Text style={styles.brand}>Obelisk · Outcome-Based Education</Text>
				<Text style={styles.institution}>
					Jose Maria College Foundation, Inc.
				</Text>
				<Text style={styles.title}>CQI Institutional Report</Text>
				<Text style={styles.meta}>
					{report.term.schoolYear} {report.term.semester} · generated{" "}
					{new Date(report.generatedAt).toLocaleString()}
				</Text>
				<Text style={styles.meta}>
					Programs:{" "}
					{report.scope.programs.map((program) => program.code).join(", ") ||
						"—"}
				</Text>

				<View style={styles.divider} />

				{/* 1. Executive summary */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>1. Executive Summary</Text>
					<KV label="Enrolled" value={String(report.statistics.enrolledCount)} />
					<KV
						label="Assessed"
						value={String(report.statistics.assessedCount)}
					/>
					<KV label="Mean composite" value={pct(report.statistics.meanPct)} />
					<KV
						label="Median composite"
						value={pct(report.statistics.medianPct)}
					/>
					{narrative?.summary ? (
						<View style={styles.card}>
							<Text>{narrative.summary}</Text>
							<Text style={styles.note}>
								AI narrative · {narrative.status.replaceAll("_", " ")}
							</Text>
						</View>
					) : (
						<Text style={styles.note}>
							No AI narrative generated. This report is still valid; it prints
							from computed data only.
						</Text>
					)}
					<KV
						label="Performance distribution"
						value={report.statistics.distribution
							.map((bucket) => `${bucket.band}: ${bucket.count}`)
							.join(" · ")}
					/>
					<Text style={styles.sectionTitle}>Major strengths</Text>
					<FindingBlock findings={report.findings.strengths} />
					<Text style={styles.sectionTitle}>Priority weaknesses</Text>
					<FindingBlock findings={report.findings.weaknesses} />
					<Text style={styles.sectionTitle}>Priority improvement areas</Text>
					<FindingBlock
						findings={
							report.nextCycle.priorities.length > 0
								? report.nextCycle.priorities
								: report.findings.weaknesses
						}
					/>
				</View>

				{/* 2. Scope and methodology */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>
						2. Assessment Scope and Methodology
					</Text>
					<KV
						label="Programs"
						value={
							report.scope.programs.map((program) => program.name).join("; ") ||
							"—"
						}
					/>
					<KV
						label="Sections / courses"
						value={`${report.scope.sections} section(s), ${report.scope.courses} course(s)`}
					/>
					<KV
						label="Enrolled vs assessed"
						value={`${report.scope.enrolledCount} enrolled / ${report.scope.assessedCount} assessed`}
					/>
					<KV label="Thresholds" value={report.scope.thresholds.targetSource} />
					<KV
						label="Assessment instruments"
						value="Direct course-level CLO assessment and indirect perception-survey ratings, combined 70/30 where both exist."
					/>
					<KV
						label="Method"
						value={`Attainment read from the latest saved computation run per section; status uses the stricter of the ${report.scope.thresholds.floorPct}% floor and the F04 target on the rounded composite.`}
					/>
					<KV
						label="Data completeness"
						value={`${pct(report.completeness.completenessPct)} of ${report.completeness.snapshotRecords} ETL record(s)`}
					/>
					<KV
						label="Incomplete records"
						value={String(report.completeness.incompleteRecords)}
					/>
					<KV
						label="Missing indirect ratings"
						value={String(report.completeness.missingIndirectRecords)}
					/>
					{report.completeness.missingSections.map((item) => (
						<View key={item} style={styles.bullet}>
							<Text style={styles.bulletDot}>•</Text>
							<Text style={{ flex: 1 }}>{item}</Text>
						</View>
					))}
				</View>

				{/* 3. OBE alignment */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>3. OBE Alignment Analysis</Text>
					<Text style={styles.cardTitle}>PEO attainment</Text>
					{peoRows.length === 0 ? (
						<Text style={styles.note}>
							Not available — PEO attainment is not captured for this term.
						</Text>
					) : (
						<OutcomeTable rows={peoRows} />
					)}
					<Text style={styles.cardTitle}>PLO attainment</Text>
					<OutcomeTable rows={ploRows} />
					<Text style={styles.cardTitle}>CLO attainment</Text>
					<OutcomeTable rows={cloRows} />
					<Text style={styles.cardTitle}>Outcome coverage</Text>
					<OutcomeCoverage report={report} />
					<Text style={styles.cardTitle}>Outcome status by program</Text>
					<StatusHeatmap report={report} />
				</View>

				{/* 4. Statistics */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>
						4. Statistical and Student Performance
					</Text>
					<KV
						label="Meeting expectations (≥70%)"
						value={`${report.statistics.meetingCount} of ${report.statistics.assessedCount}`}
					/>
					<KV
						label="Below expectations"
						value={`${report.statistics.belowCount} of ${report.statistics.assessedCount}`}
					/>
					<KV
						label="Assessment records"
						value={String(report.statistics.recordCount)}
					/>
					<KV
						label="Score distribution"
						value={report.statistics.distribution
							.map((bucket) => `${bucket.band}: ${bucket.count}`)
							.join(" · ")}
					/>
				</View>

				{/* 5. Visualizations */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>5. Visualizations</Text>
					<Text style={styles.note}>
						Composite attainment against target; bars are drawn from the same
						persisted values as the tables.
					</Text>
					<AttainmentBars rows={[...cloRows, ...ploRows]} />
					<Text style={styles.cardTitle}>Performance distribution</Text>
					<DistributionBars buckets={report.statistics.distribution} />
					<Text style={styles.cardTitle}>Historical performance trend</Text>
					<TrendTable comparisons={report.priorComparisons} />
				</View>

				{/* 6. Institutional findings */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>6. Institutional Findings</Text>
					<Text style={styles.cardTitle}>Established strengths</Text>
					<FindingBlock findings={report.findings.strengths} />
					<Text style={styles.cardTitle}>Established weaknesses</Text>
					<FindingBlock findings={report.findings.weaknesses} />
					<Text style={styles.cardTitle}>
						Possible contributing factors (pending Program Chair confirmation)
					</Text>
					{report.findings.hypotheses.length === 0 ? (
						<Text style={styles.note}>No hypotheses recorded.</Text>
					) : (
						report.findings.hypotheses.map((hypothesis) => (
							<View key={hypothesis.hypothesis} style={styles.card} wrap={false}>
								<Text style={styles.note}>{hypothesis.rootCauseCategory}</Text>
								<Text>{hypothesis.hypothesis}</Text>
							</View>
						))
					)}
				</View>

				{/* 7. Recommendations */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>
						7. CQI Recommendations and Intervention Plans
					</Text>
					<Text style={styles.note}>
						AI recommendations are proposals pending faculty review — never
						approved automatically.
					</Text>
					{narrative?.recommendations.length ? (
						narrative.recommendations.map((recommendation, index) => (
							<View
								key={`${recommendation.problem}-${index}`}
								style={styles.card}
								wrap={false}
							>
								<Text style={styles.cardTitle}>{recommendation.problem}</Text>
								<Text style={styles.note}>
									{recommendation.responsible_role}
									{recommendation.timeline
										? ` · ${recommendation.timeline}`
										: ""}
								</Text>
								<Text>
									Existing intervention assessment:{" "}
									{recommendation.existing_intervention_assessment ??
										"None supplied."}
								</Text>
								<Text>
									Proposed additions: {recommendation.proposed_additions}
								</Text>
								<Text>
									Success indicator: {recommendation.success_indicator} ·{" "}
									{recommendation.verification_method}
									{recommendation.target === null
										? ""
										: ` · target ${recommendation.target.toFixed(2)}%`}
								</Text>
								{recommendation.evidence_fact_ids.length > 0 ? (
									<Text style={styles.note}>
										Evidence: {recommendation.evidence_fact_ids.join(", ")}
									</Text>
								) : null}
							</View>
						))
					) : (
						<Text style={styles.note}>
							No stored AI recommendations. Existing interventions are listed
							under Section 8.
						</Text>
					)}
				</View>

				{/* 8. Previous CQI effectiveness */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>
						8. Previous CQI Effectiveness Evaluation
					</Text>
					<Text style={styles.note}>
						KPI achievement is not machine-verifiable — the KPI is recorded as
						free text.
					</Text>
					{report.previousCqi.length === 0 ? (
						<Text style={styles.note}>
							Insufficient data — no CQI action entries recorded for this cycle.
						</Text>
					) : (
						<View style={styles.table}>
							<View style={styles.tableHeaderRow}>
								<Text style={styles.headerCell}>Outcome</Text>
								<Text style={styles.headerCellRight}>Prior</Text>
								<Text style={styles.headerCellRight}>Current</Text>
								<Text style={styles.headerCellRight}>Delta</Text>
								<Text style={styles.headerCell}>Implemented</Text>
								<Text style={styles.headerCell}>Loop</Text>
								<Text style={styles.headerCell}>Owner role</Text>
							</View>
							{report.previousCqi.map((entry) => (
								<View key={entry.entryId} style={styles.tableRow} wrap={false}>
									<Text style={styles.cell}>{entry.outcomeCode}</Text>
									<Text style={styles.cellRight}>
										{pct(entry.priorAttainmentPct)}
									</Text>
									<Text style={styles.cellRight}>
										{pct(entry.currentAttainmentPct)}
									</Text>
									<Text style={styles.cellRight}>{delta(entry.deltaPct)}</Text>
									<Text style={styles.cell}>
										{entry.implementationStatus ?? "not recorded"}
									</Text>
									<Text style={styles.cell}>
										{entry.loopStatus?.replaceAll("_", " ") ?? "—"}
									</Text>
									<Text style={styles.cell}>{entry.ownerRole || "—"}</Text>
								</View>
							))}
						</View>
					)}
					{report.previousCqi.length > 0 ? (
						<View style={styles.section}>
							<Text style={styles.cardTitle}>
								Implementation evidence and KPI (free text)
							</Text>
							{report.previousCqi.map((entry) => (
								<View key={`${entry.entryId}-evidence`} style={styles.card}>
									<Text style={styles.cardTitle}>{entry.outcomeCode}</Text>
									<Text>{entry.intervention.slice(0, 200) || "—"}</Text>
									<Text style={styles.note}>
										KPI / timeline: {entry.timelineAndKpi.slice(0, 120) || "—"}
									</Text>
								</View>
							))}
						</View>
					) : null}
				</View>

				{/* 9. Conclusion */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>
						9. Conclusion and Next-Cycle Priorities
					</Text>
					<KV
						label="Intervention completion"
						value={pct(report.nextCycle.interventionCompletion.ratePct)}
					/>
					<KV
						label="Open loops"
						value={`${report.nextCycle.openLoops.openReassess} re-assess, ${report.nextCycle.openLoops.openNotImplemented} not implemented`}
					/>
					<KV
						label="Escalated outcomes"
						value={String(report.nextCycle.escalatedOutcomes.length)}
					/>
					<KV
						label="Previously MET, now below"
						value={
							report.nextCycle.previouslyMetDeclining.join(", ") || "None"
						}
					/>
					<FindingBlock findings={report.nextCycle.priorities} />
				</View>

				{/* 10. Appendices */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>
						10. Appendices and Supporting Evidence
					</Text>
					<Text style={styles.paragraph}>
						Attainment values are read from the latest persisted computation run
						per section. No 70/30 composite is recalculated in the webapp; status
						uses the stricter of the {report.scope.thresholds.floorPct}% floor and
						the F04 target.
					</Text>
					<KV
						label="Computation runs"
						value={String(report.scope.computationRunIds.length)}
					/>
					<KV
						label="Outcomes lacking F04 target"
						value={
							report.completeness.missingTargets.length === 0
								? "None"
								: `${report.completeness.missingTargets.length} (${report.completeness.missingTargets.slice(0, 8).join(", ")}${report.completeness.missingTargets.length > 8 ? ", …" : ""})`
						}
					/>
					<Text style={styles.cardTitle}>CQI intervention records</Text>
					{report.previousCqi.length === 0 ? (
						<Text style={styles.note}>No CQI entries recorded.</Text>
					) : (
						<View style={styles.table}>
							<View style={styles.tableHeaderRow}>
								<Text style={styles.headerCell}>No.</Text>
								<Text style={styles.headerCell}>Outcome</Text>
								<Text style={styles.headerCell}>Loop</Text>
								<Text style={styles.headerCell}>Owner role</Text>
								<Text style={styles.headerCell}>KPI / timeline</Text>
							</View>
							{report.previousCqi.map((entry, index) => (
								<View key={`${entry.entryId}-row`} style={styles.tableRow} wrap={false}>
									<Text style={styles.cell}>
										{String(index + 1).padStart(2, "0")}
									</Text>
									<Text style={styles.cell}>{entry.outcomeCode}</Text>
									<Text style={styles.cell}>
										{entry.loopStatus?.replaceAll("_", " ") ?? "—"}
									</Text>
									<Text style={styles.cell}>{entry.ownerRole || "—"}</Text>
									<Text style={styles.cell}>
										{entry.timelineAndKpi.slice(0, 80) || "—"}
									</Text>
								</View>
							))}
						</View>
					)}
					<Text style={styles.cardTitle}>Computation runs</Text>
					<Text style={styles.note}>
						{report.scope.computationRunIds.join(", ")}
					</Text>
				</View>

				<View style={styles.footer} wrap={false}>
					<Text style={styles.note}>
						Prepared from stored attainment records. AI narrative is advisory and
						requires human approval before adoption.
					</Text>
					<View style={styles.signatureGrid}>
						{[
							{ role: "Prepared by", name: "Quality Assurance (AQAU)" },
							{ role: "Reviewed by", name: "Vice President, Academic Affairs" },
							{ role: "Noted by", name: "Institutional Assessment Committee" },
						].map((signature) => (
							<View key={signature.role} style={styles.signatureCol}>
								<View style={styles.signatureLine} />
								<Text style={styles.signatureRole}>{signature.name}</Text>
								<Text style={styles.signatureNote}>{signature.role}</Text>
							</View>
						))}
					</View>
				</View>

				<Text fixed style={styles.pageNumber}>
					CQI Institutional Report · {report.term.schoolYear}{" "}
					{report.term.semester}
				</Text>
			</Page>
		</Document>
	);
}
