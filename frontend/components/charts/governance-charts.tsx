"use client";

import {
  type ApprovalFlowDatum,
  type AtRiskDatum,
  type AuditActivityDatum,
  type ClusterCompositionDatum,
  type FormStatusDatum,
  MOCK_APPROVAL_FLOW,
  MOCK_AT_RISK,
  MOCK_AUDIT_ACTIVITY,
  MOCK_CLUSTER_COMPOSITION,
  MOCK_FORM_STATUSES,
  MOCK_RECOMMENDATIONS,
  type RecommendationStatusDatum,
} from "@/components/charts/obe-sample-data";
import {
  type ChartConfig,
  EChartsBarChart,
} from "@/components/evilcharts/charts/echarts-bar-chart";
import {
  EChartsPieChart,
  type ChartConfig as PieConfig,
} from "@/components/evilcharts/charts/echarts-pie-chart";

const statusConfig = {
  draft: { label: "Draft", colors: { light: ["#64748b"], dark: ["#94a3b8"] } },
  submitted: {
    label: "Submitted",
    colors: { light: ["#2563eb"], dark: ["#60a5fa"] },
  },
  returned: {
    label: "Returned",
    colors: { light: ["#d97706"], dark: ["#fbbf24"] },
  },
  approved: {
    label: "Approved",
    colors: { light: ["#059669"], dark: ["#34d399"] },
  },
  archived: {
    label: "Archived",
    colors: { light: ["#6d28d9"], dark: ["#a78bfa"] },
  },
} satisfies PieConfig;

const flowConfig = {
  approved: {
    label: "Approved",
    colors: { light: ["#059669"], dark: ["#34d399"] },
  },
  pending: {
    label: "Pending",
    colors: { light: ["#2563eb"], dark: ["#60a5fa"] },
  },
  returned: {
    label: "Returned",
    colors: { light: ["#d97706"], dark: ["#fbbf24"] },
  },
} satisfies ChartConfig;

const auditConfig = {
  count: { label: "Events", colors: { light: ["#6d28d9"], dark: ["#a78bfa"] } },
} satisfies ChartConfig;

const riskConfig = {
  "Below 70% in direct CLO score": {
    label: "Direct <70%",
    colors: { light: ["#d97706"], dark: ["#fbbf24"] },
  },
  "Below 70% in indirect CLO score": {
    label: "Indirect <70%",
    colors: { light: ["#dc2626"], dark: ["#f87171"] },
  },
  "Multiple CLOs under threshold": {
    label: "Multiple CLOs <70%",
    colors: { light: ["#db2777"], dark: ["#f472b6"] },
  },
} satisfies PieConfig;

const recommendationConfig = {
  pending_review: {
    label: "Pending review",
    colors: { light: ["#2563eb"], dark: ["#60a5fa"] },
  },
  acknowledged: {
    label: "Acknowledged",
    colors: { light: ["#d97706"], dark: ["#fbbf24"] },
  },
  actioned: {
    label: "Actioned",
    colors: { light: ["#059669"], dark: ["#34d399"] },
  },
  dismissed: {
    label: "Dismissed",
    colors: { light: ["#64748b"], dark: ["#94a3b8"] },
  },
} satisfies PieConfig;

const clusterConfig = {
  graduated: {
    label: "Graduated",
    colors: { light: ["#059669"], dark: ["#34d399"] },
  },
  transferee: {
    label: "Transferee",
    colors: { light: ["#d97706"], dark: ["#fbbf24"] },
  },
  withdrawn: {
    label: "Withdrawn",
    colors: { light: ["#dc2626"], dark: ["#f87171"] },
  },
} satisfies PieConfig;

/** Donut of form submission statuses (draft → archived). */
export function FormStatusDonut({
  data = MOCK_FORM_STATUSES,
}: {
  data?: FormStatusDatum[];
}) {
  const rows = data.map((f) => ({ status: f.status, count: f.count }));
  return (
    <EChartsPieChart
      data={rows}
      config={statusConfig}
      dataKey="count"
      nameKey="status"
      className="h-full w-full"
    >
      <EChartsPieChart.Pie innerRadius="58%" paddingAngle={2} cornerRadius={4}>
        <EChartsPieChart.Label position="inside" dataKey="count" />
      </EChartsPieChart.Pie>
      <EChartsPieChart.Tooltip />
      <EChartsPieChart.Legend align="center" />
    </EChartsPieChart>
  );
}

/** Stacked bar of the approval chain: pending / approved / returned per role. */
export function ApprovalFlowBars({
  data = MOCK_APPROVAL_FLOW,
}: {
  data?: ApprovalFlowDatum[];
}) {
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
  data = MOCK_AUDIT_ACTIVITY,
}: {
  data?: AuditActivityDatum[];
}) {
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
export function AtRiskDonut({ data = MOCK_AT_RISK }: { data?: AtRiskDatum[] }) {
  const rows = data.map((r) => ({ reason: r.reason, count: r.studentCount }));
  return (
    <EChartsPieChart
      data={rows}
      config={riskConfig}
      dataKey="count"
      nameKey="reason"
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

/** Donut of AI recommendation review statuses. */
export function RecommendationDonut({
  data = MOCK_RECOMMENDATIONS,
}: {
  data?: RecommendationStatusDatum[];
}) {
  const rows = data.map((r) => ({ status: r.status, count: r.count }));
  return (
    <EChartsPieChart
      data={rows}
      config={recommendationConfig}
      dataKey="count"
      nameKey="status"
      className="h-full w-full"
    >
      <EChartsPieChart.Pie innerRadius="58%" paddingAngle={2} cornerRadius={4}>
        <EChartsPieChart.Label position="inside" dataKey="count" />
      </EChartsPieChart.Pie>
      <EChartsPieChart.Tooltip />
      <EChartsPieChart.Legend align="center" />
    </EChartsPieChart>
  );
}

/** Donut of graduation-cluster composition by archived student status. */
export function ClusterCompositionDonut({
  data = MOCK_CLUSTER_COMPOSITION,
}: {
  data?: ClusterCompositionDatum[];
}) {
  const rows = data.map((c) => ({ status: c.status, count: c.studentCount }));
  return (
    <EChartsPieChart
      data={rows}
      config={clusterConfig}
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
