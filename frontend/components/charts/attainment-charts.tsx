"use client";

import { useAtomValue } from "jotai";

import type {
  CloAttainmentDatum,
  CohortTrendDatum,
  PloAttainmentDatum,
  ScoreBandDatum,
} from "@/components/charts/obe-sample-data";
import {
  type ChartConfig,
  EChartsBarChart,
} from "@/components/evilcharts/charts/echarts-bar-chart";
import {
  EChartsLineChart,
  type ChartConfig as LineConfig,
} from "@/components/evilcharts/charts/echarts-line-chart";
import {
  cloAttainmentsDataAtom,
  cohortTrendsDataAtom,
  ploAttainmentsDataAtom,
  scoreBandsDataAtom,
} from "@/lib/store/atoms/attainments";

const FLOOR_NOTE =
  "Composite = Direct × 70% + Indirect × 30%. The ≥70% floor is enforced server-side.";

const attainmentConfig = {
  direct: {
    label: "Direct",
    colors: { light: ["var(--chart-1)"] },
  },
  indirect: {
    label: "Indirect",
    colors: { light: ["var(--info)"] },
  },
  composite: {
    label: "Composite",
    colors: { light: ["var(--chart-3)"] },
  },
} satisfies ChartConfig;

const floorConfig = {
  met: { label: "MET ≥70%", colors: { light: ["var(--success)"] } },
  notMet: {
    label: "NOT MET <70%",
    colors: { light: ["var(--destructive)"] },
  },
} satisfies ChartConfig;

const ploConfig = {
  attained: {
    label: "Attained",
    colors: { light: ["var(--chart-1)"] },
  },
  target: {
    label: "Target",
    colors: { light: ["var(--muted-foreground)"] },
  },
} satisfies ChartConfig;

const bandConfig = {
  count: {
    label: "Students",
    colors: { light: ["var(--info)"] },
  },
} satisfies ChartConfig;

const cohortConfig = {
  Y1: { label: "Year 1", colors: { light: ["var(--chart-1)"] } },
  Y2: { label: "Year 2", colors: { light: ["var(--chart-3)"] } },
  Y3: { label: "Year 3", colors: { light: ["var(--warning)"] } },
  Y4: { label: "Year 4", colors: { light: ["var(--success)"] } },
} satisfies LineConfig;

/** Grouped bars of direct / indirect / composite CLO attainment (CHECK roll-up). */
export function CloAttainmentBars({
  data: override,
}: {
  data?: CloAttainmentDatum[];
}) {
  const atomData = useAtomValue(cloAttainmentsDataAtom);
  const data = override ?? atomData;
  const rows = data.map((c) => ({
    cloCode: c.cloCode,
    direct: c.directScorePct,
    indirect: c.indirectScorePct,
    composite: c.compositeScorePct,
  }));

  return (
    <EChartsBarChart
      data={rows}
      config={attainmentConfig}
      xDataKey="cloCode"
      className="h-full w-full"
      stackType="stacked"
    >
      <EChartsBarChart.Grid />
      <EChartsBarChart.XAxis dataKey="cloCode" />
      <EChartsBarChart.YAxis
        tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
        label="Attainment"
      />
      <EChartsBarChart.Tooltip />
      <EChartsBarChart.Legend />
      <EChartsBarChart.Bar dataKey="direct" />
      <EChartsBarChart.Bar dataKey="indirect" />
      <EChartsBarChart.Bar dataKey="composite" />
    </EChartsBarChart>
  );
}

/** Grouped bars of PLO attainment vs the configured target (≥70% floor). */
export function PloAttainmentBars({
  data: override,
}: {
  data?: PloAttainmentDatum[];
}) {
  const atomData = useAtomValue(ploAttainmentsDataAtom);
  const data = override ?? atomData;
  const rows = data.map((p) => ({
    ploCode: p.ploCode,
    attained: p.attainedPct,
    target: p.targetAttainmentPct,
  }));

  return (
    <EChartsBarChart
      data={rows}
      config={ploConfig}
      xDataKey="ploCode"
      className="h-full w-full"
      stackType="stacked"
    >
      <EChartsBarChart.Grid />
      <EChartsBarChart.XAxis dataKey="ploCode" />
      <EChartsBarChart.YAxis
        tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
        label="Attainment"
      />
      <EChartsBarChart.Tooltip />
      <EChartsBarChart.Legend />
      <EChartsBarChart.Bar dataKey="attained" />
      <EChartsBarChart.Bar dataKey="target" />
    </EChartsBarChart>
  );
}

/**
 * Split bars that color each CLO MET (green) / NOT MET (red) against the
 * ≥70% hard floor — the two series hold nulls so a single value shows per label.
 * Data derives from the shared CLO-attainment atom (server-flagged threshold).
 */
export function AttainmentFloorBars() {
  const data = useAtomValue(cloAttainmentsDataAtom);
  const rows = data.map((c) => ({
    label: c.cloCode,
    met: c.isBelowThreshold ? null : c.compositeScorePct,
    notMet: c.isBelowThreshold ? c.compositeScorePct : null,
  }));

  return (
    <EChartsBarChart
      data={rows}
      config={floorConfig}
      xDataKey="label"
      className="h-full w-full"
      stackType="stacked"
    >
      <EChartsBarChart.Grid />
      <EChartsBarChart.XAxis dataKey="label" />
      <EChartsBarChart.YAxis
        tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
      />
      <EChartsBarChart.Tooltip />
      <EChartsBarChart.Legend />
      <EChartsBarChart.Bar dataKey="met" />
      <EChartsBarChart.Bar dataKey="notMet" />
    </EChartsBarChart>
  );
}

/** Longitudinal per-cohort composite attainment across terms (cohort tracking). */
export function CohortTrendLines({
  data: override,
}: {
  data?: CohortTrendDatum[];
}) {
  const atomData = useAtomValue(cohortTrendsDataAtom);
  const data = override ?? atomData;
  const terms = [...new Set(data.map((d) => d.term))];
  const rows = terms.map((term) => {
    const row: Record<string, unknown> = { term };
    for (const cohort of ["Y1", "Y2", "Y3", "Y4"] as const) {
      row[cohort] =
        data.find((d) => d.term === term && d.cohort === cohort)
          ?.compositeScorePct ?? null;
    }
    return row;
  });

  return (
    <EChartsLineChart
      data={rows}
      config={cohortConfig}
      xDataKey="term"
      className="h-full w-full"
      curveType="monotone"
    >
      <EChartsLineChart.Grid />
      <EChartsLineChart.XAxis dataKey="term" />
      <EChartsLineChart.YAxis
        tickFormatter={(value) => `${value}%`}
        label="Attainment"
      />
      <EChartsLineChart.Tooltip />
      <EChartsLineChart.Legend />
      <EChartsLineChart.Line dataKey="Y1" strokeWidth={2} />
      <EChartsLineChart.Line dataKey="Y2" strokeWidth={2} />
      <EChartsLineChart.Line dataKey="Y3" strokeWidth={2} />
      <EChartsLineChart.Line dataKey="Y4" strokeWidth={2} />
    </EChartsLineChart>
  );
}

/** Distribution of students across the 4-tier rubric bands. */
export function ScoreBandBars({ data: override }: { data?: ScoreBandDatum[] }) {
  const atomData = useAtomValue(scoreBandsDataAtom);
  const data = override ?? atomData;
  const rows = data.map((b) => ({ band: b.band, count: b.studentCount }));
  return (
    <EChartsBarChart
      data={rows}
      config={bandConfig}
      xDataKey="band"
      className="h-full w-full"
    >
      <EChartsBarChart.Grid />
      <EChartsBarChart.XAxis
        dataKey="band"
        tickFormatter={(v) => v.split(" ")[0]}
      />
      <EChartsBarChart.YAxis label="Students" />
      <EChartsBarChart.Tooltip />
      <EChartsBarChart.Bar dataKey="count" />
    </EChartsBarChart>
  );
}

export const ATTAINMENT_FLOOR_NOTE = FLOOR_NOTE;
