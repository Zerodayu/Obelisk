/**
 * Shared page chrome for the manual-format PDFs — the order the JMCFI OBE
 * forms reference (§1) prescribes: code line, four-column metadata band,
 * responsible party, purpose, printed rules, then the fixed footer.
 *
 * NOTE: printed on every CQI document, including the institutional report, so
 * the band values and the disclaimer text only have to be defined once.
 */

import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

const styles = StyleSheet.create({
	brand: {
		fontSize: 7,
		letterSpacing: 1,
		color: "#6b7280",
		textTransform: "uppercase",
	},
	institution: { fontFamily: "Helvetica-Bold", fontSize: 13, marginTop: 2 },
	codeLine: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 8 },
	subtitle: { fontSize: 8, color: "#6b7280", marginTop: 2 },
	draft: {
		fontSize: 7.5,
		color: "#b45309",
		marginTop: 3,
		textTransform: "uppercase",
		letterSpacing: 0.6,
	},
	band: {
		flexDirection: "row",
		borderWidth: 0.5,
		borderColor: "#d1d5db",
		marginTop: 8,
	},
	bandCell: { flex: 1, padding: 4 },
	bandCellDivider: { borderRightWidth: 0.5, borderRightColor: "#d1d5db" },
	bandLabel: {
		fontSize: 6,
		letterSpacing: 0.6,
		color: "#6b7280",
		textTransform: "uppercase",
	},
	bandValue: { fontFamily: "Helvetica-Bold", fontSize: 8.5, marginTop: 1 },
	block: { fontSize: 8, marginTop: 5 },
	blockLabel: { fontFamily: "Helvetica-Bold" },
	divider: {
		borderBottomWidth: 1,
		borderBottomColor: "#d1d5db",
		marginTop: 8,
		marginBottom: 8,
	},
	footerRule: {
		position: "absolute",
		bottom: 32,
		left: 32,
		right: 32,
		borderTopWidth: 0.5,
		borderTopColor: "#d1d5db",
	},
	footerLeft: {
		position: "absolute",
		bottom: 24,
		left: 32,
		fontSize: 6.5,
		color: "#6b7280",
	},
	footerRight: {
		position: "absolute",
		// NOTE: `bottom` anchoring breaks when a `render` prop is combined with
		// multi-page content (react-pdf computes a huge page height and overflows
		// the text matrix). Anchor from the top of the A4 page instead.
		top: 810,
		right: 32,
		fontSize: 6.5,
		color: "#6b7280",
	},
	prototypeNotice: {
		position: "absolute",
		bottom: 16,
		left: 0,
		right: 0,
		textAlign: "center",
		fontSize: 5.5,
		color: "#9ca3af",
	},
});

export interface ManualHeaderProps {
	/** Stable snake_case form code — the manual's F-numbers are provisional. */
	code: string;
	title: string;
	pdcaPhase: string;
	evidenceType: string;
	deadline: string;
	retention: string;
	responsibleParty: string;
	purpose: string;
	printedRules?: string;
	subtitle?: string;
}

export function ManualHeader({
	code,
	title,
	pdcaPhase,
	evidenceType,
	deadline,
	retention,
	responsibleParty,
	purpose,
	printedRules,
	subtitle,
}: ManualHeaderProps) {
	const band = [
		["PDCA Phase", pdcaPhase],
		["Evidence Type", evidenceType],
		["Deadline", deadline],
		["Retention", retention],
	];

	return (
		<View>
			<Text style={styles.brand}>Obelisk · Outcome-Based Education</Text>
			<Text style={styles.institution}>
				Jose Maria College Foundation, Inc.
			</Text>
			<Text style={styles.codeLine}>
				{code} | {title}
			</Text>
			{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
			<Text style={styles.draft}>Draft — subject to faculty review</Text>

			<View style={styles.band}>
				{band.map(([label, value], index) => (
					<View
						key={label}
						style={
							index < band.length - 1
								? [styles.bandCell, styles.bandCellDivider]
								: styles.bandCell
						}
					>
						<Text style={styles.bandLabel}>{label}</Text>
						<Text style={styles.bandValue}>{value}</Text>
					</View>
				))}
			</View>

			<Text style={styles.block}>
				<Text style={styles.blockLabel}>Responsible Party: </Text>
				{responsibleParty}
			</Text>
			<Text style={styles.block}>
				<Text style={styles.blockLabel}>Purpose: </Text>
				{purpose}
			</Text>
			{printedRules ? (
				<Text style={styles.block}>
					<Text style={styles.blockLabel}>Printed Rules: </Text>
					{printedRules}
				</Text>
			) : null}

			<View style={styles.divider} />
		</View>
	);
}

/** Manual footer line + page numbering, repeated on every page. */
export function ManualFooter() {
	return (
		<>
			<View fixed style={styles.footerRule} />
			<Text fixed style={styles.footerLeft}>
				JMCFI Institutional Outcomes-Based Education Manual | M-OBE-07-26
			</Text>
			{/* NOTE: page counters must sit on a `fixed` Text directly under Page. */}
			<Text
				fixed
				style={styles.footerRight}
				render={({ pageNumber, totalPages }) =>
					`Page ${pageNumber} of ${totalPages}`
				}
			/>
		</>
	);
}

/** Standing research disclaimer — required on every CQI export. */
export function ManualPrototypeNotice() {
	return (
		<Text fixed style={styles.prototypeNotice}>
			Research prototype. Synthetic data. Not actual institutional attainment.
		</Text>
	);
}

/** Signature column: role label, printed name under the rule, and `Date:`. */
export function SignatureBlock({
	roles,
	note,
}: {
	roles: { role: string; name: string }[];
	note?: ReactNode;
}) {
	return (
		<View style={signatureStyles.wrap} wrap={false}>
			{note ? <Text style={signatureStyles.note}>{note}</Text> : null}
			<View style={signatureStyles.grid}>
				{roles.map((entry) => (
					<View key={entry.role} style={signatureStyles.col}>
						<Text style={signatureStyles.role}>{entry.role}</Text>
						<View style={signatureStyles.line} />
						<Text style={signatureStyles.name}>{entry.name}</Text>
						<Text style={signatureStyles.date}>Date: ______________</Text>
					</View>
				))}
			</View>
		</View>
	);
}

const signatureStyles = StyleSheet.create({
	wrap: {
		marginTop: 18,
		paddingTop: 6,
		borderTopWidth: 1,
		borderTopColor: "#d1d5db",
	},
	note: { fontSize: 7.5, color: "#6b7280" },
	grid: { flexDirection: "row", marginTop: 10 },
	col: { flex: 1, paddingRight: 12 },
	role: { fontSize: 7.5, color: "#6b7280" },
	line: {
		borderTopWidth: 0.5,
		borderTopColor: "#9ca3af",
		marginTop: 26,
	},
	name: { fontFamily: "Helvetica-Bold", fontSize: 8, marginTop: 3 },
	date: { fontSize: 7.5, color: "#6b7280", marginTop: 6 },
});
