/**
 * Manual-format PDF for one CQI & Loop form submission.
 *
 * NOTE: fed the by-id payload the form screen already renders (`/cqi/...` or
 * `/atrisk/action`) — the CQI tables live in relational rows, so the
 * submission record alone would print empty sections.
 */

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

import {
	APAR_ATTACHMENT_LABELS,
	APAR_NARRATIVE_LABELS,
} from "@/lib/constants/obe";
import { roleLabel, type UserRole } from "@/lib/roles";
import {
	FORM_STATUS_LABELS,
	type FormSubmissionRecord,
} from "@/lib/store/atoms/forms";

import {
	ManualFooter,
	ManualHeader,
	ManualPrototypeNotice,
	SignatureBlock,
} from "./manual-chrome";

const styles = StyleSheet.create({
	page: {
		paddingTop: 36,
		paddingHorizontal: 32,
		paddingBottom: 48,
		fontFamily: "Helvetica",
		fontSize: 8,
		lineHeight: 1.35,
		color: "#1f2937",
	},
	section: { marginBottom: 10 },
	sectionTitle: {
		fontFamily: "Helvetica-Bold",
		fontSize: 9.5,
		color: "#111827",
		borderBottomWidth: 0.5,
		borderBottomColor: "#d1d5db",
		paddingBottom: 2,
		marginBottom: 4,
	},
	paragraph: { fontSize: 8, marginBottom: 3 },
	note: { fontSize: 7.5, color: "#6b7280", fontStyle: "italic" },
	kv: {
		flexDirection: "row",
		paddingVertical: 2,
		borderBottomWidth: 0.5,
		borderBottomColor: "#e5e7eb",
	},
	kvLabel: { width: "32%", color: "#4b5563", paddingRight: 8 },
	kvValue: { width: "68%" },
	table: { borderWidth: 0.5, borderColor: "#d1d5db", marginTop: 4 },
	tableHeaderRow: { flexDirection: "row", backgroundColor: "#f3f4f6" },
	tableRow: {
		flexDirection: "row",
		borderTopWidth: 0.5,
		borderTopColor: "#d1d5db",
	},
	cell: { padding: 3, fontSize: 7 },
	headerCell: { padding: 3, fontSize: 7, fontFamily: "Helvetica-Bold" },
	alignRight: { textAlign: "right" },
	total: {
		fontSize: 7.5,
		fontFamily: "Helvetica-Bold",
		marginTop: 3,
		textAlign: "right",
	},
});

// --- Payload subsets (mirror the form components' inline payload types) --------

interface PloSummary {
	ploCode: string;
	ploDescription: string;
	programAvgPct: number | null;
	notMetCohorts: number;
	status: string;
}

interface GapRow {
	ploCode: string;
	cohortYearLevel: number | null;
	attainmentPct: number;
	rootCauseCategory: string | null;
	rootCauseAnalysis: string | null;
	namedOwner: string | null;
}

interface GapPayload {
	generatedAt: string;
	program: { code: string; name: string };
	term: { schoolYear: string; semester: string };
	plos: PloSummary[];
	gapRows: GapRow[];
	programChairSummary: string | null;
}

interface CqiEntry {
	ploCode: string;
	evidenceSource: string;
	priorAttainmentPct: number | null;
	rootCauseCategory: string;
	intervention: string;
	owner: string;
	timelineAndKpi: string;
	status: string;
	interventionImplemented?: "yes" | "partial" | "no";
	currentAttainmentPct?: number | null;
}

interface PlanPayload {
	generatedAt: string;
	program: { code: string; name: string };
	term: { schoolYear: string; semester: string };
	entries: CqiEntry[];
}

interface CtlRow {
	ploCode: string;
	gapFindingAndEvidence: string;
	priorAttainmentPct: number | null;
	currentAttainmentPct: number | null;
	conditions12Met: boolean;
	condition3Met: boolean;
	condition4Met: boolean;
	condition5Met: boolean;
	loopStatus: string;
}

interface CtlPayload {
	generatedAt: string;
	program: { code: string; name: string };
	term: { schoolYear: string; semester: string };
	rows: CtlRow[];
	identify: {
		c1PriorCycleKpisAchieved: string | null;
		c2PreviouslyMetDeclining: string | null;
		c3ExternalShifts: string | null;
		c4ProactiveImprovements: string | null;
	};
}

interface AparKpiRow {
	kpiCode: string;
	kpiLabel: string;
	description: string;
	value: number | null;
	target: number;
	status: string;
}

interface AparPayload {
	generatedAt: string;
	program: { code: string; name: string };
	term: { schoolYear: string; semester: string } | null;
	kpis: AparKpiRow[];
	attachments: Record<string, boolean>;
	narratives: Record<string, string | null>;
	dueDate: string;
}

// --- Formatting helpers --------------------------------------------------------

function pct(value: number | null | undefined): string {
	return value === null || value === undefined ? "—" : `${value.toFixed(2)}%`;
}

function text(value: string | null | undefined): string {
	return value === null || value === undefined || value.trim() === ""
		? "—"
		: value;
}

function cohortLabel(year: number | null): string {
	return year === null || year === 0 ? "Unknown" : `Y${year}`;
}

function ploStatusLabel(status: string): string {
	if (status === "all_met") return "ALL MET";
	if (status === "partial") return "PARTIAL";
	if (status === "not_met") return "NOT MET";
	return status.replaceAll("_", " ").toUpperCase();
}

function loopStatusLabel(status: string): string {
	if (status === "closed") return "CLOSED";
	if (status === "open_reassess") return "OPEN — Re-assess";
	return "OPEN — Not Implemented";
}

function conditionLabel(met: boolean): string {
	return met ? "MET" : "NOT MET";
}

function implementedLabel(value: CqiEntry["interventionImplemented"]): string {
	if (value === "yes") return "Yes";
	if (value === "partial") return "Partial";
	if (value === "no") return "No";
	return "Not tracked";
}

// --- Layout primitives ---------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<View style={styles.section}>
			<Text style={styles.sectionTitle}>{title}</Text>
			{children}
		</View>
	);
}

function KV({ label, value }: { label: string; value: string }) {
	return (
		<View style={styles.kv}>
			<Text style={styles.kvLabel}>{label}</Text>
			<Text style={styles.kvValue}>{value}</Text>
		</View>
	);
}

interface Column {
	label: string;
	width: string;
	right?: boolean;
}

function Table({
	columns,
	rows,
	empty,
}: {
	columns: Column[];
	rows: string[][];
	empty?: string;
}) {
	if (rows.length === 0) {
		return <Text style={styles.note}>{empty ?? "None recorded."}</Text>;
	}
	return (
		<View style={styles.table}>
			<View style={styles.tableHeaderRow}>
				{columns.map((column) => (
					<Text
						key={column.label}
						style={[
							styles.headerCell,
							{ width: column.width },
							column.right ? styles.alignRight : {},
						]}
					>
						{column.label}
					</Text>
				))}
			</View>
			{rows.map((row, index) => (
				<View key={index} style={styles.tableRow} wrap={false}>
					{columns.map((column, cellIndex) => (
						<Text
							key={column.label}
							style={[
								styles.cell,
								{ width: column.width },
								column.right ? styles.alignRight : {},
							]}
						>
							{row[cellIndex] ?? "—"}
						</Text>
					))}
				</View>
			))}
		</View>
	);
}

function Missing() {
	return (
		<Text style={styles.note}>
			Form content could not be loaded for this submission.
		</Text>
	);
}

// --- Section bodies ------------------------------------------------------------

function GapBody({ payload }: { payload: unknown }) {
	const data = payload as GapPayload | null;
	if (!data) return <Missing />;
	return (
		<>
			<Section title="1. Program and Term">
				<KV
					label="Program"
					value={`${data.program.code} — ${data.program.name}`}
				/>
				<KV
					label="Academic term"
					value={`${data.term.schoolYear} ${data.term.semester}`}
				/>
				<KV
					label="Generated"
					value={new Date(data.generatedAt).toLocaleString()}
				/>
			</Section>

			<Section title="2. PLO Attainment Summary">
				<Table
					columns={[
						{ label: "PLO", width: "9%" },
						{ label: "Description", width: "39%" },
						{ label: "Program Average", width: "16%", right: true },
						{ label: "Cohorts NOT MET", width: "14%", right: true },
						{ label: "Status", width: "22%" },
					]}
					rows={data.plos.map((plo) => [
						plo.ploCode,
						plo.ploDescription,
						pct(plo.programAvgPct),
						String(plo.notMetCohorts),
						ploStatusLabel(plo.status),
					])}
					empty="No PLO attainment recorded for this term."
				/>
			</Section>

			<Section title="3. Gap Analysis Matrix">
				<Table
					columns={[
						{ label: "PLO", width: "9%" },
						{ label: "Cohort", width: "8%" },
						{ label: "Attainment", width: "10%", right: true },
						{ label: "Root Cause Category", width: "18%" },
						{ label: "Root Cause Analysis", width: "37%" },
						{ label: "Named Owner", width: "18%" },
					]}
					rows={data.gapRows.map((row) => [
						row.ploCode,
						cohortLabel(row.cohortYearLevel),
						pct(row.attainmentPct),
						text(row.rootCauseCategory),
						text(row.rootCauseAnalysis),
						text(row.namedOwner),
					])}
					empty="No PLO/cohort gap below the floor."
				/>
				{data.gapRows.length > 0 ? (
					<Text style={styles.total}>
						TOTAL GAPS RECORDED: {data.gapRows.length}
					</Text>
				) : null}
			</Section>

			<Section title="4. Program Chair Summary">
				<Text style={styles.paragraph}>{text(data.programChairSummary)}</Text>
			</Section>
		</>
	);
}

function PlanBody({ payload }: { payload: unknown }) {
	const data = payload as PlanPayload | null;
	if (!data) return <Missing />;
	const tracked = data.entries.filter((entry) => entry.status === "tracked");
	return (
		<>
			<Section title="1. Program and Term">
				<KV
					label="Program"
					value={`${data.program.code} — ${data.program.name}`}
				/>
				<KV
					label="Academic term"
					value={`${data.term.schoolYear} ${data.term.semester}`}
				/>
				<KV
					label="Generated"
					value={new Date(data.generatedAt).toLocaleString()}
				/>
			</Section>

			<Section title="2. CQI Action Plan Entries">
				<Table
					columns={[
						{ label: "No.", width: "5%" },
						{ label: "PLO", width: "7%" },
						{ label: "Evidence Source", width: "15%" },
						{ label: "Prior", width: "7%", right: true },
						{ label: "Root Cause", width: "15%" },
						{ label: "Specific Intervention", width: "19%" },
						{ label: "Named Owner", width: "12%" },
						{ label: "Timeline & KPI", width: "13%" },
						{ label: "Status", width: "7%" },
					]}
					rows={data.entries.map((entry, index) => [
						String(index + 1).padStart(2, "0"),
						entry.ploCode,
						text(entry.evidenceSource),
						pct(entry.priorAttainmentPct),
						text(entry.rootCauseCategory),
						text(entry.intervention),
						text(entry.owner),
						text(entry.timelineAndKpi),
						entry.status,
					])}
					empty="No open PLO/cohort gaps to plan for."
				/>
				<Text style={styles.total}>TOTAL ENTRIES: {data.entries.length}</Text>
			</Section>

			<Section title="3. Completion Tracking">
				<Table
					columns={[
						{ label: "No.", width: "10%" },
						{ label: "PLO", width: "20%" },
						{ label: "Status", width: "18%" },
						{ label: "Implemented", width: "22%" },
						{ label: "Current Attainment", width: "30%", right: true },
					]}
					rows={data.entries.map((entry, index) => [
						String(index + 1).padStart(2, "0"),
						entry.ploCode,
						entry.status,
						implementedLabel(entry.interventionImplemented),
						pct(entry.currentAttainmentPct),
					])}
					empty="No entries to track."
				/>
				<Text style={styles.total}>
					TRACKED: {tracked.length} OF {data.entries.length} ENTRIES
				</Text>
			</Section>
		</>
	);
}

function CtlBody({ payload }: { payload: unknown }) {
	const data = payload as CtlPayload | null;
	if (!data) return <Missing />;
	const closed = data.rows.filter((row) => row.loopStatus === "closed").length;
	return (
		<>
			<Section title="1. Program and Term">
				<KV
					label="Program"
					value={`${data.program.code} — ${data.program.name}`}
				/>
				<KV
					label="Academic term"
					value={`${data.term.schoolYear} ${data.term.semester}`}
				/>
				<KV
					label="Generated"
					value={new Date(data.generatedAt).toLocaleString()}
				/>
			</Section>

			<Section title="2. Identify (Next-Cycle Input)">
				<KV
					label="C1 — Prior-cycle KPIs achieved"
					value={text(data.identify.c1PriorCycleKpisAchieved)}
				/>
				<KV
					label="C2 — Previously MET, now declining"
					value={text(data.identify.c2PreviouslyMetDeclining)}
				/>
				<KV
					label="C3 — External shifts"
					value={text(data.identify.c3ExternalShifts)}
				/>
				<KV
					label="C4 — Proactive improvements"
					value={text(data.identify.c4ProactiveImprovements)}
				/>
			</Section>

			<Section title="3. Condition Verification">
				<Table
					columns={[
						{ label: "PLO", width: "8%" },
						{ label: "Gap Finding and Evidence", width: "32%" },
						{ label: "C1–C2", width: "8%" },
						{ label: "C3", width: "7%" },
						{ label: "C4", width: "7%" },
						{ label: "C5", width: "7%" },
						{ label: "Prior", width: "8%", right: true },
						{ label: "Current", width: "8%", right: true },
						{ label: "Loop Status", width: "15%" },
					]}
					rows={data.rows.map((row) => [
						row.ploCode,
						text(row.gapFindingAndEvidence),
						conditionLabel(row.conditions12Met),
						conditionLabel(row.condition3Met),
						conditionLabel(row.condition4Met),
						conditionLabel(row.condition5Met),
						pct(row.priorAttainmentPct),
						pct(row.currentAttainmentPct),
						loopStatusLabel(row.loopStatus),
					])}
					empty="No open CQI loops for this term."
				/>
			</Section>

			<Section title="4. Loop Closure Summary">
				<KV label="Loops closed" value={`${closed} of ${data.rows.length}`} />
				<KV
					label="Loops still open"
					value={String(data.rows.length - closed)}
				/>
			</Section>
		</>
	);
}

function AparBody({ payload }: { payload: unknown }) {
	const data = payload as AparPayload | null;
	if (!data) return <Missing />;
	const narratives = Object.entries(data.narratives ?? {});
	return (
		<>
			<Section title="1. Program and Term">
				<KV
					label="Program"
					value={`${data.program.code} — ${data.program.name}`}
				/>
				<KV
					label="Academic term"
					value={
						data.term
							? `${data.term.schoolYear} ${data.term.semester}`
							: "Full academic year"
					}
				/>
				<KV label="Due date" value={data.dueDate} />
				<KV
					label="Generated"
					value={new Date(data.generatedAt).toLocaleString()}
				/>
			</Section>

			<Section title="2. KPI Attainment">
				<Table
					columns={[
						{ label: "Code", width: "9%" },
						{ label: "KPI", width: "26%" },
						{ label: "Description", width: "35%" },
						{ label: "Value", width: "8%", right: true },
						{ label: "Target", width: "8%", right: true },
						{ label: "Status", width: "14%" },
					]}
					rows={data.kpis.map((kpi) => [
						kpi.kpiCode,
						kpi.kpiLabel,
						kpi.description,
						pct(kpi.value),
						pct(kpi.target),
						kpi.status,
					])}
					empty="No KPI values recorded."
				/>
			</Section>

			<Section title="3. Attachments Checklist">
				<Table
					columns={[
						{ label: "Attachment", width: "80%" },
						{ label: "Attached", width: "20%" },
					]}
					rows={Object.entries(data.attachments ?? {}).map(
						([key, attached]) => [
							APAR_ATTACHMENT_LABELS[key] ?? key,
							attached ? "Yes" : "No",
						],
					)}
					empty="No attachment checklist recorded."
				/>
			</Section>

			<Section title="4. Narrative Sections">
				{narratives.length === 0 ? (
					<Text style={styles.note}>No narrative sections recorded.</Text>
				) : (
					narratives.map(([key, value]) => (
						<View key={key} style={{ marginBottom: 5 }}>
							<Text style={styles.headerCell}>
								{APAR_NARRATIVE_LABELS[key] ?? key}
							</Text>
							<Text style={styles.paragraph}>{text(value)}</Text>
						</View>
					))
				)}
			</Section>
		</>
	);
}

function ActionTakenBody({ submission }: { submission: FormSubmissionRecord }) {
	const data = (submission.formData ?? {}) as {
		studentIds?: unknown;
		actionTaken?: unknown;
	};
	const studentIds = Array.isArray(data.studentIds)
		? data.studentIds.filter(
				(value): value is string => typeof value === "string",
			)
		: [];
	const actionTaken =
		typeof data.actionTaken === "string" ? data.actionTaken : "";
	return (
		<>
			<Section title="1. Record">
				<KV label="Status" value={FORM_STATUS_LABELS[submission.status]} />
				<KV label="Prepared by" value={submission.submittedBy?.name ?? "—"} />
				<KV
					label="Updated"
					value={new Date(submission.updatedAt).toLocaleString()}
				/>
			</Section>

			<Section title="2. At-Risk Coverage">
				<KV label="Students covered" value={String(studentIds.length)} />
				<Text style={styles.note}>
					Student identifiers are cleared from the at-risk watchlist when this
					record receives final approval.
				</Text>
			</Section>

			<Section title="3. Intervention Recorded">
				<Text style={styles.paragraph}>{text(actionTaken)}</Text>
			</Section>
		</>
	);
}

// --- Per-code document spec ----------------------------------------------------

interface FormSpec {
	evidenceType: string;
	purpose: string;
	printedRules: string;
	signatures: { role: string; name: string }[];
	body: (payload: unknown, submission: FormSubmissionRecord) => ReactNode;
}

const SPECS: Record<string, FormSpec> = {
	plo_gap_analysis: {
		evidenceType: "Direct",
		purpose:
			"Records each PLO's cohort attainment, flags every PLO below the 70% floor, and captures the root cause and named owner for each gap. Feeds the CQI Action Plan.",
		printedRules:
			"PLO floor ≥ 70%. Gap rows are derived from stored attainment — never entered by hand. A PLO/cohort below the floor is NOT MET.",
		signatures: [
			{ role: "Prepared by (Program Chair)", name: "Program Chair" },
			{ role: "Reviewed by (Dean)", name: "Dean" },
			{ role: "Received by (AQAU)", name: "Quality Assurance (AQAU)" },
		],
		body: (payload) => <GapBody payload={payload} />,
	},
	cqi_action_plan: {
		evidenceType: "Direct",
		purpose:
			"Records one intervention entry per PLO/cohort gap: root cause, specific intervention, named owner, timeline and KPI. Feeds the Closing-the-Loop report.",
		printedRules:
			"One entry per PLO/cohort gap. Prior attainment comes from the gap matrix. CQI entry is due within 4 weeks of the gap.",
		signatures: [
			{ role: "Prepared by (Program Chair)", name: "Program Chair" },
			{ role: "Approved by (Dean)", name: "Dean" },
			{ role: "Received by (AQAU)", name: "Quality Assurance (AQAU)" },
		],
		body: (payload) => <PlanBody payload={payload} />,
	},
	closing_the_loop: {
		evidenceType: "Direct + Indirect",
		purpose:
			"Verifies whether each intervention closed its gap and records the five-condition loop status, then carries the identify step into the next cycle.",
		printedRules:
			"A loop is CLOSED only when all five conditions are met; otherwise OPEN — Re-assess or OPEN — Not Implemented. Loop status is computed server-side.",
		signatures: [
			{ role: "Prepared by (Program Chair)", name: "Program Chair" },
			{ role: "Validated by (AQAU)", name: "Quality Assurance (AQAU)" },
			{ role: "Noted by (VPAA)", name: "Vice President, Academic Affairs" },
		],
		body: (payload) => <CtlBody payload={payload} />,
	},
	annual_program_report: {
		evidenceType: "Direct + Perception",
		purpose:
			"Consolidates the program's annual KPI attainment, required attachments and narrative sections for review and institutional reporting.",
		printedRules:
			"All attainment floors ≥ 70%. Submission is blocked unless the Cohort Tracking Sheet is attached. Due June 30.",
		signatures: [
			{ role: "Prepared by (Program Chair)", name: "Program Chair" },
			{ role: "Reviewed by (Dean)", name: "Dean" },
			{ role: "Approved by (VPAA)", name: "Vice President, Academic Affairs" },
		],
		body: (payload) => <AparBody payload={payload} />,
	},
	action_taken: {
		evidenceType: "Direct",
		purpose:
			"Records the intervention carried out for at-risk students (any CLO below 70%) and the students it covered. Final approval clears the at-risk flags.",
		printedRules:
			"At-risk means any CLO score below 70%. Final approval clears the flagged students; flags are never cleared earlier.",
		signatures: [
			{ role: "Prepared by (Faculty / Program Chair)", name: "Faculty" },
			{ role: "Reviewed by (Program Chair)", name: "Program Chair" },
			{ role: "Noted by (VPAA)", name: "Vice President, Academic Affairs" },
		],
		body: (_payload, submission) => <ActionTakenBody submission={submission} />,
	},
};

/** Form codes with a manual-format layout — the export button is gated on it. */
export const CQI_FORM_CODES = Object.keys(SPECS);

export function CqiFormPdf({
	submission,
	payload,
}: {
	submission: FormSubmissionRecord;
	payload: unknown;
}) {
	const code = submission.formType?.code ?? "";
	const spec = SPECS[code];
	if (!spec) throw new Error(`No manual layout for form code '${code}'`);

	const meta = submission.formMeta;
	const responsibleParty = meta
		? `${meta.responsibleParty.preparers
				.map((role) => roleLabel(role as UserRole))
				.join(", ")} → ${meta.responsibleParty.chain
				.map((role) => roleLabel(role as UserRole))
				.join(" → ")}`
		: "—";

	return (
		<Document
			author="Obelisk"
			subject={submission.formType?.name ?? code}
			title={`${submission.formType?.name ?? code} - ${submission.id}`}
		>
			<Page size="A4" style={styles.page} wrap>
				<ManualHeader
					code={code}
					title={submission.formType?.name ?? code}
					pdcaPhase={submission.formType?.pdcaStage ?? "—"}
					evidenceType={spec.evidenceType}
					deadline={meta?.deadline ?? "Not specified"}
					retention={meta?.retention ?? "—"}
					responsibleParty={responsibleParty}
					purpose={spec.purpose}
					printedRules={spec.printedRules}
					subtitle={`${FORM_STATUS_LABELS[submission.status]} · Prepared by ${
						submission.submittedBy?.name ?? "—"
					} · Updated ${new Date(submission.updatedAt).toLocaleDateString()}`}
				/>

				{spec.body(payload, submission)}

				<SignatureBlock
					roles={spec.signatures}
					note="Prepared from stored assessment records. Server-computed values are printed as stored."
				/>

				<ManualFooter />
				<ManualPrototypeNotice />
			</Page>
		</Document>
	);
}
