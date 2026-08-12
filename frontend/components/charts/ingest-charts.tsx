"use client";

import { useAtomValue } from "jotai";

import type {
  ComputationRunDatum,
  UploadStatusDatum,
} from "@/components/charts/obe-sample-data";
import { PieDonutLayout } from "@/components/charts/pie-donut-layout";
import {
  type ChartConfig,
  EChartsBarChart,
} from "@/components/evilcharts/charts/echarts-bar-chart";
import {
  computationRunsDataAtom,
  uploadStatusesDataAtom,
} from "@/lib/store/atoms/ingest";

const uploadConfig = {
  queued: {
    label: "Queued",
    colors: { light: ["var(--info)"] },
  },
  completed: {
    label: "Completed",
    colors: { light: ["var(--success)"] },
  },
  failed: {
    label: "Failed",
    colors: { light: ["var(--destructive)"] },
  },
} satisfies ChartConfig;

const runConfig = {
  runCount: {
    label: "Runs",
    colors: { light: ["var(--chart-3)"] },
  },
} satisfies ChartConfig;

/** Donut of class-record upload statuses (`UploadRecord.status`). */
export function UploadStatusDonut({
  data: override,
}: {
  data?: UploadStatusDatum[];
}) {
  const atomData = useAtomValue(uploadStatusesDataAtom);
  const data = override ?? atomData;
  const rows = data.map((u) => ({ status: u.status, count: u.count }));
  return (
    <PieDonutLayout
      data={rows}
      config={uploadConfig}
      dataKey="count"
      nameKey="status"
      caption="Total uploads"
    />
  );
}

/** 70/30 computation-run volume per term (`ComputationRun`). */
export function ComputationRunBars({
  data: override,
}: {
  data?: ComputationRunDatum[];
}) {
  const atomData = useAtomValue(computationRunsDataAtom);
  const data = override ?? atomData;
  const rows = data.map((r) => ({ term: r.term, runCount: r.runCount }));
  return (
    <EChartsBarChart
      data={rows}
      config={runConfig}
      xDataKey="term"
      className="h-full w-full"
    >
      <EChartsBarChart.Grid />
      <EChartsBarChart.XAxis dataKey="term" />
      <EChartsBarChart.YAxis label="Runs" />
      <EChartsBarChart.Tooltip />
      <EChartsBarChart.Bar dataKey="runCount" variant="expandable" />
    </EChartsBarChart>
  );
}
