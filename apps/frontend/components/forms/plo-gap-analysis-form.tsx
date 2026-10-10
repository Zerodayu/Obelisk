"use client";

import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { ROOT_CAUSES } from "@/lib/constants/obe";
import { useAutoGenerate } from "@/lib/hooks/use-auto-generate";
import {
  selectedProgramIdAtom,
  selectedTermIdAtom,
} from "@/lib/store/atoms/academic";
import {
  generatePloGapAnalysis,
  savePloGapAnalysis,
} from "@/server/actions/cqi";

/**
 * Display-only mirror of the backend's ≥70% hard floor
 * (`MIN_ATTAINMENT_PCT` in `apps/backend/lib/validators/attainment.ts`).
 * The backend stays authoritative — it derives NOT-MET gap rows and the
 * `PloStatus` badge against this floor, so the Target/Gap columns and the red
 * highlight must use the same number to agree with the server.
 */
const INSTITUTIONAL_FLOOR_PCT = 70;

/** `PloCohortSummary.cohorts` entry (backend `src/v1/cqi/compute.ts`). */
interface CohortAttainment {
  cohortYearLevel: number | null;
  attainmentPct: number;
}

/** `PloCohortSummary` (backend `src/v1/cqi/compute.ts`). */
interface PloSummary {
  ploId: string;
  ploCode: string;
  ploDescription: string;
  cohorts: CohortAttainment[];
  programAvgPct: number | null;
  /** `PloStatus` enum — `all_met` | `partial` | `not_met`. */
  status: string;
  notMetCohorts: number;
}

/** `GapRowDto` (backend `src/v1/cqi/model.ts`) — root-cause fields are nullable until filled in. */
interface GapRow {
  id: string;
  ploCode: string;
  ploDescription: string;
  /** `0` (and `null` on older payloads) = cohort year level unknown. */
  cohortYearLevel: number | null;
  attainmentPct: number;
  rootCauseCategory: string | null;
  rootCauseAnalysis: string | null;
  namedOwner: string | null;
  cqiActionPlanEntryId: string | null;
}

/** The only `GapRow` fields this form edits — everything else is server-owned. */
type GapEditField = "rootCauseCategory" | "rootCauseAnalysis" | "namedOwner";

interface PloGapPayload {
  programId: string;
  termId: string;
  formSubmissionId: string | null;
  generatedAt: string;
  program: { code: string; name: string };
  term: { schoolYear: string; semester: string };
  plos: PloSummary[];
  gapRows: GapRow[];
  programChairSummary: string | null;
}

export function PloGapAnalysisForm() {
  const [payload, setPayload] = useState<PloGapPayload | null>(null);
  const [gapRows, setGapRows] = useState<GapRow[]>([]);
  // NOTE: academic context comes from the dashboard picker, not local state.
  const programId = useAtomValue(selectedProgramIdAtom);
  const termId = useAtomValue(selectedTermIdAtom);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!programId.trim() || !termId.trim()) return;
    setLoading(true);
    try {
      const result = await generatePloGapAnalysis({
        programId: programId.trim(),
        termId: termId.trim(),
      });
      if (result.ok) {
        const p = result.data.payload as unknown as PloGapPayload;
        setPayload(p);
        setGapRows(p.gapRows || []);
        toast.create({ title: "Gap analysis generated", type: "success" });
      } else {
        toastError({
          title: "Generate failed",
          description: result.error,
          scope: "gap:generate",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [programId, termId]);

  const auto = useAutoGenerate([programId, termId], handleGenerate);

  const handleSave = useCallback(async () => {
    if (!payload?.formSubmissionId) return;
    setSaving(true);
    try {
      const result = await savePloGapAnalysis(payload.formSubmissionId, {
        gapRows: gapRows.map((r) => ({
          id: r.id,
          // An untouched (null) category must be omitted — the backend validates
          // the 6-category enum and rejects "" outright.
          ...(r.rootCauseCategory
            ? { rootCauseCategory: r.rootCauseCategory }
            : {}),
          rootCauseAnalysis: r.rootCauseAnalysis ?? undefined,
          namedOwner: r.namedOwner ?? undefined,
        })),
      });
      if (result.ok) {
        toast.create({ title: "Gap analysis saved", type: "success" });
      } else {
        toastError({
          title: "Save failed",
          description: result.error,
          scope: "gap:save",
        });
      }
    } finally {
      setSaving(false);
    }
  }, [payload, gapRows]);

  const updateGapRow = (idx: number, field: GapEditField, value: string) => {
    const next = [...gapRows];
    next[idx] = { ...next[idx], [field]: value };
    setGapRows(next);
  };

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Generate PLO Gap Analysis</FrameTitle>
          <FrameDescription>
            Identify NOT-MET PLO-cohort combinations and assign root-cause
            categories.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          {!programId || !termId ? (
            <ContextRequired scope="program-term" />
          ) : (
            <GeneratingState busy={loading || auto.busy} retry={auto.retry} />
          )}
        </FramePanel>
      </Frame>
    );
  }

  // Cohort columns = union across every PLO, so rows stay aligned even when
  // PLOs observed different cohorts (backend sorts year-asc, null last).
  const cohortYears = [
    ...new Set(
      payload.plos.flatMap((plo) => plo.cohorts.map((c) => c.cohortYearLevel)),
    ),
  ].sort((a, b) => (a ?? 99) - (b ?? 99));

  return (
    <div className="space-y-4">
      <SubmissionStatusCard submissionId={payload.formSubmissionId} />
      {/* PLO overview */}
      <Frame>
        <FrameHeader>
          <FrameTitle>{payload.program.name} — Gap Analysis</FrameTitle>
          <FrameDescription>
            {payload.term.schoolYear} {payload.term.semester} ·{" "}
            {payload.gapRows.length} gap(s) identified
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">PLO</th>
                  <th className="py-2 pr-4 text-right">Program Avg</th>
                  <th className="py-2 pr-4">Status</th>
                  {cohortYears.map((year) => (
                    <th key={String(year)} className="py-2 pr-4 text-right">
                      {year === null ? "—" : `Y${year}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payload.plos.map((plo) => (
                  <tr key={plo.ploCode} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{plo.ploCode}</td>
                    <td className="py-2 pr-4 text-right">
                      {typeof plo.programAvgPct === "number"
                        ? `${plo.programAvgPct.toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge
                        variant={
                          plo.status === "all_met"
                            ? "success"
                            : plo.status === "partial"
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {plo.status === "all_met"
                          ? "ALL MET"
                          : plo.status === "partial"
                            ? "PARTIAL"
                            : "NOT MET"}
                      </Badge>
                    </td>
                    {cohortYears.map((year) => {
                      const attained = plo.cohorts.find(
                        (c) => c.cohortYearLevel === year,
                      )?.attainmentPct;
                      if (typeof attained !== "number") {
                        return (
                          <td
                            key={String(year)}
                            className="py-2 pr-4 text-right"
                          >
                            —
                          </td>
                        );
                      }
                      const achieved = attained >= INSTITUTIONAL_FLOOR_PCT;
                      return (
                        <td key={String(year)} className="py-2 pr-4 text-right">
                          <span
                            className={
                              achieved ? "" : "text-destructive font-medium"
                            }
                          >
                            {attained.toFixed(1)}%
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FramePanel>
      </Frame>

      {/* Gap rows */}
      <Frame>
        <FrameHeader>
          <FrameTitle>Root-Cause Analysis</FrameTitle>
          <FrameDescription>
            Assign root causes and owners to each NOT-MET gap.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          {gapRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No gaps — all PLOs met target.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-2">PLO</th>
                    <th className="py-2 pr-2">Year</th>
                    <th className="py-2 pr-2 text-right">Attained</th>
                    <th className="py-2 pr-2 text-right">Target</th>
                    <th className="py-2 pr-2 text-right">Gap</th>
                    <th className="py-2 pr-2">Root Cause</th>
                    <th className="py-2 pr-2">Analysis</th>
                    <th className="py-2 pr-2">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {gapRows.map((row, idx) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-1 pr-2 font-medium">{row.ploCode}</td>
                      <td className="py-1 pr-2">
                        {row.cohortYearLevel ? `Y${row.cohortYearLevel}` : "—"}
                      </td>
                      <td className="py-1 pr-2 text-right text-destructive">
                        {Number.isFinite(row.attainmentPct)
                          ? `${row.attainmentPct.toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="py-1 pr-2 text-right">
                        {INSTITUTIONAL_FLOOR_PCT}%
                      </td>
                      <td className="py-1 pr-2 text-right font-medium text-destructive">
                        {Number.isFinite(row.attainmentPct)
                          ? `+${(INSTITUTIONAL_FLOOR_PCT - row.attainmentPct).toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="py-1 pr-2">
                        <FormSelect
                          value={row.rootCauseCategory ?? ""}
                          onValueChange={(v) =>
                            updateGapRow(idx, "rootCauseCategory", v)
                          }
                          options={ROOT_CAUSES.map((rc) => ({
                            value: rc,
                            label: rc,
                          }))}
                          className="w-full"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Input
                          value={row.rootCauseAnalysis ?? ""}
                          onChange={(e) =>
                            updateGapRow(
                              idx,
                              "rootCauseAnalysis",
                              e.target.value,
                            )
                          }
                          className="h-8 text-xs"
                          placeholder="Analysis..."
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Input
                          value={row.namedOwner ?? ""}
                          onChange={(e) =>
                            updateGapRow(idx, "namedOwner", e.target.value)
                          }
                          className="h-8 w-28 text-xs"
                          placeholder="Owner"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FramePanel>
      </Frame>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={auto.retry}
          disabled={loading || auto.busy}
        >
          Re-generate
        </Button>
        {gapRows.length > 0 && (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        )}
      </div>
    </div>
  );
}
