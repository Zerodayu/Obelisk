"use client";

import {
  type CqiActionDatum,
  type LoopStatusDatum,
  MOCK_CQI_ACTIONS,
  MOCK_LOOP_STATUSES,
  MOCK_PLO_GAPS,
  MOCK_ROOT_CAUSES,
  type PloGapDatum,
  type RootCauseDatum,
} from "@/components/charts/obe-sample-data";
import {
  type ChartConfig,
  EChartsBarChart,
} from "@/components/evilcharts/charts/echarts-bar-chart";
import {
  EChartsPieChart,
  type ChartConfig as PieConfig,
} from "@/components/evilcharts/charts/echarts-pie-chart";

const gapConfig = {
  attained: {
    label: "Attained",
    colors: { light: ["var(--chart-1)"] },
  },
  target: {
    label: "Target",
    colors: { light: ["var(--muted-foreground)"] },
  },
} satisfies ChartConfig;

const actionConfig = {
  planned: {
    label: "Planned",
    colors: { light: ["var(--warning)"] },
  },
  completed: {
    label: "Completed",
    colors: { light: ["var(--success)"] },
  },
} satisfies ChartConfig;

const causeConfig = {
  "Curriculum Design": {
    label: "Curriculum Design",
    colors: { light: ["var(--chart-1)"] },
  },
  "Instruction & Pedagogy": {
    label: "Instruction & Pedagogy",
    colors: { light: ["var(--chart-3)"] },
  },
  "Assessment Design": {
    label: "Assessment Design",
    colors: { light: ["var(--warning)"] },
  },
  "Student Factors": {
    label: "Student Factors",
    colors: { light: ["var(--info)"] },
  },
  "Resources & Tools": {
    label: "Resources & Tools",
    colors: { light: ["var(--success)"] },
  },
  "Industry & Field Alignment": {
    label: "Industry & Field Alignment",
    colors: { light: ["var(--chart-2)"] },
  },
} satisfies PieConfig;

const loopConfig = {
  CLOSED: {
    label: "CLOSED",
    colors: { light: ["var(--success)"] },
  },
  "OPEN — Re-assess": {
    label: "OPEN — Re-assess",
    colors: { light: ["var(--warning)"] },
  },
  "OPEN — Not Implemented": {
    label: "OPEN — Not Implemented",
    colors: { light: ["var(--destructive)"] },
  },
} satisfies PieConfig;

/** Attained vs target bars with the gap shown (ACT phase gap analysis). */
export function GapAnalysisBars({
  data = MOCK_PLO_GAPS,
}: {
  data?: PloGapDatum[];
}) {
  const rows = data.map((g) => ({
    ploCode: g.ploCode,
    attained: g.attainedPct,
    target: g.targetAttainmentPct,
  }));

  return (
    <EChartsBarChart
      data={rows}
      config={gapConfig}
      xDataKey="ploCode"
      className="h-full w-full"
    >
      <EChartsBarChart.Grid />
      <EChartsBarChart.XAxis dataKey="ploCode" />
      <EChartsBarChart.YAxis
        tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
      />
      <EChartsBarChart.Tooltip />
      <EChartsBarChart.Legend />
      <EChartsBarChart.Bar dataKey="target" variant="stripped" />
      <EChartsBarChart.Bar dataKey="attained" variant="gradient" />
    </EChartsBarChart>
  );
}

/** Donut of the 6-category root-cause distribution (gap & systemic analysis). */
export function RootCauseDonut({
  data = MOCK_ROOT_CAUSES,
}: {
  data?: RootCauseDatum[];
}) {
  const rows = data.map((r) => ({
    category: r.category,
    count: r.count,
  }));
  return (
    <EChartsPieChart
      data={rows}
      config={causeConfig}
      dataKey="count"
      nameKey="category"
      className="h-full w-full"
    >
      <EChartsPieChart.Pie innerRadius="62%" paddingAngle={2} cornerRadius={4}>
        <EChartsPieChart.Label position="inside" dataKey="count" />
      </EChartsPieChart.Pie>
      <EChartsPieChart.Tooltip />
      <EChartsPieChart.Legend align="center" />
    </EChartsPieChart>
  );
}

/** Planned vs completed CQI actions per root-cause category. */
export function CqiActionsBars({
  data = MOCK_CQI_ACTIONS,
}: {
  data?: CqiActionDatum[];
}) {
  const rows = data.map((a) => ({
    rootCause: a.rootCause.split(" ")[0],
    planned: a.planned,
    completed: a.completed,
  }));
  return (
    <EChartsBarChart
      data={rows}
      config={actionConfig}
      xDataKey="rootCause"
      className="h-full w-full"
    >
      <EChartsBarChart.Grid />
      <EChartsBarChart.XAxis dataKey="rootCause" />
      <EChartsBarChart.YAxis label="Plans" />
      <EChartsBarChart.Tooltip />
      <EChartsBarChart.Legend />
      <EChartsBarChart.Bar dataKey="planned" />
      <EChartsBarChart.Bar dataKey="completed" />
    </EChartsBarChart>
  );
}

/** Donut of Closing-the-Loop statuses (computed server-side). */
export function LoopStatusDonut({
  data = MOCK_LOOP_STATUSES,
}: {
  data?: LoopStatusDatum[];
}) {
  const rows = data.map((l) => ({ status: l.status, count: l.count }));
  return (
    <EChartsPieChart
      data={rows}
      config={loopConfig}
      dataKey="count"
      nameKey="status"
      className="h-full w-full"
    >
      <EChartsPieChart.Pie innerRadius="60%" paddingAngle={2} cornerRadius={4}>
        <EChartsPieChart.Label position="inside" dataKey="count" />
      </EChartsPieChart.Pie>
      <EChartsPieChart.Tooltip />
      <EChartsPieChart.Legend align="center" />
    </EChartsPieChart>
  );
}
