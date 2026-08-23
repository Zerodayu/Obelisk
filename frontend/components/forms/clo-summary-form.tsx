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
import { generateCloSummary } from "@/server/actions/rollup";

interface CloSummaryRow {
  cloCode: string;
  examPct: number | null;
  atPct: number | null;
  tlaPct: number | null;
  outputPct: number | null;
  weightedAvgPct: number | null;
  level: string | null;
  status: string;
}

interface CloSummaryPayload {
  classSectionId: string;
  computationRunId: string;
  formSubmissionId: string | null;
  generatedAt: string;
  course: { code: string; title: string };
  sectionCode: string;
  program: { code: string; name: string };
  term: { schoolYear: string; semester: string };
  summary: {
    averagePct: number | null;
    level: string | null;
    belowCount: number;
    totalCount: number;
  };
  rows: CloSummaryRow[];
}

function levelBadge(level: string | null) {
  if (!level) return <Badge variant="secondary">N/A</Badge>;
  if (level === "Exceptional") return <Badge variant="success">{level}</Badge>;
  if (level === "Proficient") return <Badge variant="info">{level}</Badge>;
  if (level === "Basic") return <Badge variant="warning">{level}</Badge>;
  return <Badge variant="destructive">{level}</Badge>;
}

export function CloSummaryForm() {
  const [payload, setPayload] = useState<CloSummaryPayload | null>(null);
  const [classSectionId, setClassSectionId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!classSectionId.trim()) return;
    setLoading(true);
    try {
      const result = await generateCloSummary({
        classSectionId: classSectionId.trim(),
      });
      if (result.ok) {
        setPayload(result.data.payload as unknown as CloSummaryPayload);
        toast.create({ title: "CLO summary generated", type: "success" });
      } else {
        toastError({
          title: "Generate failed",
          description: result.error,
          scope: "clo-summary:generate",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [classSectionId]);

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Generate CLO Attainment Summary</FrameTitle>
          <FrameDescription>
            Compute per-CLO attainment for a class section using Direct × 70% + Indirect × 30%.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="flex items-end gap-3">
            <Field className="flex-1">
              <FieldLabel>Class Section ID</FieldLabel>
              <Input
                value={classSectionId}
                onChange={(e) => setClassSectionId(e.target.value)}
                placeholder="e.g. clx_abc123"
              />
            </Field>
            <Button onClick={handleGenerate} disabled={loading || !classSectionId.trim()}>
              {loading ? "Generating..." : "Generate"}
            </Button>
          </div>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <Frame>
        <FrameHeader>
          <FrameTitle>{payload.course.code} — {payload.course.title}</FrameTitle>
          <FrameDescription>
            {payload.sectionCode} · {payload.program.name} · {payload.term.schoolYear} {payload.term.semester}
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <span className="text-xs text-muted-foreground">Average</span>
              <p className="text-lg font-semibold">
                {payload.summary.averagePct !== null ? `${payload.summary.averagePct.toFixed(1)}%` : "—"}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Level</span>
              <p>{levelBadge(payload.summary.level)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">CLOs Below 70%</span>
              <p className="text-lg font-semibold text-destructive">
                {payload.summary.belowCount} / {payload.summary.totalCount}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Generated</span>
              <p className="text-sm">{new Date(payload.generatedAt).toLocaleString()}</p>
            </div>
          </div>
        </FramePanel>
      </Frame>

      {/* CLO table */}
      <Frame>
        <FramePanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">CLO</th>
                  <th className="py-2 pr-4 text-right">Exam</th>
                  <th className="py-2 pr-4 text-right">AT</th>
                  <th className="py-2 pr-4 text-right">TLA</th>
                  <th className="py-2 pr-4 text-right">Output</th>
                  <th className="py-2 pr-4 text-right">Weighted Avg</th>
                  <th className="py-2 pr-4">Level</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {payload.rows.map((row) => (
                  <tr key={row.cloCode} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{row.cloCode}</td>
                    <td className="py-2 pr-4 text-right">
                      {row.examPct !== null ? `${row.examPct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {row.atPct !== null ? `${row.atPct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {row.tlaPct !== null ? `${row.tlaPct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {row.outputPct !== null ? `${row.outputPct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right font-medium">
                      {row.weightedAvgPct !== null ? `${row.weightedAvgPct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2 pr-4">{levelBadge(row.level)}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={row.status === "MET" ? "success" : "destructive"}>
                        {row.status}
                      </Badge>
                    </td>
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
