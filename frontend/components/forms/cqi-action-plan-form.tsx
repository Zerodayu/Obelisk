"use client";

import { useCallback, useState } from "react";
import { FormWorkflow } from "@/components/forms/form-workflow";
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
import { FormSelect } from "@/components/ui/form-select";
import { Input } from "@/components/ui/input";
import { ProgramSelect } from "@/components/ui/program-select";
import { TermSelect } from "@/components/ui/term-select";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/components/ui/toast";
import { ROOT_CAUSES } from "@/lib/constants/obe";
import {
  generateCqiActionPlan,
  saveCqiActionPlan,
  trackCqiEntries,
} from "@/server/actions/cqi";

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
        toastError({
          title: "Save failed",
          description: result.error,
          scope: "cqi-plan:save",
        });
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
        toast.create({
          title: `Tracked ${result.data.updated} entries`,
          type: "success",
        });
      } else {
        toastError({
          title: "Track failed",
          description: result.error,
          scope: "cqi-plan:track",
        });
      }
    } finally {
      setTracking(false);
    }
  }, [payload, entries]);

  const updateEntry = (
    idx: number,
    field: string,
    value: string | number | null,
  ) => {
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
            Create intervention entries for NOT-MET PLOs with root causes,
            owners, and KPIs.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel>Program</FieldLabel>
              <ProgramSelect value={programId} onValueChange={setProgramId} />
            </Field>
            <Field>
              <FieldLabel>Term</FieldLabel>
              <TermSelect value={termId} onValueChange={setTermId} />
            </Field>
            <div className="flex items-end">
              <Button
                onClick={handleGenerate}
                disabled={loading || !programId.trim() || !termId.trim()}
              >
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
      <FormWorkflow submissionId={payload.formSubmissionId} />
      <Frame>
        <FrameHeader>
          <FrameTitle>{payload.program.name} — CQI Action Plan</FrameTitle>
          <FrameDescription>
            {payload.term.schoolYear} {payload.term.semester} · {entries.length}{" "}
            entries
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
                      <FormSelect
                        value={entry.rootCauseCategory}
                        onValueChange={(v) =>
                          updateEntry(idx, "rootCauseCategory", v)
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
                        value={entry.intervention}
                        onChange={(e) =>
                          updateEntry(idx, "intervention", e.target.value)
                        }
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        value={entry.owner}
                        onChange={(e) =>
                          updateEntry(idx, "owner", e.target.value)
                        }
                        className="h-8 w-24 text-xs"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        value={entry.timelineAndKpi}
                        onChange={(e) =>
                          updateEntry(idx, "timelineAndKpi", e.target.value)
                        }
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Badge
                        variant={
                          entry.status === "tracked" ? "info" : "outline"
                        }
                      >
                        {entry.status}
                      </Badge>
                    </td>
                    <td className="py-1 pr-2">
                      <FormSelect
                        value={entry.interventionImplemented || "no"}
                        onValueChange={(v) =>
                          updateEntry(idx, "interventionImplemented", v)
                        }
                        options={[
                          { value: "no", label: "No" },
                          { value: "partial", label: "Partial" },
                          { value: "yes", label: "Yes" },
                        ]}
                      />
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={entry.currentAttainmentPct ?? ""}
                        onChange={(e) =>
                          updateEntry(
                            idx,
                            "currentAttainmentPct",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setPayload(null);
            setEntries([]);
          }}
        >
          Generate Another
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleTrack}
          disabled={tracking}
        >
          {tracking ? "Tracking..." : "Track End-of-Cycle"}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
