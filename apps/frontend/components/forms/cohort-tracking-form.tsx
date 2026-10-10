"use client";

import { useAtomValue } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { ContextRequired } from "@/components/forms/context-required";
import { GeneratingState } from "@/components/forms/generating";
import { SubmissionStatusCard } from "@/components/forms/submission-status-card";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/components/ui/toast";
import { useAutoGenerate } from "@/lib/hooks/use-auto-generate";
import {
  selectedProgramIdAtom,
  selectedTermIdAtom,
} from "@/lib/store/atoms/academic";
import {
  generateCohortTracking,
  saveCohortAnnotations,
} from "@/server/actions/rollup";

// NOTE: types mirror `apps/backend/src/v1/rollup/compute.ts` + `model.ts` —
// one CLO/PLO column per code, one row per year-level cohort, one term at a time.
interface CohortCloRow {
  cloCode: string;
  cloDescription: string;
  attainmentPct: number;
  status: "MET" | "NOT MET";
}

interface CohortPloRow {
  ploCode: string;
  ploDescription: string;
  attainmentPct: number;
  achieved: boolean;
}

interface CohortTerm {
  termId: string;
  schoolYear: string;
  semester: string;
  rows: CohortCloRow[];
  plos: CohortPloRow[];
  averagePct: number | null;
}

interface CohortLine {
  yearLevel: number | null;
  terms: CohortTerm[];
  trend: "UP" | "DOWN" | "FLAT";
  cqiTriggered: boolean;
}

interface CohortAnnotation {
  yearLevel: number | null;
  termId: string;
  cloCode: string;
  cqiFlag?: boolean;
  followUp: string;
}

interface CohortPayload {
  programId: string;
  formSubmissionId: string | null;
  generatedAt: string;
  program: { code: string; name: string };
  lines: CohortLine[];
  annotations: CohortAnnotation[];
  // NOTE: program-level rollup kept on the payload for dashboards — the table
  // reads the per-cohort `terms[].plos` instead.
  plos: {
    termId: string;
    ploCode: string;
    ploDescription: string;
    attainmentPct: number;
    achieved: boolean;
  }[];
}

/** `"2092-2093" + "1st"` → `"2092-2093 1st"`; a numeric semester keeps its dash. */
function termLabel(term: CohortTerm): string {
  return /^[12]$/.test(term.semester)
    ? `${term.schoolYear}-${term.semester}`
    : `${term.schoolYear} ${term.semester}`;
}

// NOTE: numeric order so CLO2/PLO2 precede CLO10/PLO10 — mirrors the backend sort.
function codeOrder(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

function trendIcon(trend: string) {
  if (trend === "UP") return <span className="text-success">↑</span>;
  if (trend === "DOWN") return <span className="text-destructive">↓</span>;
  return <span className="text-muted-foreground">→</span>;
}

function AttainmentCell({ pct, met }: { pct: number; met: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Badge variant={met ? "success-outline" : "warning-outline"}>
        {met ? "MET" : "NOT MET"}
      </Badge>
      <span className="text-muted-foreground font-mono text-xs tabular-nums">
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

export function CohortTrackingForm() {
  const [payload, setPayload] = useState<CohortPayload | null>(null);
  const [annotations, setAnnotations] = useState<CohortAnnotation[]>([]);
  // NOTE: academic context comes from the dashboard picker, not local state.
  const programId = useAtomValue(selectedProgramIdAtom);
  const termId = useAtomValue(selectedTermIdAtom);
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // NOTE: terms differ per cohort line (a year may have no data yet), so the
  // selector options are the union across lines, chronologically ordered.
  const terms = useMemo(() => {
    if (!payload) return [];
    const byId = new Map<string, CohortTerm>();
    for (const line of payload.lines) {
      for (const term of line.terms) {
        if (!byId.has(term.termId)) byId.set(term.termId, term);
      }
    }
    return [...byId.values()].sort(
      (a, b) =>
        a.schoolYear.localeCompare(b.schoolYear) ||
        a.semester.localeCompare(b.semester),
    );
  }, [payload]);

  const activeTermId =
    selectedTermId && terms.some((term) => term.termId === selectedTermId)
      ? selectedTermId
      : (terms[terms.length - 1]?.termId ?? null);

  const termOf = useCallback(
    (line: CohortLine) =>
      line.terms.find((term) => term.termId === activeTermId) ?? null,
    [activeTermId],
  );

  const cloCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const line of payload?.lines ?? []) {
      for (const row of termOf(line)?.rows ?? []) codes.add(row.cloCode);
    }
    return [...codes].sort(codeOrder);
  }, [payload, termOf]);

  const ploCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const line of payload?.lines ?? []) {
      for (const row of termOf(line)?.plos ?? []) codes.add(row.ploCode);
    }
    return [...codes].sort(codeOrder);
  }, [payload, termOf]);

  const handleGenerate = useCallback(async () => {
    if (!programId.trim()) return;
    setLoading(true);
    try {
      const result = await generateCohortTracking({
        programId: programId.trim(),
        termId: termId.trim() || undefined,
      });
      if (result.ok) {
        const p = result.data.payload as unknown as CohortPayload;
        setPayload(p);
        setAnnotations(p.annotations || []);
        // NOTE: fall back to the newest term of the fresh payload.
        setSelectedTermId(null);
        toast.create({ title: "Cohort tracking generated", type: "success" });
      } else {
        toastError({
          title: "Generate failed",
          description: result.error,
          scope: "cohort:generate",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [programId, termId]);

  // NOTE: term is optional here — the "*"" sentinel keeps the key complete
  // when no term is picked, so an empty term still auto-generates.
  const auto = useAutoGenerate([programId, termId || "*"], handleGenerate);

  const handleSaveAnnotations = useCallback(async () => {
    if (!payload?.formSubmissionId) return;
    setSaving(true);
    try {
      const result = await saveCohortAnnotations(
        payload.formSubmissionId,
        annotations,
      );
      if (result.ok) {
        toast.create({ title: "Annotations saved", type: "success" });
      } else {
        toastError({
          title: "Save failed",
          description: result.error,
          scope: "cohort:save",
        });
      }
    } finally {
      setSaving(false);
    }
  }, [payload, annotations]);

  const updateAnnotation = (
    idx: number,
    field: string,
    value: string | boolean | number | null,
  ) => {
    const next = [...annotations];
    next[idx] = { ...next[idx], [field]: value };
    setAnnotations(next);
  };

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Generate Cohort Tracking Sheet</FrameTitle>
          <FrameDescription>
            Track longitudinal CLO/PLO attainment across year-level cohorts and
            terms.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          {/* NOTE: term is optional for cohort tracking — program gates the form. */}
          {!programId ? (
            <ContextRequired scope="program" />
          ) : (
            <GeneratingState busy={loading || auto.busy} retry={auto.retry} />
          )}
        </FramePanel>
      </Frame>
    );
  }

  const hasRows = payload.lines.length > 0 && terms.length > 0;

  return (
    <div className="space-y-4">
      <SubmissionStatusCard submissionId={payload.formSubmissionId} />
      <Frame>
        <FrameHeader>
          <FrameTitle>{payload.program.name}</FrameTitle>
          <FrameDescription>
            Cohort tracking · Generated{" "}
            {new Date(payload.generatedAt).toLocaleString()}
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          {hasRows ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-muted-foreground text-xs">
                  One row per cohort · one column per CLO/PLO code · term
                  attainment ≥ 70% is MET.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Term</span>
                  <FormSelect
                    value={activeTermId ?? undefined}
                    onValueChange={setSelectedTermId}
                    options={terms.map((term) => ({
                      value: term.termId,
                      label: termLabel(term),
                    }))}
                    className="w-50"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4">Cohort</th>
                      {cloCodes.length > 0 && (
                        <th
                          className="py-2 pr-4 text-center"
                          colSpan={cloCodes.length}
                        >
                          CLO
                        </th>
                      )}
                      {ploCodes.length > 0 && (
                        <th
                          className="py-2 pr-4 text-center"
                          colSpan={ploCodes.length}
                        >
                          PLO
                        </th>
                      )}
                      <th className="py-2 pr-4 text-center">Trend</th>
                      <th className="py-2 pr-4 text-center">CQI</th>
                    </tr>
                    <tr className="border-b text-left text-muted-foreground text-xs">
                      <th />
                      {cloCodes.map((code) => (
                        <th key={code} className="py-1 pr-2 text-center">
                          {code}
                        </th>
                      ))}
                      {ploCodes.map((code) => (
                        <th key={code} className="py-1 pr-2 text-center">
                          {code}
                        </th>
                      ))}
                      <th />
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {payload.lines.map((line) => {
                      const term = termOf(line);
                      return (
                        <tr
                          key={line.yearLevel ?? "unassigned"}
                          className="border-b last:border-0"
                        >
                          <td className="py-2 pr-4 font-medium">
                            {/* NOTE: an unattributed cohort has no year label. */}
                            {line.yearLevel !== null
                              ? `Y${line.yearLevel}`
                              : "—"}
                          </td>
                          {cloCodes.map((code) => {
                            const row = term?.rows.find(
                              (r) => r.cloCode === code,
                            );
                            return (
                              <td key={code} className="px-2 py-2 text-center">
                                {row ? (
                                  <AttainmentCell
                                    pct={row.attainmentPct}
                                    met={row.status === "MET"}
                                  />
                                ) : (
                                  <span className="text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          {ploCodes.map((code) => {
                            const row = term?.plos.find(
                              (r) => r.ploCode === code,
                            );
                            return (
                              <td key={code} className="px-2 py-2 text-center">
                                {row ? (
                                  <AttainmentCell
                                    pct={row.attainmentPct}
                                    met={row.achieved}
                                  />
                                ) : (
                                  <span className="text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2 pr-2 text-center">
                            {trendIcon(line.trend)}
                          </td>
                          <td className="py-2 pr-2 text-center">
                            {line.cqiTriggered && (
                              <Badge variant="destructive">CQI</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No cohort data for this program yet — ingest a class record first.
            </p>
          )}
        </FramePanel>
      </Frame>

      {/* Annotations */}
      {annotations.length > 0 && (
        <Frame>
          <FrameHeader>
            <FrameTitle>CQI Follow-Up Annotations</FrameTitle>
            <FrameDescription>
              Add follow-up notes for flagged CLO cohorts.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="space-y-3">
              {annotations.map((ann, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-2 sm:flex-row sm:items-start"
                >
                  <div className="text-sm font-medium pt-2 sm:w-25 shrink-0">
                    {ann.yearLevel ? `Y${ann.yearLevel}` : "All"}
                  </div>
                  <div className="text-muted-foreground text-sm pt-2 sm:w-20 shrink-0">
                    {ann.termId}
                  </div>
                  <div className="text-sm font-medium pt-2 sm:w-20 shrink-0">
                    {ann.cloCode}
                  </div>
                  <Textarea
                    className="sm:flex-1 min-w-0"
                    value={ann.followUp}
                    onChange={(e) =>
                      updateAnnotation(idx, "followUp", e.target.value)
                    }
                    placeholder="Follow-up notes..."
                    rows={2}
                  />
                  <label className="flex items-center gap-1 text-xs pt-2">
                    <input
                      type="checkbox"
                      checked={ann.cqiFlag ?? false}
                      onChange={(e) =>
                        updateAnnotation(idx, "cqiFlag", e.target.checked)
                      }
                      className="rounded border-input"
                    />
                    CQI Flag
                  </label>
                </div>
              ))}
            </div>
          </FramePanel>
        </Frame>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={auto.retry}
          disabled={loading || auto.busy}
        >
          Re-generate
        </Button>
        {annotations.length > 0 && (
          <Button onClick={handleSaveAnnotations} disabled={saving}>
            {saving ? "Saving..." : "Save Annotations"}
          </Button>
        )}
      </div>
    </div>
  );
}
