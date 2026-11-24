"use client";

import { useAtomValue } from "jotai";

import { ChartEmptyState } from "@/components/charts/chart-empty-state";
import type {
	ApprovalFlowDatum,
	AtRiskDatum,
	AuditActivityDatum,
	ClusterCompositionDatum,
	ClusterStatusDatum,
	ExportFormatDatum,
	FormStatusDatum,
	FormTypeStageDatum,
	RecommendationStatusDatum,
	UserRoleDatum,
} from "@/components/charts/obe-sample-data";
import { PieDonutLayout } from "@/components/charts/pie-donut-layout";
import {
	type ChartConfig,
	EChartsBarChart,
} from "@/components/evilcharts/charts/echarts-bar-chart";
import {
	approvalFlowDataAtom,
	atRiskDataAtom,
	auditActivityDataAtom,
	clusterCompositionDataAtom,
	clusterStatusesDataAtom,
	exportFormatsDataAtom,
	formStatusCountsAtom,
	formTypeStagesDataAtom,
	recommendationsDataAtom,
	studentsVsAtRiskAtom,
	userRolesDataAtom,
} from "@/lib/store/atoms/governance";

const statusConfig = {
	draft: { label: "Draft", colors: { light: ["var(--muted-foreground)"] } },
	submitted: {
		label: "Submitted",
		colors: { light: ["var(--info)"] },
	},
	returned: {
		label: "Returned",
		colors: { light: ["var(--warning)"] },
	},
	approved: {
		label: "Approved",
		colors: { light: ["var(--success)"] },
	},
	archived: {
		label: "Archived",
		colors: { light: ["var(--chart-1)"] },
	},
} satisfies ChartConfig;

const flowConfig = {
	approved: {
		label: "Approved",
		colors: { light: ["var(--success)"] },
	},
	pending: {
		label: "Pending",
		colors: { light: ["var(--info)"] },
	},
	returned: {
		label: "Returned",
		colors: { light: ["var(--warning)"] },
	},
} satisfies ChartConfig;

const auditConfig = {
	count: { label: "Events", colors: { light: ["var(--primary)"] } },
} satisfies ChartConfig;

// NOTE: the watchlist is a count-per-CLO distribution of below-70 flags; a solid
// horizontal bar reads it clearly. The series is keyed by `count`, matching the
// other category-count bars in this file.
const atRiskConfig = {
	count: { label: "Flags", colors: { light: ["var(--destructive)"] } },
} satisfies ChartConfig;

const studentsAtRiskConfig = {
	at_risk: {
		label: "At risk",
		colors: { light: ["var(--destructive)"] },
	},
	not_at_risk: {
		label: "Not at risk",
		colors: { light: ["var(--success)"] },
	},
} satisfies ChartConfig;

const recommendationConfig = {
	pending_review: {
		label: "Pending review",
		colors: { light: ["var(--info)"] },
	},
	acknowledged: {
		label: "Acknowledged",
		colors: { light: ["var(--warning)"] },
	},
	actioned: {
		label: "Actioned",
		colors: { light: ["var(--success)"] },
	},
	dismissed: {
		label: "Dismissed",
		colors: { light: ["var(--muted-foreground)"] },
	},
} satisfies ChartConfig;

const clusterConfig = {
	graduated: {
		label: "Graduated",
		colors: { light: ["var(--success)"] },
	},
	transferee: {
		label: "Transferee",
		colors: { light: ["var(--warning)"] },
	},
	withdrawn: {
		label: "Withdrawn",
		colors: { light: ["var(--destructive)"] },
	},
} satisfies ChartConfig;

const exportConfig = {
	count: { label: "Exports", colors: { light: ["var(--primary)"] } },
} satisfies ChartConfig;

const formTypeStageConfig = {
	PLAN: { label: "PLAN", colors: { light: ["var(--info)"] } },
	DO: { label: "DO", colors: { light: ["var(--warning)"] } },
	CHECK: { label: "CHECK", colors: { light: ["var(--chart-3)"] } },
	ACT: { label: "ACT", colors: { light: ["var(--success)"] } },
} satisfies ChartConfig;

const userRoleConfig = {
	count: { label: "Users", colors: { light: ["var(--info)"] } },
} satisfies ChartConfig;

const clusterStatusConfig = {
	open: { label: "Open", colors: { light: ["var(--info)"] } },
	compiling: { label: "Compiling", colors: { light: ["var(--warning)"] } },
	archived: { label: "Archived", colors: { light: ["var(--success)"] } },
} satisfies ChartConfig;

/** Donut of form submission statuses (draft → archived) — real DB counts. */
export function FormStatusDonut({
	data: override,
}: {
	data?: FormStatusDatum[];
}) {
	const atomData = useAtomValue(formStatusCountsAtom);
	const data = override ?? atomData;
	const rows = data.map((f) => ({ status: f.status, count: f.count }));
	return (
		<PieDonutLayout
			data={rows}
			config={statusConfig}
			dataKey="count"
			nameKey="status"
			caption="Total forms"
		/>
	);
}

/** Stacked bar of the approval chain: pending / approved / returned per role. */
export function ApprovalFlowBars({
	data: override,
}: {
	data?: ApprovalFlowDatum[];
}) {
	const atomData = useAtomValue(approvalFlowDataAtom);
	const data = override ?? atomData;
	const rows = data.map((a) => ({
		approverRole: a.approverRole.replace("_", " "),
		approved: a.approved,
		pending: a.pending,
		returned: a.returned,
	}));
	if (rows.length === 0) return <ChartEmptyState />;
	return (
		<EChartsBarChart
			data={rows}
			config={flowConfig}
			xDataKey="approverRole"
			className="h-full w-full"
			stackType="stacked"
		>
			<EChartsBarChart.Grid />
			<EChartsBarChart.XAxis dataKey="approverRole" />
			<EChartsBarChart.YAxis label="Submissions" />
			<EChartsBarChart.Tooltip />
			<EChartsBarChart.Legend />
			<EChartsBarChart.Bar dataKey="approved" />
			<EChartsBarChart.Bar dataKey="pending" />
			<EChartsBarChart.Bar dataKey="returned" />
		</EChartsBarChart>
	);
}

/** Horizontal bars of audit-trial activity per module. */
export function AuditActivityBars({
	data: override,
}: {
	data?: AuditActivityDatum[];
}) {
	const atomData = useAtomValue(auditActivityDataAtom);
	const data = override ?? atomData;
	const rows = data.map((a) => ({ module: a.module, count: a.count }));
	if (rows.length === 0) return <ChartEmptyState />;
	return (
		<EChartsBarChart
			data={rows}
			config={auditConfig}
			xDataKey="module"
			layout="horizontal"
			className="h-full w-full"
		>
			<EChartsBarChart.Grid />
			<EChartsBarChart.XAxis dataKey="module" />
			<EChartsBarChart.YAxis dataKey="count" label="Events" />
			<EChartsBarChart.Tooltip />
			<EChartsBarChart.Bar dataKey="count" variant="expandable" />
		</EChartsBarChart>
	);
}

/** "Below 70% on CLO1" / "Below institutional threshold on CLO1: 52.0%" → "CLO1". */
function cloCodeOf(reason: string): string {
	const match = reason.match(/CLO\s*\d+/i);
	return match ? match[0].replace(/\s+/g, "") : reason;
}

/** Solid horizontal bars of the at-risk watchlist — flags folded onto their CLO code. */
export function AtRiskBars({ data: override }: { data?: AtRiskDatum[] }) {
	const atomData = useAtomValue(atRiskDataAtom);
	const data = override ?? atomData;
	// NOTE: ingest writes one reason per (CLO, score); folding onto the CLO code
	// keeps the chart at "flags per CLO" instead of a bar per distinct score.
	const byClo = new Map<string, number>();
	for (const row of data) {
		const code = cloCodeOf(row.reason);
		byClo.set(code, (byClo.get(code) ?? 0) + row.studentCount);
	}
	const rows = [...byClo].map(([clo, count]) => ({ clo, count }));
	if (rows.length === 0) return <ChartEmptyState />;
	const total = rows.reduce((sum, row) => sum + row.count, 0);
	return (
		<div className="flex h-full w-full flex-col">
			<p className="text-muted-foreground text-xs">
				Total flags: <span className="font-semibold">{total}</span>
			</p>
			<div className="min-h-0 flex-1">
				<EChartsBarChart
					data={rows}
					config={atRiskConfig}
					xDataKey="clo"
					layout="horizontal"
					className="h-full w-full"
				>
					<EChartsBarChart.Grid />
					<EChartsBarChart.XAxis label="Flags" />
					<EChartsBarChart.YAxis dataKey="clo" />
					<EChartsBarChart.Tooltip />
					<EChartsBarChart.Bar dataKey="count" />
				</EChartsBarChart>
			</div>
		</div>
	);
}

/** Donut of total students vs at-risk students (unit-scoped). */
export function StudentsAtRiskDonut({
	data: override,
}: {
	data?: { total: number; atRisk: number };
}) {
	const atomData = useAtomValue(studentsVsAtRiskAtom);
	const { total, atRisk } = override ?? atomData;
	const rows = [
		{ status: "at_risk", count: atRisk },
		{ status: "not_at_risk", count: Math.max(0, total - atRisk) },
	];
	return (
		<PieDonutLayout
			data={rows}
			config={studentsAtRiskConfig}
			dataKey="count"
			nameKey="status"
			caption="Total students"
		/>
	);
}

/** Donut of AI recommendation review statuses. */
export function RecommendationDonut({
	data: override,
}: {
	data?: RecommendationStatusDatum[];
}) {
	const atomData = useAtomValue(recommendationsDataAtom);
	const data = override ?? atomData;
	const rows = data.map((r) => ({ status: r.status, count: r.count }));
	return (
		<PieDonutLayout
			data={rows}
			config={recommendationConfig}
			dataKey="count"
			nameKey="status"
			caption="Total recommendations"
		/>
	);
}

/** Donut of graduation-cluster composition by archived student status. */
export function ClusterCompositionDonut({
	data: override,
}: {
	data?: ClusterCompositionDatum[];
}) {
	const atomData = useAtomValue(clusterCompositionDataAtom);
	const data = override ?? atomData;
	const rows = data.map((c) => ({ status: c.status, count: c.studentCount }));
	return (
		<PieDonutLayout
			data={rows}
			config={clusterConfig}
			dataKey="count"
			nameKey="status"
			caption="Total students"
		/>
	);
}

/** Horizontal bars of report exports by format (`ReportExport.format`). */
export function ExportFormatBars({
	data: override,
}: {
	data?: ExportFormatDatum[];
}) {
	const atomData = useAtomValue(exportFormatsDataAtom);
	const data = override ?? atomData;
	const rows = data.map((e) => ({ format: e.format, count: e.count }));
	if (rows.length === 0) return <ChartEmptyState />;
	return (
		<EChartsBarChart
			data={rows}
			config={exportConfig}
			xDataKey="format"
			className="h-full w-full"
		>
			<EChartsBarChart.Grid />
			<EChartsBarChart.XAxis dataKey="format" />
			<EChartsBarChart.YAxis dataKey="count" label="Exports" />
			<EChartsBarChart.Tooltip />
			<EChartsBarChart.Bar dataKey="count" variant="expandable" />
		</EChartsBarChart>
	);
}

/** Bars of the 28-form catalog by PDCA stage (`FormType.pdcaStage`). */
export function FormTypeStageBars({
	data: override,
}: {
	data?: FormTypeStageDatum[];
}) {
	const atomData = useAtomValue(formTypeStagesDataAtom);
	const data = override ?? atomData;
	const rows = data.map((f) => ({ stage: f.stage, count: f.formTypeCount }));
	if (rows.length === 0) return <ChartEmptyState />;
	return (
		<EChartsBarChart
			data={rows}
			config={formTypeStageConfig}
			xDataKey="stage"
			className="h-full w-full"
		>
			<EChartsBarChart.Grid />
			<EChartsBarChart.XAxis dataKey="stage" />
			<EChartsBarChart.YAxis label="Form types" />
			<EChartsBarChart.Tooltip />
			<EChartsBarChart.Legend />
			<EChartsBarChart.Bar dataKey="count" variant="expandable" />
		</EChartsBarChart>
	);
}

/** Horizontal bars of platform users by role (`user.role`). */
export function UserRoleBars({ data: override }: { data?: UserRoleDatum[] }) {
	const atomData = useAtomValue(userRolesDataAtom);
	const data = override ?? atomData;
	const rows = data.map((r) => ({
		role: r.role.replace("_", " "),
		count: r.userCount,
	}));
	if (rows.length === 0) return <ChartEmptyState />;
	return (
		<EChartsBarChart
			data={rows}
			config={userRoleConfig}
			xDataKey="role"
			layout="horizontal"
			className="h-full w-full"
		>
			<EChartsBarChart.Grid />
			<EChartsBarChart.XAxis dataKey="role" />
			<EChartsBarChart.YAxis dataKey="count" label="Users" />
			<EChartsBarChart.Tooltip />
			<EChartsBarChart.Bar dataKey="count" variant="expandable" />
		</EChartsBarChart>
	);
}

/** Donut of graduation-cluster lifecycle statuses (`GraduationCluster.status`). */
export function ClusterStatusDonut({
	data: override,
}: {
	data?: ClusterStatusDatum[];
}) {
	const atomData = useAtomValue(clusterStatusesDataAtom);
	const data = override ?? atomData;
	const rows = data.map((c) => ({ status: c.status, count: c.clusterCount }));
	return (
		<PieDonutLayout
			data={rows}
			config={clusterStatusConfig}
			dataKey="count"
			nameKey="status"
			caption="Total clusters"
		/>
	);
}
