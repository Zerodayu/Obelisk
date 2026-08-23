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
  generateCqiActionPlan,
  saveCqiActionPlan,
  trackCqiEntries,
} from "@/server/actions/cqi";

const ROOT_CAUSES = [
  "1-Curriculum Design",
  "2-Instruction & Pedagogy",
  "3-Assessment Design",
  "4-Student Factors",
  "5-Resources & Tools",
  "6-Industry & Field Alignment",
];

interface CqiEntry {
  id: string;
  ploCode: string;
  evidenceSource: string;
  priorAttainmentPct: number | null;
  rootCauseCategory: string;
  intervention: string;
  owner: string;
  ownerRole: string;
  timelineAndKpi: string;
  status: "planned" | "tracked";
  interventionImplemented?: "yes" | "partial" | "no";
  currentAttainmentPct?: number | null;
}

interface CqiPlanPayload {
  programId: string;
  termId: string;
  formSubmissionId: string | null;
  generatedAt: string;
  program: { code: string; name: string };
  term: { schoolYear: string; semester: string };
  entries: CqiEntry[];
}

export function CqiActionPlanForm() {
  const [payload, setPayload] = useState<CqiPlanPayload | null>(null);
  const [entries, setEntries] = useState<CqiEntry[]>([]);
  const [programId, setProgramId] = useState("");
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tracking, setTracking] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!programId.trim() || !termId.trim()) return;
    setLoading(true);
    try {
      const result = await generateCqiActionPlan({
        programId: programId.trim(),
        termId: termId.trim(),
      });
      if (result.ok) {
        const p = result.data.payload as unknown as CqiPlanPayload;
        setPayload(p);
        setEntries(p.entries || []);
        toast.create({ title: "CQI action plan generated", type: "success" });
      } else {
        toastError({
          title: "Generate failed",
          description: result.error,
          scope: "cqi-plan:generate",
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
      const result = await saveCqiActionPlan(
        payload.formSubmissionId,
        entries.map((e) => ({
          id: e.id,
          evidenceSource: e.evidenceSource,
          rootCauseCategory: e.rootCauseCategory,
          intervention: e.intervention,
          owner: e.owner,
          ownerRole: e.ownerRole,
          timelineAndKpi: e.timelineAndKpi,
        })),
      );
      if (result.ok) {
        toast.create({ title: "Action plan saved", type: "success" });
      } else {
        toastError({ title: "Save failed", description: result.error, scope: "cqi-plan:save" });
      }
    } finally {
      setSaving(false);
    }
  }, [payload, entries]);

  const handleTrack = useCallback(async () => {
    if (!payload?.formSubmissionId) return;
    setTracking(true);
    try {
      const result = await trackCqiEntries(
        payload.formSubmissionId,
        entries.map((e) => ({
          id: e.id,
          interventionImplemented: e.interventionImplemented || "no",
          currentAttainmentPct: e.currentAttainmentPct ?? undefined,
        })),
      );
      if (result.ok) {
        toast.create({ title: `Tracked ${result.data.updated} entries`, type: "success" });
      } else {
        toastError({ title: "Track failed", description: result.error, scope: "cqi-plan:track" });
      }
    } finally {
      setTracking(false);
    }
  }, [payload, entries]);

  const updateEntry = (idx: number, field: string, value: string | number | null) => {
    const next = [...entries];
    next[idx] = { ...next[idx], [field]: value };
    setEntries(next);
  };

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Generate CQI Action Plan</FrameTitle>
          <FrameDescription>
            Create intervention entries for NOT-MET PLOs with root causes, owners, and KPIs.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel>Program ID</FieldLabel>
              <Input value={programId} onChange={(e) => setProgramId(e.target.value)} placeholder="e.g. prog_cs" />
            </Field>
            <Field>
              <FieldLabel>Term ID</FieldLabel>
              <Input value={termId} onChange={(e) => setTermId(e.target.value)} placeholder="e.g. 2025-2-s1" />
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
          <FrameTitle>{payload.program.name} — CQI Action Plan</FrameTitle>
          <FrameDescription>
            {payload.term.schoolYear} {payload.term.semester} · {entries.length} entries
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-2">PLO</th>
                  <th className="py-2 pr-2">Root Cause</th>
                  <th className="py-2 pr-2">Intervention</th>
                  <th className="py-2 pr-2">Owner</th>
                  <th className="py-2 pr-2">Timeline & KPI</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Implemented</th>
                  <th className="py-2 pr-2 text-right">New Attainment</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => (
                  <tr key={entry.id} className="border-b last:border-0">
                    <td className="py-1 pr-2 font-medium">{entry.ploCode}</td>
                    <td className="py-1 pr-2">
                      <select
                        value={entry.rootCauseCategory}
                        onChange={(e) => updateEntry(idx, "rootCauseCategory", e.target.value)}
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                      >
                        {ROOT_CAUSES.map((rc) => (
                          <option key={rc} value={rc}>{rc}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <Input value={entry.intervention} onChange={(e) => updateEntry(idx, "intervention", e.target.value)} className="h-8 text-xs" />
                    </td>
                    <td className="py-1 pr-2">
                      <Input value={entry.owner} onChange={(e) => updateEntry(idx, "owner", e.target.value)} className="h-8 w-24 text-xs" />
                    </td>
                    <td className="py-1 pr-2">
                      <Input value={entry.timelineAndKpi} onChange={(e) => updateEntry(idx, "timelineAndKpi", e.target.value)} className="h-8 text-xs" />
                    </td>
                    <td className="py-1 pr-2">
                      <Badge variant={entry.status === "tracked" ? "info" : "outline"}>
                        {entry.status}
                      </Badge>
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        value={entry.interventionImplemented || "no"}
                        onChange={(e) => updateEntry(idx, "interventionImplemented", e.target.value)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="no">No</option>
                        <option value="partial">Partial</option>
                        <option value="yes">Yes</option>
                      </select>
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={entry.currentAttainmentPct ?? ""}
                        onChange={(e) => updateEntry(idx, "currentAttainmentPct", e.target.value ? Number(e.target.value) : null)}
                        className="h-8 w-20 text-xs text-right"
                        placeholder="%"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FramePanel>
      </Frame>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => { setPayload(null); setEntries([]); }}>
          Generate Another
        </Button>
        <Button variant="outline" size="sm" onClick={handleTrack} disabled={tracking}>
          {tracking ? "Tracking..." : "Track End-of-Cycle"}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
