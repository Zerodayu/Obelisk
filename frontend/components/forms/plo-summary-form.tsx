"use client";

import { useCallback, useState } from "react";

import { toast, toastError } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
} from "@/components/reui/frame";
import { generatePloSummary } from "@/server/actions/rollup";

interface PloSummaryRow {
  ploCode: string;
  ploDescription: string;
  targetPct: number;
  attainedPct: number | null;
  achieved: boolean;
  studentsBelow: number;
  completeness: number;
  rule3Met: boolean;
  mappedClos: string[];
}

interface PloSummaryPayload {
  programId: string;
  termId: string;
  computationRunId: string;
  formSubmissionId: string | null;
  generatedAt: string;
  program: { code: string; name: string };
  term: { schoolYear: string; semester: string };
  feed: { sections: number; fed: number };
  summary: { averagePct: number | null; belowCount: number };
  plos: PloSummaryRow[];
}

export function PloSummaryForm() {
  const [payload, setPayload] = useState<PloSummaryPayload | null>(null);
  const [programId, setProgramId] = useState("");
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!programId.trim() || !termId.trim()) return;
    setLoading(true);
    try {
      const result = await generatePloSummary({
        programId: programId.trim(),
        termId: termId.trim(),
      });
      if (result.ok) {
        setPayload(result.data.payload as unknown as PloSummaryPayload);
        toast.create({ title: "PLO summary generated", type: "success" });
      } else {
        toastError({
          title: "Generate failed",
          description: result.error,
          scope: "plo-summary:generate",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [programId, termId]);

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Generate PLO Attainment Summary</FrameTitle>
          <FrameDescription>
            Aggregate CLO attainments into per-PLO scores across all sections in a program + term.
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
      <Frame>
        <FrameHeader>
          <FrameTitle>{payload.program.name}</FrameTitle>
          <FrameDescription>
            {payload.term.schoolYear} {payload.term.semester} · {payload.feed.sections} sections · {payload.feed.fed} fed
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <span className="text-xs text-muted-foreground">Program Average</span>
              <p className="text-lg font-semibold">
                {payload.summary.averagePct !== null ? `${payload.summary.averagePct.toFixed(1)}%` : "—"}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">PLOs Below Target</span>
              <p className="text-lg font-semibold text-destructive">{payload.summary.belowCount}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Generated</span>
              <p className="text-sm">{new Date(payload.generatedAt).toLocaleString()}</p>
            </div>
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">PLO</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4 text-right">Target</th>
                  <th className="py-2 pr-4 text-right">Attained</th>
                  <th className="py-2 pr-4 text-right">Students Below</th>
                  <th className="py-2 pr-4">Rule 3</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Mapped CLOs</th>
                </tr>
              </thead>
              <tbody>
                {payload.plos.map((row) => (
                  <tr key={row.ploCode} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{row.ploCode}</td>
                    <td className="py-2 pr-4 max-w-[200px] truncate">{row.ploDescription}</td>
                    <td className="py-2 pr-4 text-right">{row.targetPct}%</td>
                    <td className="py-2 pr-4 text-right font-medium">
                      {row.attainedPct !== null ? `${row.attainedPct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right">{row.studentsBelow}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={row.rule3Met ? "success" : "destructive"}>
                        {row.rule3Met ? "MET" : "NOT MET"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={row.achieved ? "success" : "destructive"}>
                        {row.achieved ? "ACHIEVED" : "NOT ACHIEVED"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{row.mappedClos.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FramePanel>
      </Frame>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setPayload(null)}>
          Generate Another
        </Button>
      </div>
    </div>
  );
}
