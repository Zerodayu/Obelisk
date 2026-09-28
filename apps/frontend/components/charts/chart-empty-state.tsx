/**
 * Empty-state placeholder rendered inside a chart frame when its dataset has
 * no rows.
 *
 * Every chart atom is seeded with `[]`, so this shows while the fetch is
 * pending, after it fails, and when the backend genuinely has no records yet
 * (or the dataset's route does not exist — see the TODO note on its atom).
 * Rendering an explicit empty state is deliberate: charts never fall back to
 * fabricated numbers.
 */
export function ChartEmptyState({
  title = "No data yet",
  description = "Records appear here once the backend has them for this view.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-6 text-center">
      <p className="text-muted-foreground text-xs font-medium">{title}</p>
      <p className="text-muted-foreground/70 max-w-56 text-2xs leading-relaxed">
        {description}
      </p>
    </div>
  );
}
