"use client";

import {
  type ChartConfig,
  EChartsPieChart,
} from "@/components/evilcharts/charts/echarts-pie-chart";

/**
 * Shared donut layout — donut on the left with a center total overlay and a
 * right-hand legend list (label + value per category). Mirrors
 * `components/examples/pie-chart-ex.tsx`. Swatches read the sector color from
 * `config`, so the legend always matches the pie fill.
 */
export function PieDonutLayout<TData extends Record<string, unknown>>({
  data,
  config,
  dataKey,
  nameKey,
  caption,
  borderColor,
  formatValue = (value) => value.toLocaleString("en-US"),
}: {
  data: TData[];
  config: ChartConfig;
  dataKey: keyof TData & string;
  nameKey: keyof TData & string;
  caption: string;
  borderColor?: string; // sector gap color — any CSS color or `var(--…)` theme token; defaults to the frame panel background
  formatValue?: (value: number) => string;
}) {
  const total = data.reduce((sum, row) => sum + (Number(row[dataKey]) || 0), 0);

  return (
    <div className="flex h-full w-full items-center gap-3 p-4 sm:gap-6">
      <div className="relative aspect-square w-[40%] max-w-72 shrink-0">
        <EChartsPieChart
          data={data}
          config={config}
          dataKey={dataKey}
          nameKey={nameKey}
          className="h-full w-full"
        >
          <EChartsPieChart.Tooltip />
          <EChartsPieChart.Pie
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={6}
            cornerRadius={12}
            startAngle={90}
            endAngle={-270}
            borderColor={borderColor}
          />
        </EChartsPieChart>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="border-border flex aspect-square w-[56%] flex-col items-center justify-center rounded-full border border-dashed">
            <span className="text-foreground font-mono text-lg leading-none font-semibold tracking-tight sm:text-2xl">
              {formatValue(total)}
            </span>
            <span className="text-muted-foreground font-mono mt-1 text-2xs sm:text-xs">
              {caption}
            </span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">
        {data.map((row) => {
          const name = String(row[nameKey]);
          const item = config[name];
          const label = typeof item?.label === "string" ? item.label : name;
          const color =
            item?.colors?.light?.[0] ?? item?.colors?.dark?.[0] ?? "";
          const value = Number(row[dataKey]) || 0;
          return (
            <div key={name} className="flex items-center gap-2 py-1.5 sm:py-2">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: color }}
              />
              <span className="text-muted-foreground truncate text-xs">
                {label}
              </span>
              <span className="text-foreground ml-auto text-xs font-semibold">
                {formatValue(value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
