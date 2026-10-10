"use client";

import { useAtomValue } from "jotai";

import { ChartEmptyState } from "@/components/charts/chart-empty-state";
import type {
	AssessmentTypeDatum,
	BudgetLineDatum,
	CurriculumCoverageDatum,
	PloToPeoCoverageDatum,
	ScheduleDatum,
	StudentYearLevelDatum,
	TargetSettingDatum,
} from "@/components/charts/obe-sample-data";
import { PieDonutLayout } from "@/components/charts/pie-donut-layout";
import {
	type ChartConfig,
	EChartsBarChart,
} from "@/components/evilcharts/charts/echarts-bar-chart";
import {
	assessmentTypesDataAtom,
	budgetLinesDataAtom,
	curriculumCoverageDataAtom,
	ploToPeoCoverageDataAtom,
	scheduleDataAtom,
	studentYearLevelsDataAtom,
	targetSettingsDataAtom,
} from "@/lib/store/atoms/plan";

const scheduleConfig = {
	direct: {
		label: "Direct",
		colors: { light: ["var(--chart-1)"] },
	},
	indirect: {
		label: "Indirect",
		colors: { light: ["var(--info)"] },
	},
} satisfies ChartConfig;

const targetConfig = {
	target: {
		label: "Target",
		colors: { light: ["var(--muted-foreground)"] },
	},
	current: {
		label: "Current",
		colors: { light: ["var(--success)"] },
	},
} satisfies ChartConfig;

const coverageConfig = {
	mapped: {
		label: "Mapped CLOs",
		colors: { light: ["var(--primary)"] },
	},
} satisfies ChartConfig;

const peoCoverageConfig = {
	mapped: {
		label: "Mapped PEOs",
		colors: { light: ["var(--chart-2)"] },
	},
} satisfies ChartConfig;

const assessmentTypeConfig = {
	direct: {
		label: "Direct",
		colors: { light: ["var(--chart-1)"] },
	},
	indirect: {
		label: "Indirect",
		colors: { light: ["var(--info)"] },
	},
} satisfies ChartConfig;

const yearLevelConfig = {
	count: {
		label: "Students",
		colors: { light: ["var(--chart-3)"] },
	},
} satisfies ChartConfig;

const budgetConfig = {
	planned: {
		label: "Planned",
		colors: { light: ["var(--warning)"] },
	},
	spent: { label: "Spent", colors: { light: ["var(--chart-1)"] } },
} satisfies ChartConfig;

const phaseConfig = {
	PLAN: { label: "PLAN", colors: { light: ["var(--info)"] } },
	DO: { label: "DO", colors: { light: ["var(--warning)"] } },
	CHECK: { label: "CHECK", colors: { light: ["var(--chart-3)"] } },
	ACT: { label: "ACT", colors: { light: ["var(--success)"] } },
} satisfies ChartConfig;

/** Planned vs spent budget per line item (PHP thousands). */
export function BudgetVsActualBars({
	data: override,
}: {
	data?: BudgetLineDatum[];
}) {
	const atomData = useAtomValue(budgetLinesDataAtom);
	const data = override ?? atomData;
	const rows = data.map((b) => ({
		lineItem: b.lineItem.split(" ")[0],
		planned: Math.round(b.planned / 1000),
		// No actual-spend field on the backend yet — see `BudgetLineDatum.spent`.
		spent: b.spent == null ? 0 : Math.round(b.spent / 1000),
	}));
	if (rows.length === 0) return <ChartEmptyState />;
	const hasSpent = data.some((b) => b.spent != null);
	return (
		<EChartsBarChart
			data={rows}
			config={budgetConfig}
			xDataKey="lineItem"
			className="h-full w-full"
			stackType="stacked"
		>
			<EChartsBarChart.Grid />
			<EChartsBarChart.XAxis dataKey="lineItem" />
			<EChartsBarChart.YAxis label="PHP (000)" />
			<EChartsBarChart.Tooltip />
			<EChartsBarChart.Legend />
			<EChartsBarChart.Bar dataKey="planned" />
			{hasSpent ? <EChartsBarChart.Bar dataKey="spent" /> : null}
		</EChartsBarChart>
	);
}

/** Donut of the approved budget allocation by PDCA phase. */
export function BudgetPhaseDonut({
	data: override,
}: {
	data?: BudgetLineDatum[];
}) {
	const atomData = useAtomValue(budgetLinesDataAtom);
	const data = override ?? atomData;
	const byPhase = data.reduce<Record<string, number>>((acc, line) => {
		acc[line.phase] = (acc[line.phase] ?? 0) + line.planned;
		return acc;
	}, {});
	const rows = Object.entries(byPhase).map(([phase, planned]) => ({
		phase,
		planned,
	}));
	return (
		<PieDonutLayout
			data={rows}
			config={phaseConfig}
			dataKey="planned"
			nameKey="phase"
			caption="Total budget (PHP)"
		/>
	);
}

/** Target vs current attainment per year level (target-setting matrix). */
export function TargetSettingBars({
	data: override,
}: {
	data?: TargetSettingDatum[];
}) {
	const atomData = useAtomValue(targetSettingsDataAtom);
	const data = override ?? atomData;
	const rows = data.map((t) => ({
		yearLevel: t.yearLevel,
		target: t.targetAttainmentPct,
		current: t.currentAttainmentPct ?? 0,
	}));
	if (rows.length === 0) return <ChartEmptyState />;
	// Current attainment is not joined by the atom yet — omit that series rather
	// than drawing zero-height bars (see `TargetSettingDatum`).
	const hasCurrent = data.some((t) => t.currentAttainmentPct != null);
	return (
		<EChartsBarChart
			data={rows}
			config={targetConfig}
			xDataKey="yearLevel"
			className="h-full w-full"
			stackType="stacked"
		>
			<EChartsBarChart.Grid />
			<EChartsBarChart.XAxis dataKey="yearLevel" />
			<EChartsBarChart.YAxis
				tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
			/>
			<EChartsBarChart.Tooltip />
			<EChartsBarChart.Legend />
			<EChartsBarChart.Bar dataKey="target" />
			{hasCurrent ? <EChartsBarChart.Bar dataKey="current" /> : null}
		</EChartsBarChart>
	);
}

/** Mapped CLO coverage per PLO from the CLO-PLO curriculum matrix. */
export function CurriculumCoverageBars({
	data: override,
}: {
	data?: CurriculumCoverageDatum[];
}) {
	const atomData = useAtomValue(curriculumCoverageDataAtom);
	const data = override ?? atomData;
	const byPlo = data.reduce<Record<string, number>>((acc, m) => {
		acc[m.ploCode] = (acc[m.ploCode] ?? 0) + 1;
		return acc;
	}, {});
	const rows = Object.entries(byPlo).map(([ploCode, mapped]) => ({
		ploCode,
		mapped,
	}));
	if (rows.length === 0) return <ChartEmptyState />;
	return (
		<EChartsBarChart
			data={rows}
			config={coverageConfig}
			xDataKey="ploCode"
			className="h-full w-full"
		>
			<EChartsBarChart.Grid />
			<EChartsBarChart.XAxis dataKey="ploCode" />
			<EChartsBarChart.YAxis label="CLOs" />
			<EChartsBarChart.Tooltip />
			<EChartsBarChart.Bar dataKey="mapped" variant="expandable" />
		</EChartsBarChart>
	);
}

/** Direct vs indirect assessment load across the calendar months. */
export function ScheduleLoadBars({
	data: override,
}: {
	data?: ScheduleDatum[];
}) {
	const atomData = useAtomValue(scheduleDataAtom);
	const data = override ?? atomData;
	const rows = data.map((s) => ({
		month: s.month,
		direct: s.directAssessments,
		indirect: s.indirectAssessments,
	}));
	if (rows.length === 0) return <ChartEmptyState />;
	return (
		<EChartsBarChart
			data={rows}
			config={scheduleConfig}
			xDataKey="month"
			className="h-full w-full"
			stackType="stacked"
		>
			<EChartsBarChart.Grid />
			<EChartsBarChart.XAxis dataKey="month" />
			<EChartsBarChart.YAxis label="Assessments" />
			<EChartsBarChart.Tooltip />
			<EChartsBarChart.Legend />
			<EChartsBarChart.Bar dataKey="direct" />
			<EChartsBarChart.Bar dataKey="indirect" />
		</EChartsBarChart>
	);
}

/** Mapped PEO coverage per PLO from the PLO-PEO matrix (`PloToPeoMap`). */
export function PloToPeoCoverageBars({
	data: override,
}: {
	data?: PloToPeoCoverageDatum[];
}) {
	const atomData = useAtomValue(ploToPeoCoverageDataAtom);
	const data = override ?? atomData;
	const byPlo = data.reduce<Record<string, number>>((acc, m) => {
		acc[m.ploCode] = (acc[m.ploCode] ?? 0) + (m.mapped ? 1 : 0);
		return acc;
	}, {});
	const rows = Object.entries(byPlo).map(([ploCode, mapped]) => ({
		ploCode,
		mapped,
	}));
	if (rows.length === 0) return <ChartEmptyState />;
	return (
		<EChartsBarChart
			data={rows}
			config={peoCoverageConfig}
			xDataKey="ploCode"
			className="h-full w-full"
		>
			<EChartsBarChart.Grid />
			<EChartsBarChart.XAxis dataKey="ploCode" />
			<EChartsBarChart.YAxis label="PEOs" />
			<EChartsBarChart.Tooltip />
			<EChartsBarChart.Bar dataKey="mapped" variant="expandable" />
		</EChartsBarChart>
	);
}

/** Donut of assessment items by type (direct vs indirect). */
export function AssessmentTypeDonut({
	data: override,
}: {
	data?: AssessmentTypeDatum[];
}) {
	const atomData = useAtomValue(assessmentTypesDataAtom);
	const data = override ?? atomData;
	const rows = data.map((a) => ({ type: a.type, count: a.itemCount }));
	return (
		<PieDonutLayout
			data={rows}
			config={assessmentTypeConfig}
			dataKey="count"
			nameKey="type"
			caption="Assessment items"
		/>
	);
}

/** Distribution of students across year levels (Y1-Y4). */
export function StudentYearLevelBars({
	data: override,
}: {
	data?: StudentYearLevelDatum[];
}) {
	const atomData = useAtomValue(studentYearLevelsDataAtom);
	const data = override ?? atomData;
	const rows = data.map((s) => ({
		yearLevel: `Y${s.yearLevel}`,
		count: s.studentCount,
	}));
	if (rows.length === 0) return <ChartEmptyState />;
	return (
		<EChartsBarChart
			data={rows}
			config={yearLevelConfig}
			xDataKey="yearLevel"
			className="h-full w-full"
		>
			<EChartsBarChart.Grid />
			<EChartsBarChart.XAxis dataKey="yearLevel" />
			<EChartsBarChart.YAxis label="Students" />
			<EChartsBarChart.Tooltip />
			<EChartsBarChart.Bar dataKey="count" variant="expandable" />
		</EChartsBarChart>
	);
}
