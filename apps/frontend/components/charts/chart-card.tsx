/**
 * Presentational wrapper for a chart block. Renders a titled card that keeps
 * the EvilCharts canvas inside a defined (client-sized) height, mirroring the
 * stat-card styling used across the dashboards.
 */
export function ChartCard({
  title,
  description,
  children,
  className = "h-72",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 space-y-1">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className={className}>{children}</div>
    </section>
  );
}
