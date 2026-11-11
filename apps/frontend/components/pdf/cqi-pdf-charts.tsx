/**
 * SVG visuals for the CQI institutional PDF.
 *
 * NOTE: react-pdf's Svg is a subset — flat fills and lines only, no gradients
 * or filters. Charts are chunked because one Svg cannot split across pages.
 */

import { G, Rect, Svg, Text, View } from "@react-pdf/renderer";
import type { ReactElement, ReactNode } from "react";

import type { CqiReport } from "@/server/actions/reports";

/**
 * NOTE: react-pdf reads `fontSize` from SVG text props at runtime, but its
 * SVGTextProps type omits it — this wrapper keeps the runtime feature typed.
 */
const SvgText = Text as unknown as (props: {
	x: number | string;
	y: number | string;
	fill?: string;
	fontSize?: number;
	key?: string | number;
	children?: ReactNode;
}) => ReactElement;

const COLORS = {
	met: "#15803d",
	notMet: "#b91c1c",
	notAvailable: "#9ca3af",
	target: "#1f2937",
	track: "#e5e7eb",
	grid: "#d1d5db",
	muted: "#374151",
};

// Width budget: A4 (595pt) minus the page's 32pt horizontal padding on each side.
const WIDTH = 531;
const LABEL_W = 138;
const PLOT_X = LABEL_W + 6;
const PLOT_W = 330;
const VALUE_X = PLOT_X + PLOT_W + 6;

/** Splits rows so each Svg stays short enough to fit on a page. */
function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		out.push(items.slice(index, index + size));
	}
	return out;
}

/** Last two code segments keep long keys like `BSIS/BSIS 101/CLO1` readable. */
function shortCode(code: string): string {
	return code.split("/").slice(-2).join("/");
}

function AxisTicks() {
	return (
		<>
			{[60, 70, 85, 100].map((tick) => (
				<SvgText
					key={tick}
					x={PLOT_X + (tick / 100) * PLOT_W - 5}
					y={8}
					fill={COLORS.muted}
					fontSize={5.5}
				>
					{tick}
				</SvgText>
			))}
		</>
	);
}

/**
 * Composite attainment per outcome against its target.
 * Green = MET, red = NOT MET, thin dark line = target.
 */
export function AttainmentChart({ rows }: { rows: CqiReport["outcomes"] }) {
	const scored = rows.filter((row) => row.compositePct !== null);
	if (scored.length === 0) {
		return <Text style={{ fontSize: 8, color: "#6b7280" }}>No data.</Text>;
	}
	return (
		<>
			{chunk(scored, 10).map((group, groupIndex) => {
				const rowHeight = 20;
				const height = group.length * rowHeight + 14;
				return (
					<View key={groupIndex} style={{ marginBottom: 6 }} wrap={false}>
						<Svg width={WIDTH} height={height}>
							<AxisTicks />
							{[60, 70, 85].map((tick) => (
								<Rect
									key={tick}
									x={PLOT_X + (tick / 100) * PLOT_W}
									y={10}
									width={0.4}
									height={group.length * rowHeight}
									fill={COLORS.grid}
								/>
							))}
							{group.map((row, index) => {
								const top = 14 + index * rowHeight;
								const value = Math.max(0, Math.min(100, row.compositePct ?? 0));
								const target = Math.max(
									0,
									Math.min(100, row.effectiveTargetPct),
								);
								return (
									<G key={row.key}>
										<SvgText
											x={0}
											y={top + 8}
											fill={COLORS.muted}
											fontSize={6.2}
										>
											{shortCode(row.code)}
										</SvgText>
										<Rect
											x={PLOT_X}
											y={top + 2}
											width={PLOT_W}
											height={7}
											fill={COLORS.track}
										/>
										<Rect
											x={PLOT_X}
											y={top + 2}
											width={(value / 100) * PLOT_W}
											height={7}
											fill={row.status === "MET" ? COLORS.met : COLORS.notMet}
										/>
										<Rect
											x={PLOT_X + (target / 100) * PLOT_W}
											y={top}
											width={1.2}
											height={11}
											fill={COLORS.target}
										/>
										<SvgText
											x={VALUE_X}
											y={top + 8}
											fill={COLORS.muted}
											fontSize={6.2}
										>
											{`${value.toFixed(1)}% [${Number(
												row.effectiveTargetPct.toFixed(1),
											)}%]`}
										</SvgText>
									</G>
								);
							})}
						</Svg>
					</View>
				);
			})}
		</>
	);
}

/** Vertical bars per score band, scaled to the largest bucket. */
export function DistributionChart({
	buckets,
}: {
	buckets: CqiReport["statistics"]["distribution"];
}) {
	const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
	const height = 100;
	const slot = WIDTH / Math.max(1, buckets.length);
	const barWidth = Math.min(64, slot - 18);
	return (
		<View style={{ marginVertical: 4 }}>
			<Svg width={WIDTH} height={height + 22}>
				<Rect x={0} y={height} width={WIDTH} height={0.6} fill={COLORS.grid} />
				{buckets.map((bucket, index) => {
					const barHeight = (bucket.count / max) * (height - 12);
					const x = index * slot + (slot - barWidth) / 2;
					return (
						<G key={bucket.band}>
							<Rect
								x={x}
								y={height - barHeight}
								width={barWidth}
								height={barHeight}
								fill={COLORS.met}
							/>
							<SvgText
								x={x + barWidth / 2 - 4}
								y={height - barHeight - 3}
								fill={COLORS.muted}
								fontSize={6.5}
							>
								{String(bucket.count)}
							</SvgText>
							<SvgText x={x} y={height + 10} fill={COLORS.muted} fontSize={5.8}>
								{bucket.band.split(" (")[0]}
							</SvgText>
						</G>
					);
				})}
			</Svg>
		</View>
	);
}

/** Stacked MET / NOT MET / not-available bar per program. */
export function StatusStackedChart({ report }: { report: CqiReport }) {
	if (report.scope.programs.length === 0) {
		return <Text style={{ fontSize: 8, color: "#6b7280" }}>No data.</Text>;
	}
	const rowHeight = 18;
	const height = report.scope.programs.length * rowHeight + 12;
	const barX = 96;
	const barW = PLOT_X + PLOT_W - barX;
	return (
		<View style={{ marginVertical: 4 }}>
			<Svg width={WIDTH} height={height}>
				{report.scope.programs.map((program, index) => {
					const rows = report.outcomes.filter(
						(row) => row.programCode === program.code,
					);
					const met = rows.filter((row) => row.status === "MET").length;
					const notMet = rows.filter((row) => row.status === "NOT MET").length;
					const other = rows.length - met - notMet;
					const total = Math.max(1, rows.length);
					const top = index * rowHeight + 4;
					const segments = [
						{ count: met, color: COLORS.met },
						{ count: notMet, color: COLORS.notMet },
						{ count: other, color: COLORS.notAvailable },
					];
					let offset = 0;
					return (
						<G key={program.code}>
							<SvgText x={0} y={top + 7} fill={COLORS.muted} fontSize={6.5}>
								{program.code}
							</SvgText>
							{segments.map((segment, segmentIndex) => {
								const width = (segment.count / total) * barW;
								const x = barX + offset;
								offset += width;
								return segment.count === 0 ? null : (
									<Rect
										key={segmentIndex}
										x={x}
										y={top}
										width={width}
										height={9}
										fill={segment.color}
									/>
								);
							})}
							<SvgText
								x={barX + barW + 5}
								y={top + 7}
								fill={COLORS.muted}
								fontSize={6}
							>
								{`${met} / ${notMet} / ${other}`}
							</SvgText>
						</G>
					);
				})}
			</Svg>
		</View>
	);
}

/** Diverging delta bars (percentage points) around a zero axis. */
export function DeltaChart({
	comparisons,
}: {
	comparisons: CqiReport["priorComparisons"];
}) {
	const rows = comparisons.filter(
		(row) => row.comparable && row.deltaPct !== null,
	);
	if (rows.length === 0) {
		return (
			<Text style={{ fontSize: 8, color: "#6b7280" }}>
				No outcome was assessed in both cycles.
			</Text>
		);
	}
	const max = Math.max(1, ...rows.map((row) => Math.abs(row.deltaPct ?? 0)));
	const zeroX = PLOT_X + PLOT_W / 2;
	const halfW = PLOT_W / 2;
	return (
		<>
			{chunk(rows, 12).map((group, groupIndex) => {
				const rowHeight = 16;
				const height = group.length * rowHeight + 10;
				return (
					<View key={groupIndex} style={{ marginBottom: 6 }} wrap={false}>
						<Svg width={WIDTH} height={height}>
							<Rect
								x={zeroX}
								y={0}
								width={0.6}
								height={height - 6}
								fill={COLORS.target}
							/>
							{group.map((row, index) => {
								const top = index * rowHeight + 4;
								const value = row.deltaPct ?? 0;
								const width = (Math.abs(value) / max) * (halfW - 12);
								const up = value >= 0;
								return (
									<G key={row.outcomeKey}>
										<SvgText
											x={0}
											y={top + 7}
											fill={COLORS.muted}
											fontSize={6.2}
										>
											{shortCode(row.outcomeCode)}
										</SvgText>
										<Rect
											x={up ? zeroX : zeroX - width}
											y={top}
											width={width}
											height={8}
											fill={up ? COLORS.met : COLORS.notMet}
										/>
										<SvgText
											x={VALUE_X}
											y={top + 7}
											fill={COLORS.muted}
											fontSize={6.2}
										>
											{`${value > 0 ? "+" : ""}${value.toFixed(2)} pp`}
										</SvgText>
									</G>
								);
							})}
						</Svg>
					</View>
				);
			})}
		</>
	);
}

/** Filled cells mark CLO→PLO mappings; empty cells mark gaps. */
export function AlignmentGrid({ report }: { report: CqiReport }) {
	const rows = [
		...new Map(
			report.alignment.mappings.map((mapping) => [
				`${mapping.courseCode}/${mapping.cloCode}`,
				mapping,
			]),
		).keys(),
	].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	const columns = [
		...new Set(report.alignment.mappings.map((mapping) => mapping.ploCode)),
	].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	if (rows.length === 0 || columns.length === 0) {
		return (
			<Text style={{ fontSize: 8, color: "#6b7280" }}>
				No alignment matrix to display.
			</Text>
		);
	}
	const mapped = new Set(
		report.alignment.mappings.map(
			(mapping) =>
				`${mapping.courseCode}/${mapping.cloCode}|${mapping.ploCode}`,
		),
	);
	const labelW = 120;
	const cell = Math.min(
		18,
		Math.floor((WIDTH - labelW) / Math.max(1, columns.length)),
	);
	const columnGap = 4;
	const columnX = (columnIndex: number) =>
		labelW + columnIndex * (cell + columnGap) + columnGap;
	return (
		<>
			{chunk(rows, 12).map((group, groupIndex) => {
				const height = group.length * cell + 14;
				return (
					<View key={groupIndex} style={{ marginBottom: 6 }} wrap={false}>
						<Svg width={WIDTH} height={height}>
							{columns.map((ploCode, columnIndex) => (
								<SvgText
									key={`head-${ploCode}`}
									x={columnX(columnIndex)}
									y={8}
									fill={COLORS.muted}
									fontSize={5.5}
								>
									{ploCode.replace(/^.*\//, "")}
								</SvgText>
							))}
							{group.map((row, rowIndex) => (
								<G key={row}>
									<SvgText
										x={0}
										y={16 + rowIndex * cell + 7}
										fill={COLORS.muted}
										fontSize={5.8}
									>
										{row}
									</SvgText>
									{columns.map((ploCode, columnIndex) => (
										<Rect
											key={ploCode}
											x={columnX(columnIndex)}
											y={12 + rowIndex * cell}
											width={cell - 2}
											height={cell - 3}
											fill={
												mapped.has(`${row}|${ploCode}`)
													? COLORS.met
													: COLORS.track
											}
										/>
									))}
								</G>
							))}
						</Svg>
					</View>
				);
			})}
		</>
	);
}
