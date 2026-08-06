"use client";

/**
 * Shared presentational shell for role dashboards. Renders a scoped header
 * (title + the unit the role operates within) and a responsive stat-card row.
 *
 * Stat cards are placeholders awaiting backend rollup endpoints
 * (`rollups`/`dashboard` modules); each receives raw props today so wiring is a
 * drop-in later. Backend remains the source of truth — the client only shapes
 * the display and pass-through scope filters.
 */

export interface StatCard {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn" | "danger" | "ok";
}

const toneClasses: Record<NonNullable<StatCard["tone"]>, string> = {
  default: "bg-card",
  warn: "bg-card border-amber-500/40",
  danger: "bg-card border-red-500/50",
  ok: "bg-card border-emerald-500/40",
};

export function DashboardShell({
  title,
  scopeLabel,
  description,
  stats,
  children,
}: {
  title: string;
  scopeLabel?: string;
  description?: string;
  stats?: StatCard[];
  children?: React.ReactNode;
}) {
  return (
    <div className="px-4 lg:px-6 space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {scopeLabel ? (
            <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {scopeLabel}
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>

      {stats && stats.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={`rounded-xl border p-4 shadow-sm ${toneClasses[stat.tone ?? "default"]}`}
            >
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {stat.value}
              </p>
              {stat.hint ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {stat.hint}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {children}
    </div>
  );
}

/** Placeholder block explaining that data is server-wired but not yet available. */
export function PendingSection({ label }: { label: string }) {
  return (
    <section className="rounded-xl border border-dashed bg-muted/40 p-8 text-center">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Wired to the backend API client; renders once the rollup endpoint lands.
      </p>
    </section>
  );
}
