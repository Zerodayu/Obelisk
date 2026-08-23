"use client";

import { useCallback, useState } from "react";

import { toast, toastError } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
} from "@/components/reui/frame";
import {
  generatePloGapAnalysis,
  savePloGapAnalysis,
} from "@/server/actions/cqi";

const ROOT_CAUSES = [
  "1-Curriculum Design",
  "2-Instruction & Pedagogy",
  "3-Assessment Design",
  "4-Student Factors",
  "5-Resources & Tools",
  "6-Industry & Field Alignment",
];

interface GapRow {
  id: string;
  ploCode: string;
  cohortYear: number;
  attainedPct: number | null;
  targetPct: number;
  gap: number | null;
  rootCauseCategory: string;
  rootCauseAnalysis: string;
  namedOwner: string;
}

interface PloGapPayload {
  programId: string;
  termId: string;
  formSubmissionId: string | null;
  generatedAt: string;
  program: { code: string; name: string };
  term: { schoolYear: string; semester: string };
  plos: {
    ploCode: string;
    programAvgPct: number | null;
    status: string;
    cohorts: {
      yearLevel: number;
      attainedPct: number | null;
      targetPct: number;
      achieved: boolean;
    }[];
  }[];
  gapRows: GapRow[];
  programChairSummary: string | null;
}

export function PloGapAnalysisForm() {
  const [payload, setPayload] = useState<PloGapPayload | null>(null);
  const [gapRows, setGapRows] = useState<GapRow[]>([]);
  const [programId, setProgramId] = useState("");
  const [termId, setTermId] = useState("");
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

  const handleSave = useCallback(async () => {
    if (!payload?.formSubmissionId) return;
    setSaving(true);
    try {
      const result = await savePloGapAnalysis(payload.formSubmissionId, {
        gapRows: gapRows.map((r) => ({
          id: r.id,
          rootCauseCategory: r.rootCauseCategory,
          rootCauseAnalysis: r.rootCauseAnalysis,
          namedOwner: r.namedOwner,
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

  const updateGapRow = (idx: number, field: string, value: string) => {
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
            Identify NOT-MET PLO-cohort combinations and assign root-cause categories.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel>Program ID</FieldLabel>
              <Input
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                placeholder="e.g. prog_cs"
              />
            </Field>
            <Field>
              <FieldLabel>Term ID</FieldLabel>
              <Input
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
                placeholder="e.g. 2025-2-s1"
              />
            </Field>
            <div className="flex items-end">
              <Button onClick={handleGenerate} disabled={loading || !programId.trim() || !termId.trim()}>
                {loading ? "Generating..." : "Generate"}
              </Button>
            </div>
          </div>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <div className="space-y-4">
      {/* PLO overview */}
      <Frame>
        <FrameHeader>
          <FrameTitle>{payload.program.name} — Gap Analysis</FrameTitle>
          <FrameDescription>
            {payload.term.schoolYear} {payload.term.semester} · {payload.gapRows.length} gap(s) identified
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
                  {payload.plos[0]?.cohorts.map((c) => (
                    <th key={c.yearLevel} className="py-2 pr-4 text-right">
                      Y{c.yearLevel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payload.plos.map((plo) => (
                  <tr key={plo.ploCode} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{plo.ploCode}</td>
                    <td className="py-2 pr-4 text-right">
                      {plo.programAvgPct !== null ? `${plo.programAvgPct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={plo.status === "all_met" ? "success" : plo.status === "partial" ? "warning" : "destructive"}>
                        {plo.status === "all_met" ? "ALL MET" : plo.status === "partial" ? "PARTIAL" : "NOT MET"}
                      </Badge>
                    </td>
                    {plo.cohorts.map((c) => (
                      <td key={c.yearLevel} className="py-2 pr-4 text-right">
                        {c.attainedPct !== null ? (
                          <span className={c.achieved ? "" : "text-destructive font-medium"}>
                            {c.attainedPct.toFixed(1)}%
                          </span>
                        ) : "—"}
                      </td>
                    ))}
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
            <p className="text-sm text-muted-foreground">No gaps — all PLOs met target.</p>
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
                      <td className="py-1 pr-2">Y{row.cohortYear}</td>
                      <td className="py-1 pr-2 text-right text-destructive">
                        {row.attainedPct !== null ? `${row.attainedPct.toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-1 pr-2 text-right">{row.targetPct}%</td>
                      <td className="py-1 pr-2 text-right font-medium text-destructive">
                        {row.gap !== null ? `+${row.gap.toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-1 pr-2">
                        <select
                          value={row.rootCauseCategory}
                          onChange={(e) => updateGapRow(idx, "rootCauseCategory", e.target.value)}
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                        >
                          {ROOT_CAUSES.map((rc) => (
                            <option key={rc} value={rc}>{rc}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 pr-2">
                        <Input
                          value={row.rootCauseAnalysis}
                          onChange={(e) => updateGapRow(idx, "rootCauseAnalysis", e.target.value)}
                          className="h-8 text-xs"
                          placeholder="Analysis..."
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Input
                          value={row.namedOwner}
                          onChange={(e) => updateGapRow(idx, "namedOwner", e.target.value)}
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
        <Button variant="outline" size="sm" onClick={() => { setPayload(null); setGapRows([]); }}>
          Generate Another
        </Button>
        {gapRows.length > 0 && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        )}
      </div>
    </div>
  );
}
