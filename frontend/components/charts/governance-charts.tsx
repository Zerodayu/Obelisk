"use client";

import { useAtomValue } from "jotai";

import type {
  ApprovalFlowDatum,
  AtRiskDatum,
  AuditActivityDatum,
  ClusterCompositionDatum,
  FormStatusDatum,
  RecommendationStatusDatum,
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
  formStatusCountsAtom,
  recommendationsDataAtom,
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
  count: { label: "Events", colors: { light: ["var(--chart-1)"] } },
} satisfies ChartConfig;

const riskConfig = {
  "Below 70% in direct CLO score": {
    label: "Direct <70%",
    colors: { light: ["var(--warning)"] },
  },
  "Below 70% in indirect CLO score": {
    label: "Indirect <70%",
    colors: { light: ["var(--destructive)"] },
  },
  "Multiple CLOs under threshold": {
    label: "Multiple CLOs <70%",
    colors: { light: ["var(--chart-3)"] },
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
      <EChartsBarChart.Bar dataKey="count" />
    </EChartsBarChart>
  );
}

/** Donut of the at-risk watchlist grouped by flag reason. */
export function AtRiskDonut({ data: override }: { data?: AtRiskDatum[] }) {
  const atomData = useAtomValue(atRiskDataAtom);
  const data = override ?? atomData;
  const rows = data.map((r) => ({ reason: r.reason, count: r.studentCount }));
  return (
    <PieDonutLayout
      data={rows}
      config={riskConfig}
      dataKey="count"
      nameKey="reason"
      caption="At-risk students"
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
