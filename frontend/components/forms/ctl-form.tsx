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
import { generateCtl, saveCtl } from "@/server/actions/cqi";

interface CtlRow {
  id: string;
  ploCode: string;
  interventionDescription: string;
  gapFindingAndEvidence: string;
  interventionImplementedText: string;
  priorAttainmentPct: number | null;
  currentAttainmentPct: number | null;
  conditions12Met: boolean;
  condition3Met: boolean;
  condition4Met: boolean;
  condition5Met: boolean;
  loopStatus: string;
}

interface CtlPayload {
  programId: string;
  termId: string;
  formSubmissionId: string | null;
  generatedAt: string;
  program: { code: string; name: string };
  term: { schoolYear: string; semester: string };
  rows: CtlRow[];
  identify: {
    c1PriorCycleKpisAchieved: string | null;
    c2PreviouslyMetDeclining: string | null;
    c3ExternalShifts: string | null;
    c4ProactiveImprovements: string | null;
  };
}

function loopStatusBadge(status: string) {
  if (status === "closed") return <Badge variant="success">CLOSED</Badge>;
  if (status === "open_reassess") return <Badge variant="warning">OPEN — Re-assess</Badge>;
  return <Badge variant="destructive">OPEN — Not Implemented</Badge>;
}

export function CtlForm() {
  const [payload, setPayload] = useState<CtlPayload | null>(null);
  const [rows, setRows] = useState<CtlRow[]>([]);
  const [identify, setIdentify] = useState<CtlPayload["identify"]>({
    c1PriorCycleKpisAchieved: "",
    c2PreviouslyMetDeclining: "",
    c3ExternalShifts: "",
    c4ProactiveImprovements: "",
  });
  const [programId, setProgramId] = useState("");
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!programId.trim() || !termId.trim()) return;
    setLoading(true);
    try {
      const result = await generateCtl({
        programId: programId.trim(),
        termId: termId.trim(),
      });
      if (result.ok) {
        const p = result.data.payload as unknown as CtlPayload;
        setPayload(p);
        setRows(p.rows || []);
        if (p.identify) setIdentify(p.identify);
        toast.create({ title: "CTL report generated", type: "success" });
      } else {
        toastError({ title: "Generate failed", description: result.error, scope: "ctl:generate" });
      }
    } finally {
      setLoading(false);
    }
  }, [programId, termId]);

  const handleSave = useCallback(async () => {
    if (!payload?.formSubmissionId) return;
    setSaving(true);
    try {
      const result = await saveCtl(payload.formSubmissionId, {
        rows: rows.map((r) => ({
          id: r.id,
          gapFindingAndEvidence: r.gapFindingAndEvidence || undefined,
          interventionImplementedText: r.interventionImplementedText || undefined,
          priorAttainmentPct: r.priorAttainmentPct ?? undefined,
          currentAttainmentPct: r.currentAttainmentPct ?? undefined,
          conditions12Met: r.conditions12Met,
          condition3Met: r.condition3Met,
          condition4Met: r.condition4Met,
          condition5Met: r.condition5Met,
        })),
        identify: {
          c1PriorCycleKpisAchieved: identify.c1PriorCycleKpisAchieved || undefined,
          c2PreviouslyMetDeclining: identify.c2PreviouslyMetDeclining || undefined,
          c3ExternalShifts: identify.c3ExternalShifts || undefined,
          c4ProactiveImprovements: identify.c4ProactiveImprovements || undefined,
        },
      });
      if (result.ok) {
        toast.create({ title: "CTL report saved", type: "success" });
      } else {
        toastError({ title: "Save failed", description: result.error, scope: "ctl:save" });
      }
    } finally {
      setSaving(false);
    }
  }, [payload, rows, identify]);

  const updateRow = (idx: number, field: string, value: string | number | boolean | null) => {
    const next = [...rows];
    next[idx] = { ...next[idx], [field]: value };
    setRows(next);
  };

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Generate Closing-the-Loop Report</FrameTitle>
          <FrameDescription>
            Evaluate whether CQI interventions closed the attainment gap. Loop status is computed from 5 conditions.
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
          <FrameTitle>{payload.program.name} — Closing the Loop</FrameTitle>
          <FrameDescription>
            {payload.term.schoolYear} {payload.term.semester} · {rows.length} CQI entries
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-2">PLO</th>
                  <th className="py-2 pr-2">Prior %</th>
                  <th className="py-2 pr-2">Current %</th>
                  <th className="py-2 pr-2 text-center">C1+C2</th>
                  <th className="py-2 pr-2 text-center">C3</th>
                  <th className="py-2 pr-2 text-center">C4</th>
                  <th className="py-2 pr-2 text-center">C5</th>
                  <th className="py-2 pr-2">Loop Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-1 pr-2 font-medium">{row.ploCode}</td>
                    <td className="py-1 pr-2">
                      <Input
                        type="number" min={0} max={100}
                        value={row.priorAttainmentPct ?? ""}
                        onChange={(e) => updateRow(idx, "priorAttainmentPct", e.target.value ? Number(e.target.value) : null)}
                        className="h-8 w-20 text-xs text-right"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        type="number" min={0} max={100}
                        value={row.currentAttainmentPct ?? ""}
                        onChange={(e) => updateRow(idx, "currentAttainmentPct", e.target.value ? Number(e.target.value) : null)}
                        className="h-8 w-20 text-xs text-right"
                      />
                    </td>
                    {(["conditions12Met", "condition3Met", "condition4Met", "condition5Met"] as const).map((field) => (
                      <td key={field} className="py-1 pr-2 text-center">
                        <input
                          type="checkbox"
                          checked={row[field]}
                          onChange={(e) => updateRow(idx, field, e.target.checked)}
                          className="rounded border-input"
                        />
                      </td>
                    ))}
                    <td className="py-1 pr-2">{loopStatusBadge(row.loopStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FramePanel>
      </Frame>

      {/* Identify section */}
      <Frame>
        <FrameHeader>
          <FrameTitle>Identify</FrameTitle>
          <FrameDescription>
            Classify why loops remain open or were proactively closed.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>C1 — Prior Cycle KPIs Achieved</FieldLabel>
              <Textarea value={identify.c1PriorCycleKpisAchieved || ""} onChange={(e) => setIdentify({ ...identify, c1PriorCycleKpisAchieved: e.target.value })} rows={3} />
            </Field>
            <Field>
              <FieldLabel>C2 — Previously Met, Now Declining</FieldLabel>
              <Textarea value={identify.c2PreviouslyMetDeclining || ""} onChange={(e) => setIdentify({ ...identify, c2PreviouslyMetDeclining: e.target.value })} rows={3} />
            </Field>
            <Field>
              <FieldLabel>C3 — External Shifts</FieldLabel>
              <Textarea value={identify.c3ExternalShifts || ""} onChange={(e) => setIdentify({ ...identify, c3ExternalShifts: e.target.value })} rows={3} />
            </Field>
            <Field>
              <FieldLabel>C4 — Proactive Improvements</FieldLabel>
              <Textarea value={identify.c4ProactiveImprovements || ""} onChange={(e) => setIdentify({ ...identify, c4ProactiveImprovements: e.target.value })} rows={3} />
            </Field>
          </div>
        </FramePanel>
      </Frame>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => { setPayload(null); setRows([]); }}>
          Generate Another
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
