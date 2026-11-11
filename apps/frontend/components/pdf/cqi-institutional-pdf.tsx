/**
 * Print layout for the institution-wide CQI report.
 *
 * NOTE: react-pdf primitives only — the web charts cannot be embedded, so the
 * visualization section prints from the SVG chart helpers in `cqi-pdf-charts`.
 */

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { CqiReport, ReportFinding } from "@/server/actions/reports";

import {
	AlignmentGrid,
	AttainmentChart,
	DeltaChart,
	DistributionChart,
	StatusStackedChart,
} from "./cqi-pdf-charts";

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
	section: { marginBottom: 12 },
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
	table: { borderWidth: 0.5, borderColor: "#d1d5db", marginTop: 6 },
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
	draftBanner: {
		fontSize: 8,
		color: "#b45309",
		marginTop: 3,
		textTransform: "uppercase",
		letterSpacing: 0.6,
	},
	draftNotice: {
		position: "absolute",
		bottom: 26,
		left: 0,
		right: 0,
		textAlign: "center",
		fontSize: 6.5,
		color: "#b45309",
		letterSpacing: 0.4,
		textTransform: "uppercase",
	},
	prototypeNotice: {
		position: "absolute",
		bottom: 40,
		left: 0,
		right: 0,
		textAlign: "center",
		fontSize: 6,
		color: "#6b7280",
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
				const rows = report.outcomes.filter((row) => row.outcomeType === type);
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

/** CLO→PLO mapping table — the OBE alignment evidence. */
function AlignmentTable({ report }: { report: CqiReport }) {
	if (report.alignment.mappings.length === 0) {
		return <Text style={styles.note}>No CLO→PLO mappings recorded.</Text>;
	}
	return (
		<View style={styles.table}>
			<View style={styles.tableHeaderRow}>
				<Text style={styles.headerCell}>Course / CLO</Text>
				<Text style={styles.headerCell}>PLO</Text>
				<Text style={styles.headerCellRight}>Weight</Text>
				<Text style={styles.headerCell}>Stage</Text>
			</View>
			{report.alignment.mappings.map((mapping) => (
				<View
					key={`${mapping.programCode}-${mapping.courseCode}-${mapping.cloCode}-${mapping.ploCode}`}
					style={styles.tableRow}
					wrap={false}
				>
					<Text style={styles.cell}>
						{mapping.courseCode} / {mapping.cloCode}
					</Text>
					<Text style={styles.cell}>{mapping.ploCode}</Text>
					<Text style={styles.cellRight}>
						{mapping.weight === null ? "—" : mapping.weight.toFixed(1)}
					</Text>
					<Text style={styles.cell}>{mapping.stage ?? "—"}</Text>
				</View>
			))}
		</View>
	);
}

/** CLO × PLO heatmap: a filled cell means the pair is mapped. */
/** Prior vs current; non-comparable rows carry their reason instead of a delta. */
function TrendTable({
	comparisons,
	priorTermLabel,
}: {
	comparisons: CqiReport["priorComparisons"];
	priorTermLabel: string | null;
}) {
	if (comparisons.length === 0) {
		return (
			<Text style={styles.note}>
				No current outcomes to compare — a trend needs at least two cycles.
			</Text>
		);
	}
	return (
		<View>
			<Text style={styles.note}>
				Prior cycle:{" "}
				{priorTermLabel ?? "no earlier term with stored attainment"}.
			</Text>
			<View style={styles.table}>
				<View style={styles.tableHeaderRow}>
					<Text style={styles.headerCell}>Outcome</Text>
					<Text style={styles.headerCellRight}>Prior</Text>
					<Text style={styles.headerCellRight}>Current</Text>
					<Text style={styles.headerCellRight}>Delta</Text>
					<Text style={styles.headerCell}>Comparability</Text>
				</View>
				{comparisons.map((row) => (
					<View key={row.outcomeKey} style={styles.tableRow} wrap={false}>
						<Text style={styles.cell}>{row.outcomeCode}</Text>
						<Text style={styles.cellRight}>
							{row.comparable ? pct(row.priorPct) : "—"}
						</Text>
						<Text style={styles.cellRight}>{pct(row.currentPct)}</Text>
						<Text style={styles.cellRight}>
							{row.comparable ? delta(row.deltaPct) : "not comparable"}
						</Text>
						<Text style={styles.cell}>
							{row.comparable ? "same outcome, both cycles" : row.reason}
						</Text>
					</View>
				))}
			</View>
		</View>
	);
}

export function CqiInstitutionalPdf({ report }: { report: CqiReport }) {
	const cloRows = report.outcomes.filter((row) => row.outcomeType === "CLO");
	const ploRows = report.outcomes.filter((row) => row.outcomeType === "PLO");
	const peoRows = report.outcomes.filter((row) => row.outcomeType === "PEO");
	const notMetRows = report.outcomes.filter((row) => row.status === "NOT MET");
	const narrative = report.narrative;
	const priorTermLabel = report.priorTerm
		? `${report.priorTerm.schoolYear} ${report.priorTerm.semester}`
		: null;

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
				<Text style={styles.draftBanner}>
					DRAFT — subject to faculty review
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
					<KV
						label="Enrolled students"
						value={String(report.statistics.enrolledCount)}
					/>
					<KV
						label="Assessed students"
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
						label="Performance distribution (student-CLO records)"
						value={report.statistics.distribution
							.map((bucket) => `${bucket.band}: ${bucket.count}`)
							.join(" · ")}
					/>
					<Text style={styles.sectionTitle}>Findings at a glance</Text>
					<KV
						label="Major strengths"
						value={`${report.findings.strengths.length} reportable — see Section 6`}
					/>
					<KV
						label="Priority weaknesses"
						value={`${report.findings.weaknesses.length} shown of ${notMetRows.length} NOT MET — see Section 6 and Appendix 10`}
					/>
					<KV
						label="Next-cycle priorities"
						value={`${report.nextCycle.priorities.length} priority outcome(s) — see Section 9`}
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
						label="Enrolled vs assessed students"
						value={`${report.scope.enrolledCount} enrolled / ${report.scope.assessedCount} assessed`}
					/>
					<KV label="Thresholds" value={report.scope.thresholds.targetSource} />
					<KV
						label="F04 target source"
						value={
							report.scope.thresholds.targetForm
								? `${report.scope.thresholds.targetForm.id} · recorded ${new Date(report.scope.thresholds.targetForm.createdAt).toLocaleDateString()}`
								: "No approved F04 matrix"
						}
					/>
					<KV
						label="Latest computation runs"
						value={
							report.scope.computationRuns
								.map(
									(run) =>
										`${run.scope} · ${new Date(run.runAt).toLocaleString()}`,
								)
								.join("; ") || "—"
						}
					/>
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
					{narrative?.dataLimitations.length ? (
						<>
							<Text style={styles.sectionTitle}>Data limitations</Text>
							{narrative.dataLimitations.map((item) => (
								<View key={item} style={styles.bullet}>
									<Text style={styles.bulletDot}>•</Text>
									<Text style={{ flex: 1 }}>{item}</Text>
								</View>
							))}
						</>
					) : null}
				</View>

				{/* 3. OBE alignment */}
				<View style={styles.section} break>
					<Text style={styles.sectionTitle}>3. OBE Alignment Analysis</Text>
					<Text style={styles.cardTitle}>PEO attainment</Text>
					{peoRows.length === 0 ? (
						<Text style={styles.note}>
							Not available — PEO attainment is not captured for this term.
						</Text>
					) : peoRows.every((row) => row.status === "NOT AVAILABLE") ? (
						<Text style={styles.note}>
							No evidence captured — PEO assessment is out of scope for this
							prototype.
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
					<Text style={styles.note}>
						N = student-CLO records for CLOs; mapped CLO means for PLOs.
					</Text>
					<Text style={styles.cardTitle}>Outcome status by program</Text>
					<StatusHeatmap report={report} />
					<StatusStackedChart report={report} />
					<Text style={styles.note}>
						Green: MET · red: NOT MET · grey: not available; counts shown as MET
						/ NOT MET / not available.
					</Text>
					<Text style={styles.cardTitle}>CLO→PLO mapping</Text>
					<AlignmentTable report={report} />
					<Text style={styles.cardTitle}>Alignment heatmap</Text>
					<AlignmentGrid report={report} />
					<Text style={styles.note}>
						Filled cell: mapped pair · grey cell: gap.
					</Text>
					<Text style={styles.cardTitle}>Unmapped / uncovered outcomes</Text>
					{report.alignment.unmappedClos.length === 0 &&
					report.alignment.unmappedPlos.length === 0 ? (
						<Text style={styles.note}>
							Every CLO in this term maps to a PLO, and every program PLO has at
							least one mapped CLO.
						</Text>
					) : (
						<View>
							{report.alignment.unmappedClos.map((item) => (
								<View
									key={`${item.programCode}-${item.courseCode}-${item.cloCode}`}
									style={styles.bullet}
								>
									<Text style={styles.bulletDot}>•</Text>
									<Text style={{ flex: 1 }}>
										Unmapped CLO: {item.programCode} {item.courseCode}{" "}
										{item.cloCode}
									</Text>
								</View>
							))}
							{report.alignment.unmappedPlos.map((item) => (
								<View
									key={`${item.programCode}-${item.ploCode}`}
									style={styles.bullet}
								>
									<Text style={styles.bulletDot}>•</Text>
									<Text style={{ flex: 1 }}>
										Uncovered PLO: {item.programCode} {item.ploCode}
									</Text>
								</View>
							))}
						</View>
					)}
				</View>

				{/* 4. Statistics */}
				<View style={styles.section} break>
					<Text style={styles.sectionTitle}>
						4. Statistical and Student Performance
					</Text>
					<KV
						label="Meeting expectations (at least 70%)"
						value={`${report.statistics.meetingCount} of ${report.statistics.assessedCount} assessed student(s)`}
					/>
					<KV
						label="Below expectations (student mean below 70%)"
						value={`${report.statistics.belowCount} of ${report.statistics.assessedCount} assessed student(s)`}
					/>
					<KV
						label="At-risk population (any mapped CLO below 70%)"
						value={`${report.statistics.atRiskCount} of ${report.statistics.enrolledCount} enrolled student(s) (${pct(report.statistics.atRiskRatePct)})`}
					/>
					<KV
						label="Assessment records"
						value={`${report.statistics.recordCount} student-CLO record(s)`}
					/>
					<KV
						label="Score distribution (student-CLO records)"
						value={report.statistics.distribution
							.map((bucket) => `${bucket.band}: ${bucket.count}`)
							.join(" · ")}
					/>
				</View>

				{/* 5. Visualizations */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>5. Visualizations</Text>
					<Text style={styles.note}>
						Composite attainment (bar) against target (line); green = MET, red =
						NOT MET. Labels read attained [target].
					</Text>
					<AttainmentChart rows={[...cloRows, ...ploRows]} />
					<Text style={styles.cardTitle}>
						Performance distribution (student-CLO records)
					</Text>
					<DistributionChart buckets={report.statistics.distribution} />
					<Text style={styles.cardTitle}>Historical performance trend</Text>
					<DeltaChart comparisons={report.priorComparisons} />
					<Text style={styles.note}>
						Delta in percentage points against the prior cycle; only outcomes
						assessed in both cycles are charted.
					</Text>
					<TrendTable
						comparisons={report.priorComparisons}
						priorTermLabel={priorTermLabel}
					/>
				</View>

				{/* 6. Institutional findings */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>6. Institutional Findings</Text>
					<Text style={styles.cardTitle}>Established strengths</Text>
					<FindingBlock findings={report.findings.strengths} />
					<Text style={styles.cardTitle}>Established weaknesses</Text>
					<Text style={styles.note}>
						Showing top {report.findings.weaknesses.length} of{" "}
						{notMetRows.length} NOT MET outcome(s). The full list is in Appendix
						10.
					</Text>
					<FindingBlock findings={report.findings.weaknesses} />
					<Text style={styles.cardTitle}>
						Possible contributing factors (pending Program Chair confirmation)
					</Text>
					{report.findings.hypotheses.length === 0 ? (
						<Text style={styles.note}>No hypotheses recorded.</Text>
					) : (
						report.findings.hypotheses.map((hypothesis) => (
							<View
								key={hypothesis.hypothesis}
								style={styles.card}
								wrap={false}
							>
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
									Proposed, pending faculty review ·{" "}
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
				<View style={styles.section} break>
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
										{entry.outcomeStillNotMet ? " · still NOT MET" : ""}
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
								<View
									key={`${entry.entryId}-evidence`}
									style={[styles.card, { marginBottom: 2, padding: 3 }]}
								>
									<Text style={[styles.cardTitle, { fontSize: 8 }]}>
										{entry.outcomeCode}
									</Text>
									<Text style={{ fontSize: 8 }}>
										{entry.intervention.slice(0, 200) || "—"}
									</Text>
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
						value={
							report.nextCycle.interventionCompletion.ratePct === null
								? "—"
								: `${pct(report.nextCycle.interventionCompletion.ratePct)} · ${report.nextCycle.interventionCompletion.completedEquivalent} of ${report.nextCycle.interventionCompletion.tracked} tracked interventions (${report.nextCycle.interventionCompletion.implemented} implemented, ${report.nextCycle.interventionCompletion.partial} partial at half credit, ${report.nextCycle.interventionCompletion.notImplemented} not implemented, ${report.nextCycle.interventionCompletion.notRecorded} not recorded)`
						}
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
						value={report.nextCycle.previouslyMetDeclining.join(", ") || "None"}
					/>
					<Text style={styles.sectionTitle}>Priority outcome codes</Text>
					<Text>
						{report.nextCycle.priorities.length === 0
							? "No computed priority exceeds the reporting threshold."
							: report.nextCycle.priorities
									.map((finding) => finding.outcomeCode)
									.join(", ")}
					</Text>
					<Text style={styles.note}>
						Full statements are in Section 6; this section adds only next-cycle
						actions and loop status.
					</Text>
				</View>

				{/* 10. Appendices */}
				<View style={styles.section} break>
					<Text style={styles.sectionTitle}>
						10. Appendices and Supporting Evidence
					</Text>
					<Text style={styles.paragraph}>
						Attainment values are read from the latest persisted computation run
						per section. No 70/30 composite is recalculated in the webapp;
						status uses the stricter of the {report.scope.thresholds.floorPct}%
						floor and the F04 target.
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
					<Text style={styles.cardTitle}>
						All NOT MET outcomes ({notMetRows.length})
					</Text>
					<OutcomeTable rows={notMetRows} />
					<Text style={styles.cardTitle}>Data limitations</Text>
					{narrative?.dataLimitations.length ? (
						narrative.dataLimitations.map((item) => (
							<View key={item} style={styles.bullet}>
								<Text style={styles.bulletDot}>•</Text>
								<Text style={{ flex: 1 }}>{item}</Text>
							</View>
						))
					) : (
						<Text style={styles.note}>No AI-reported data limitations.</Text>
					)}
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
								<View
									key={`${entry.entryId}-row`}
									style={styles.tableRow}
									wrap={false}
								>
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
						{report.scope.computationRuns
							.map(
								(run) =>
									`${run.id} (${run.scope}) · ${new Date(run.runAt).toLocaleString()}`,
							)
							.join("; ") || "—"}
					</Text>
				</View>

				{/* Closing page — AI summary before signatures */}
				<View break>
					<Text style={styles.sectionTitle}>
						Closing Summary and Signatures
					</Text>
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
					<View style={styles.footer} wrap={false}>
						<Text style={styles.note}>
							Prepared from stored attainment records. AI narrative is advisory
							and requires human approval before adoption.
						</Text>
						<View style={styles.signatureGrid}>
							{[
								{ role: "Prepared by", name: "Quality Assurance (AQAU)" },
								{
									role: "Reviewed by",
									name: "Vice President, Academic Affairs",
								},
								{
									role: "Noted by",
									name: "Institutional Assessment Committee",
								},
							].map((signature) => (
								<View key={signature.role} style={styles.signatureCol}>
									<View style={styles.signatureLine} />
									<Text style={styles.signatureRole}>{signature.name}</Text>
									<Text style={styles.signatureNote}>{signature.role}</Text>
								</View>
							))}
						</View>
					</View>
				</View>

				<Text fixed style={styles.draftNotice}>
					DRAFT — subject to faculty review · Generated{" "}
					{new Date(report.generatedAt).toLocaleString()} ·{" "}
					{report.term.schoolYear} {report.term.semester}
				</Text>
				<Text fixed style={styles.prototypeNotice}>
					Research prototype. Synthetic data. Not actual institutional
					attainment.
				</Text>
				<Text fixed style={styles.pageNumber}>
					CQI Institutional Report · {report.term.schoolYear}{" "}
					{report.term.semester}
				</Text>
			</Page>
		</Document>
	);
}
