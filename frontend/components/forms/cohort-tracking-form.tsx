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
  generateCohortTracking,
  saveCohortAnnotations,
} from "@/server/actions/rollup";

interface CohortLine {
  yearLevel: number;
  terms: {
    termId: string;
    cloAttainmentPct: number | null;
    ploAttainmentPct: number | null;
    level: string | null;
    status: string;
  }[];
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
  plos: {
    termId: string;
    ploCode: string;
    ploDescription: string;
    attainmentPct: number;
    achieved: boolean;
  }[];
}

function levelBadge(level: string | null) {
  if (!level) return <Badge variant="secondary">N/A</Badge>;
  if (level === "Exceptional") return <Badge variant="success">{level}</Badge>;
  if (level === "Proficient") return <Badge variant="info">{level}</Badge>;
  if (level === "Basic") return <Badge variant="warning">{level}</Badge>;
  return <Badge variant="destructive">{level}</Badge>;
}

function trendIcon(trend: string) {
  if (trend === "UP") return <span className="text-success">↑</span>;
  if (trend === "DOWN") return <span className="text-destructive">↓</span>;
  return <span className="text-muted-foreground">→</span>;
}

export function CohortTrackingForm() {
  const [payload, setPayload] = useState<CohortPayload | null>(null);
  const [annotations, setAnnotations] = useState<CohortAnnotation[]>([]);
  const [programId, setProgramId] = useState("");
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
            Track longitudinal CLO/PLO attainment across year-level cohorts and terms.
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
              <FieldLabel>Term ID (optional)</FieldLabel>
              <Input
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
                placeholder="Leave empty for all terms"
              />
            </Field>
            <div className="flex items-end">
              <Button onClick={handleGenerate} disabled={loading || !programId.trim()}>
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
            Cohort tracking · Generated {new Date(payload.generatedAt).toLocaleString()}
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">Year</th>
                  {payload.lines[0]?.terms.map((t) => (
                    <th key={t.termId} className="py-2 pr-4 text-center" colSpan={3}>
                      {t.termId}
                    </th>
                  ))}
                  <th className="py-2 pr-4 text-center">Trend</th>
                  <th className="py-2 pr-4 text-center">CQI</th>
                </tr>
                <tr className="border-b text-left text-muted-foreground text-xs">
                  <th />
                  {payload.lines[0]?.terms.map((t) => (
                    <React.Fragment key={t.termId}>
                      <th className="py-1 pr-2 text-right">CLO%</th>
                      <th className="py-1 pr-2 text-right">PLO%</th>
                      <th className="py-1 pr-2">Status</th>
                    </React.Fragment>
                  ))}
                  <th />
                  <th />
                </tr>
              </thead>
              <tbody>
                {payload.lines.map((line) => (
                  <tr key={line.yearLevel} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">Y{line.yearLevel}</td>
                    {line.terms.map((t) => (
                      <React.Fragment key={t.termId}>
                        <td className="py-2 pr-2 text-right">
                          {t.cloAttainmentPct !== null ? `${t.cloAttainmentPct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2 pr-2 text-right">
                          {t.ploAttainmentPct !== null ? `${t.ploAttainmentPct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2 pr-2">{levelBadge(t.level)}</td>
                      </React.Fragment>
                    ))}
                    <td className="py-2 pr-2 text-center">{trendIcon(line.trend)}</td>
                    <td className="py-2 pr-2 text-center">
                      {line.cqiTriggered && <Badge variant="destructive">CQI</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                <div key={idx} className="grid gap-2 sm:grid-cols-[100px_80px_80px_1fr_auto] items-start">
                  <div className="text-sm font-medium pt-2">
                    {ann.yearLevel ? `Y${ann.yearLevel}` : "All"}
                  </div>
                  <div className="text-sm text-muted-foreground pt-2">{ann.termId}</div>
                  <div className="text-sm font-medium pt-2">{ann.cloCode}</div>
                  <Textarea
                    value={ann.followUp}
                    onChange={(e) => updateAnnotation(idx, "followUp", e.target.value)}
                    placeholder="Follow-up notes..."
                    rows={2}
                  />
                  <label className="flex items-center gap-1 text-xs pt-2">
                    <input
                      type="checkbox"
                      checked={ann.cqiFlag ?? false}
                      onChange={(e) => updateAnnotation(idx, "cqiFlag", e.target.checked)}
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
        <Button variant="outline" size="sm" onClick={() => { setPayload(null); setAnnotations([]); }}>
          Generate Another
        </Button>
        {annotations.length > 0 && (
          <Button size="sm" onClick={handleSaveAnnotations} disabled={saving}>
            {saving ? "Saving..." : "Save Annotations"}
          </Button>
        )}
      </div>
    </div>
  );
}

// Need React for Fragment usage
import React from "react";
