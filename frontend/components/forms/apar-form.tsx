"use client";

import { useCallback, useState } from "react";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/components/ui/toast";
import { generateApar, saveApar } from "@/server/actions/cqi";

interface AparKpiRow {
  kpiCode: string;
  kpiLabel: string;
  description: string;
  value: number | null;
  target: number;
  status: string;
}

interface AparPayload {
  programId: string;
  formSubmissionId: string | null;
  termId: string | null;
  generatedAt: string;
  program: { code: string; name: string };
  term: { schoolYear: string; semester: string } | null;
  kpis: AparKpiRow[];
  attachments: Record<string, boolean>;
  narratives: Record<string, string | null>;
  dueDate: string;
}

const ATTACHMENT_LABELS: Record<string, string> = {
  cohort_tracking: "Cohort Tracking Sheet",
  clo_attainment_summary_s1: "CLO Attainment Summary (Sem 1)",
  clo_attainment_summary_s2: "CLO Attainment Summary (Sem 2)",
  plo_attainment_summary: "PLO Attainment Summary",
  cqi_action_plan_current: "CQI Action Plan (Current)",
  cqi_action_plan_prior: "CQI Action Plan (Prior)",
  course_assessment_report_s1: "CAR (Sem 1)",
  course_assessment_report_s2: "CAR (Sem 2)",
  closing_the_loop: "Closing the Loop",
};

const NARRATIVE_LABELS: Record<string, string> = {
  c1FullYearPloSummary: "C1 — Full-Year PLO Summary",
  c2CohortIpdProgression: "C2 — Cohort IPD Progression",
  c3IndirectEvidence: "C3 — Indirect Evidence",
  c4CqiInterventions: "C4 — CQI Interventions",
  c5Recommendations: "C5 — Recommendations",
};

export function AparForm() {
  const [payload, setPayload] = useState<AparPayload | null>(null);
  const [attachments, setAttachments] = useState<Record<string, boolean>>({});
  const [narratives, setNarratives] = useState<Record<string, string>>({});
  const [programId, setProgramId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!programId.trim()) return;
    setLoading(true);
    try {
      const result = await generateApar({ programId: programId.trim() });
      if (result.ok) {
        const p = result.data.payload as unknown as AparPayload;
        setPayload(p);
        setAttachments(p.attachments || {});
        const narr: Record<string, string> = {};
        for (const [k, v] of Object.entries(p.narratives || {})) {
          narr[k] = v || "";
        }
        setNarratives(narr);
        toast.create({ title: "APAR generated", type: "success" });
      } else {
        toastError({
          title: "Generate failed",
          description: result.error,
          scope: "apar:generate",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [programId]);

  const handleSave = useCallback(async () => {
    if (!payload?.formSubmissionId) return;
    setSaving(true);
    try {
      const result = await saveApar(payload.formSubmissionId, {
        attachments,
        narratives,
      });
      if (result.ok) {
        toast.create({ title: "APAR saved", type: "success" });
      } else {
        toastError({
          title: "Save failed",
          description: result.error,
          scope: "apar:save",
        });
      }
    } finally {
      setSaving(false);
    }
  }, [payload, attachments, narratives]);

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Generate Annual Program Assessment Report</FrameTitle>
          <FrameDescription>
            Compile the APAR with KPIs, attachments checklist, and narrative
            sections.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="flex items-end gap-3">
            <Field className="flex-1">
              <FieldLabel>Program ID</FieldLabel>
              <Input
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                placeholder="e.g. prog_cs"
              />
            </Field>
            <Button
              onClick={handleGenerate}
              disabled={loading || !programId.trim()}
            >
              {loading ? "Generating..." : "Generate"}
            </Button>
          </div>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <Frame>
        <FrameHeader>
          <FrameTitle>{payload.program.name} — APAR</FrameTitle>
          <FrameDescription>
            {payload.term
              ? `${payload.term.schoolYear} ${payload.term.semester}`
              : "Full Year"}{" "}
            · Due {payload.dueDate}
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">KPI</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4 text-right">Target</th>
                  <th className="py-2 pr-4 text-right">Value</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {payload.kpis.map((kpi) => (
                  <tr key={kpi.kpiCode} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{kpi.kpiCode}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {kpi.description}
                    </td>
                    <td className="py-2 pr-4 text-right">{kpi.target}%</td>
                    <td className="py-2 pr-4 text-right font-medium">
                      {kpi.value !== null ? `${kpi.value}%` : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge
                        variant={
                          kpi.status === "met" ? "success" : "destructive"
                        }
                      >
                        {kpi.status === "met" ? "MET" : "NOT MET"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FramePanel>
      </Frame>

      {/* Attachments */}
      <Frame>
        <FrameHeader>
          <FrameTitle>Attachments</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(ATTACHMENT_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={attachments[key] ?? false}
                  onChange={(e) =>
                    setAttachments({ ...attachments, [key]: e.target.checked })
                  }
                  className="rounded border-input"
                />
                {label}
              </label>
            ))}
          </div>
        </FramePanel>
      </Frame>

      {/* Narratives */}
      <Frame>
        <FrameHeader>
          <FrameTitle>Narratives</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <div className="space-y-3">
            {Object.entries(NARRATIVE_LABELS).map(([key, label]) => (
              <Field key={key}>
                <FieldLabel>{label}</FieldLabel>
                <Textarea
                  value={narratives[key] || ""}
                  onChange={(e) =>
                    setNarratives({ ...narratives, [key]: e.target.value })
                  }
                  rows={3}
                  placeholder={`Write ${label.toLowerCase()}...`}
                />
              </Field>
            ))}
          </div>
        </FramePanel>
      </Frame>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setPayload(null);
            setAttachments({});
            setNarratives({});
          }}
        >
          Generate Another
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
