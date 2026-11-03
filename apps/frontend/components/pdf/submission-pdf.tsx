/**
 * Purpose-built PDF for one form submission's stored data.
 *
 * Fed a full `FormSubmissionRecord` (detail endpoint), it lays out the
 * standard header, a body walked generically from `formData`, and the manual's
 * signature footer. Kept free of Tailwind/`html2canvas` — react-pdf primitives
 * are the print layout, so the document is not a screenshot of the web form.
 */

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

import { roleLabel, type UserRole } from "@/lib/roles";
import {
	FORM_STATUS_LABELS,
	type FormSubmissionRecord,
} from "@/lib/store/atoms/forms";

const styles = StyleSheet.create({
	page: {
		paddingTop: 40,
		paddingHorizontal: 36,
		paddingBottom: 40,
		fontFamily: "Helvetica",
		fontSize: 9,
		lineHeight: 1.4,
		color: "#1f2937",
	},
	brand: {
		fontSize: 7,
		letterSpacing: 1,
		color: "#6b7280",
		textTransform: "uppercase",
	},
	institution: { fontFamily: "Helvetica-Bold", fontSize: 14, marginTop: 2 },
	title: { fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 12 },
	code: { fontSize: 8, color: "#6b7280", marginTop: 2 },
	divider: {
		borderBottomWidth: 1,
		borderBottomColor: "#d1d5db",
		marginTop: 10,
		marginBottom: 10,
	},
	metaGrid: { flexDirection: "row", flexWrap: "wrap" },
	metaItem: { width: "50%", paddingVertical: 3, paddingRight: 8 },
	metaLabel: {
		fontSize: 7,
		color: "#6b7280",
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	metaValue: { fontSize: 9, marginTop: 1 },
	section: { marginTop: 12 },
	sectionTitle: {
		fontFamily: "Helvetica-Bold",
		fontSize: 10,
		color: "#111827",
		marginBottom: 3,
	},
	field: {
		flexDirection: "row",
		paddingVertical: 3,
		borderBottomWidth: 0.5,
		borderBottomColor: "#e5e7eb",
	},
	fieldLabel: { width: "35%", color: "#4b5563", paddingRight: 8 },
	fieldValue: { width: "65%" },
	note: { fontSize: 8, color: "#6b7280", fontStyle: "italic" },
	table: { borderWidth: 0.5, borderColor: "#d1d5db", marginTop: 2 },
	tableHeaderRow: { flexDirection: "row", backgroundColor: "#f3f4f6" },
	tableRow: {
		flexDirection: "row",
		borderTopWidth: 0.5,
		borderTopColor: "#d1d5db",
	},
	tableCell: { flex: 1, padding: 3, fontSize: 7.5 },
	tableHeaderCell: {
		flex: 1,
		padding: 3,
		fontSize: 7.5,
		fontFamily: "Helvetica-Bold",
	},
	bullet: { flexDirection: "row", paddingVertical: 1 },
	bulletDot: { width: 8 },
	footer: {
		marginTop: 20,
		paddingTop: 8,
		borderTopWidth: 1,
		borderTopColor: "#d1d5db",
	},
	footerTitle: { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 4 },
	signatureRow: { paddingVertical: 2 },
	signatureMain: { fontSize: 8.5 },
	signatureMeta: { fontSize: 7.5, color: "#6b7280" },
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatScalar(value: unknown): string {
	if (value === null || value === undefined) return "—";
	if (typeof value === "boolean") return value ? "Yes" : "No";
	if (typeof value === "string") return value.trim() === "" ? "—" : value;
	if (typeof value === "number") return String(value);
	return JSON.stringify(value);
}

/** `courseCode` / `course_code` -> `Course Code`. */
function humanize(key: string): string {
	const spaced = key
		.replace(/[_-]+/g, " ")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<View style={styles.field}>
			<Text style={styles.fieldLabel}>{label}</Text>
			<View style={styles.fieldValue}>{children}</View>
		</View>
	);
}

function Table({ rows }: { rows: Record<string, unknown>[] }) {
	const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
	return (
		<View style={styles.table}>
			<View style={styles.tableHeaderRow}>
				{columns.map((column) => (
					<Text key={column} style={styles.tableHeaderCell}>
						{humanize(column)}
					</Text>
				))}
			</View>
			{rows.map((row, index) => (
				<View key={index} style={styles.tableRow} wrap={false}>
					{columns.map((column) => (
						<Text key={column} style={styles.tableCell}>
							{formatScalar(row[column])}
						</Text>
					))}
				</View>
			))}
		</View>
	);
}

/**
 * Renders any `formData` shape: objects become label/value rows, arrays of
 * objects become tables, everything else lists or prints. Depth is capped so a
 * pathological payload cannot recurse forever.
 *
 * shortcut: one generic data-walk layout for every form; add a bespoke document
 * for a form only if its data reads badly this way.
 */
function renderValue(value: unknown, depth: number): ReactNode {
	if (depth > 3) return <Text>{JSON.stringify(value)}</Text>;

	if (Array.isArray(value)) {
		if (value.length === 0) return <Text style={styles.note}>None</Text>;
		if (value.every(isRecord)) return <Table rows={value} />;
		if (value.every((item) => !isRecord(item) && !Array.isArray(item))) {
			return (
				<View>
					{value.map((item, index) => (
						<View key={index} style={styles.bullet}>
							<Text style={styles.bulletDot}>•</Text>
							<Text style={{ flex: 1 }}>{formatScalar(item)}</Text>
						</View>
					))}
				</View>
			);
		}
		return <Text>{JSON.stringify(value)}</Text>;
	}

	if (isRecord(value)) {
		return (
			<View>
				{Object.entries(value).map(([key, nested]) => (
					<Field key={key} label={humanize(key)}>
						{renderValue(nested, depth + 1)}
					</Field>
				))}
			</View>
		);
	}

	return <Text>{formatScalar(value)}</Text>;
}

/** One top-level `formData` key: scalar -> field row, object/array -> section. */
function renderEntry(key: string, value: unknown) {
	if (isRecord(value) || Array.isArray(value)) {
		return (
			<View key={key} style={styles.section}>
				<Text style={styles.sectionTitle}>{humanize(key)}</Text>
				{renderValue(value, 1)}
			</View>
		);
	}
	return (
		<Field key={key} label={humanize(key)}>
			{renderValue(value, 1)}
		</Field>
	);
}

export function SubmissionPdf({
	submission,
}: {
	submission: FormSubmissionRecord;
}) {
	const formType = submission.formType;
	const meta = submission.formMeta ?? null;
	const data = isRecord(submission.formData) ? submission.formData : {};
	const entries = Object.entries(data);
	const preparedAt = submission.submittedAt ?? submission.createdAt;
	const steps = [...(submission.approvalSteps ?? [])].sort(
		(a, b) => a.sequenceNo - b.sequenceNo,
	);

	const responsibleParty = meta
		? [...meta.responsibleParty.preparers, ...meta.responsibleParty.chain]
				.map((role) => roleLabel(role as UserRole))
				.join(" -> ")
		: "";

	const metaItems = [
		{
			label: "Status",
			value: FORM_STATUS_LABELS[submission.status] ?? submission.status,
		},
		{ label: "PDCA phase", value: formType?.pdcaStage ?? "" },
		...(submission.submittedBy
			? [
					{
						label: "Submitted by",
						value: `${submission.submittedBy.name} (${roleLabel(
							submission.submittedBy.role as UserRole,
						)})`,
					},
				]
			: []),
		{ label: "Submitted at", value: new Date(preparedAt).toLocaleString() },
		...(meta ? [{ label: "Retention", value: meta.retention }] : []),
		...(meta?.deadline ? [{ label: "Deadline", value: meta.deadline }] : []),
		...(responsibleParty
			? [{ label: "Responsible party", value: responsibleParty }]
			: []),
	].filter((item) => item.value.length > 0);

	return (
		<Document
			author="Obelisk"
			subject={formType?.name ?? "Form data"}
			title={`${formType?.name ?? "Form"} - ${submission.id.slice(0, 8)}`}
		>
			<Page size="A4" style={styles.page} wrap>
				<Text style={styles.brand}>Obelisk · Outcome-Based Education</Text>
				<Text style={styles.institution}>
					Jose Maria College Foundation, Inc.
				</Text>

				<Text style={styles.title}>{formType?.name ?? "Form submission"}</Text>
				{formType?.code ? (
					<Text style={styles.code}>{formType.code}</Text>
				) : null}

				<View style={styles.divider} />

				<View style={styles.metaGrid}>
					{metaItems.map((item) => (
						<View key={item.label} style={styles.metaItem}>
							<Text style={styles.metaLabel}>{item.label}</Text>
							<Text style={styles.metaValue}>{item.value}</Text>
						</View>
					))}
				</View>

				<View style={styles.divider} />

				{entries.length > 0 ? (
					entries.map(([key, value]) => renderEntry(key, value))
				) : (
					<Text style={styles.note}>
						No form data recorded for this submission.
					</Text>
				)}

				<View style={styles.footer} wrap={false}>
					<Text style={styles.footerTitle}>Signatures</Text>
					{submission.submittedBy ? (
						<View style={styles.signatureRow}>
							<Text style={styles.signatureMain}>
								Prepared by {submission.submittedBy.name} —{" "}
								{roleLabel(submission.submittedBy.role as UserRole)}
							</Text>
							<Text style={styles.signatureMeta}>
								{new Date(preparedAt).toLocaleString()}
							</Text>
						</View>
					) : null}
					{steps.map((step) => {
						const role = roleLabel(step.approverRole as UserRole);
						const pending = step.decision === "pending";
						const verb = pending
							? "Awaiting"
							: step.decision === "approved"
								? "Approved by"
								: "Returned by";
						const signer = step.approver?.name
							? `${step.approver.name} · ${role}`
							: role;
						return (
							<View key={step.id} style={styles.signatureRow}>
								<Text style={styles.signatureMain}>
									{step.sequenceNo}. {verb} {signer}
								</Text>
								{step.decidedAt ? (
									<Text style={styles.signatureMeta}>
										{new Date(step.decidedAt).toLocaleString()}
									</Text>
								) : null}
								{step.comment ? (
									<Text style={styles.signatureMeta}>
										Comment: {step.comment}
									</Text>
								) : null}
							</View>
						);
					})}
				</View>
			</Page>
		</Document>
	);
}
