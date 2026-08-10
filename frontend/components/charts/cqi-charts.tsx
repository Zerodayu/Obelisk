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
    colors: { light: ["#6d28d9"], dark: ["#a78bfa"] },
  },
  target: {
    label: "Target",
    colors: { light: ["#475569"], dark: ["#94a3b8"] },
  },
} satisfies ChartConfig;

const actionConfig = {
  planned: {
    label: "Planned",
    colors: { light: ["#d97706"], dark: ["#fbbf24"] },
  },
  completed: {
    label: "Completed",
    colors: { light: ["#059669"], dark: ["#34d399"] },
  },
} satisfies ChartConfig;

const causeConfig = {
  "Curriculum Design": {
    label: "Curriculum Design",
    colors: { light: ["#6d28d9"], dark: ["#a78bfa"] },
  },
  "Instruction & Pedagogy": {
    label: "Instruction & Pedagogy",
    colors: { light: ["#db2777"], dark: ["#f472b6"] },
  },
  "Assessment Design": {
    label: "Assessment Design",
    colors: { light: ["#d97706"], dark: ["#fbbf24"] },
  },
  "Student Factors": {
    label: "Student Factors",
    colors: { light: ["#2563eb"], dark: ["#60a5fa"] },
  },
  "Resources & Tools": {
    label: "Resources & Tools",
    colors: { light: ["#059669"], dark: ["#34d399"] },
  },
  "Industry & Field Alignment": {
    label: "Industry & Field Alignment",
    colors: { light: ["#7c3aed"], dark: ["#c4b5fd"] },
  },
} satisfies PieConfig;

const loopConfig = {
  CLOSED: {
    label: "CLOSED",
    colors: { light: ["#059669"], dark: ["#34d399"] },
  },
  "OPEN — Re-assess": {
    label: "OPEN — Re-assess",
    colors: { light: ["#d97706"], dark: ["#fbbf24"] },
  },
  "OPEN — Not Implemented": {
    label: "OPEN — Not Implemented",
    colors: { light: ["#dc2626"], dark: ["#f87171"] },
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
