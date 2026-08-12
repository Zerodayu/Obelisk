"use client";

import {
  type BudgetLineDatum,
  type CurriculumCoverageDatum,
  MOCK_BUDGET_LINES,
  MOCK_CURRICULUM_COVERAGE,
  MOCK_SCHEDULE,
  MOCK_TARGET_SETTINGS,
  type ScheduleDatum,
  type TargetSettingDatum,
} from "@/components/charts/obe-sample-data";
import {
  type ChartConfig,
  EChartsBarChart,
} from "@/components/evilcharts/charts/echarts-bar-chart";
import {
  EChartsPieChart,
  type ChartConfig as PieConfig,
} from "@/components/evilcharts/charts/echarts-pie-chart";

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
    colors: { light: ["var(--chart-1)"] },
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
} satisfies PieConfig;

/** Planned vs spent budget per line item (PHP thousands). */
export function BudgetVsActualBars({
  data = MOCK_BUDGET_LINES,
}: {
  data?: BudgetLineDatum[];
}) {
  const rows = data.map((b) => ({
    lineItem: b.lineItem.split(" ")[0],
    planned: Math.round(b.planned / 1000),
    spent: Math.round(b.spent / 1000),
  }));
  return (
    <EChartsBarChart
      data={rows}
      config={budgetConfig}
      xDataKey="lineItem"
      className="h-full w-full"
    >
      <EChartsBarChart.Grid />
      <EChartsBarChart.XAxis dataKey="lineItem" />
      <EChartsBarChart.YAxis label="PHP (000)" />
      <EChartsBarChart.Tooltip />
      <EChartsBarChart.Legend />
      <EChartsBarChart.Bar dataKey="planned" />
      <EChartsBarChart.Bar dataKey="spent" />
    </EChartsBarChart>
  );
}

/** Donut of the approved budget allocation by PDCA phase. */
export function BudgetPhaseDonut({
  data = MOCK_BUDGET_LINES,
}: {
  data?: BudgetLineDatum[];
}) {
  const byPhase = data.reduce<Record<string, number>>((acc, line) => {
    acc[line.phase] = (acc[line.phase] ?? 0) + line.planned;
    return acc;
  }, {});
  const rows = Object.entries(byPhase).map(([phase, planned]) => ({
    phase,
    planned,
  }));
  return (
    <EChartsPieChart
      data={rows}
      config={phaseConfig}
      dataKey="planned"
      nameKey="phase"
      className="h-full w-full"
    >
      <EChartsPieChart.Pie innerRadius="58%" paddingAngle={2} cornerRadius={4}>
        <EChartsPieChart.Label position="inside" dataKey="planned" />
      </EChartsPieChart.Pie>
      <EChartsPieChart.Tooltip />
      <EChartsPieChart.Legend align="center" />
    </EChartsPieChart>
  );
}

/** Target vs current attainment per year level (target-setting matrix). */
export function TargetSettingBars({
  data = MOCK_TARGET_SETTINGS,
}: {
  data?: TargetSettingDatum[];
}) {
  const rows = data.map((t) => ({
    yearLevel: t.yearLevel,
    target: t.targetAttainmentPct,
    current: t.currentAttainmentPct,
  }));
  return (
    <EChartsBarChart
      data={rows}
      config={targetConfig}
      xDataKey="yearLevel"
      className="h-full w-full"
    >
      <EChartsBarChart.Grid />
      <EChartsBarChart.XAxis dataKey="yearLevel" />
      <EChartsBarChart.YAxis
        tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
      />
      <EChartsBarChart.Tooltip />
      <EChartsBarChart.Legend />
      <EChartsBarChart.Bar dataKey="target" variant="stripped" />
      <EChartsBarChart.Bar dataKey="current" />
    </EChartsBarChart>
  );
}

/** Mapped CLO coverage per PLO from the CLO-PLO curriculum matrix. */
export function CurriculumCoverageBars({
  data = MOCK_CURRICULUM_COVERAGE,
}: {
  data?: CurriculumCoverageDatum[];
}) {
  const byPlo = data.reduce<Record<string, number>>((acc, m) => {
    acc[m.ploCode] = (acc[m.ploCode] ?? 0) + 1;
    return acc;
  }, {});
  const rows = Object.entries(byPlo).map(([ploCode, mapped]) => ({
    ploCode,
    mapped,
  }));
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
      <EChartsBarChart.Bar dataKey="mapped" />
    </EChartsBarChart>
  );
}

/** Direct vs indirect assessment load across the calendar months. */
export function ScheduleLoadBars({
  data = MOCK_SCHEDULE,
}: {
  data?: ScheduleDatum[];
}) {
  const rows = data.map((s) => ({
    month: s.month,
    direct: s.directAssessments,
    indirect: s.indirectAssessments,
  }));
  return (
    <EChartsBarChart
      data={rows}
      config={scheduleConfig}
      xDataKey="month"
      className="h-full w-full"
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
