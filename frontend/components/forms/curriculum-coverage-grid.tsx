"use client";

import { useAtomValue } from "jotai";

import type { CurriculumCoverageDatum } from "@/components/charts/obe-sample-data";
import { curriculumCoverageDataAtom } from "@/lib/store/atoms/plan";

/**
 * CLO-PLO curriculum-map coverage grid. Reads the shared curriculum-coverage
 * atom so the coverage check (≥1 mapped CLO per PLO) reflects the same data
 * as the coverage chart.
 */
export function CurriculumCoverageGrid() {
  const coverage = useAtomValue(curriculumCoverageDataAtom);
  const plos = [...new Set(coverage.map((m) => m.ploCode))].sort();

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {plos.map((plo) => (
        <CoverageCell
          key={plo}
          plo={plo}
          mapped={coverage.filter((m) => m.ploCode === plo)}
        />
      ))}
    </div>
  );
}

function CoverageCell({
  plo,
  mapped,
}: {
  plo: string;
  mapped: CurriculumCoverageDatum[];
}) {
  const passed = mapped.length > 0;
  return (
    <div
      className={`rounded-xl border p-3 text-sm shadow-sm ${
        passed ? "border-emerald-500/40 bg-card" : "border-red-500/50 bg-card"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold">{plo}</span>
        <span className="text-xs text-muted-foreground">
          {passed ? "✓ Covered" : "✗ Gap"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {mapped.length} CLO{mapped.length === 1 ? "" : "s"} ·{" "}
        {mapped.map((m) => m.cloCode).join(", ") || "unmapped"}
      </p>
    </div>
  );
}
