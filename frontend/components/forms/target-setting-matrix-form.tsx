"use client";

import { useCallback, useState } from "react";

import { toast, toastError } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
} from "@/components/reui/frame";
import { initTargetSettingMatrix, saveTargetSettingMatrix } from "@/server/actions/plan";

interface PloTargetRow {
  ploCode: string;
  statement: string;
  y1TargetPct: number;
  y2TargetPct: number;
  y3TargetPct: number;
  y4TargetPct: number;
  rationale: string;
}

interface CourseCloTargetRow {
  courseCode: string;
  courseTitle: string;
  cloCode: string;
  y1TargetPct: number | null;
  y2TargetPct: number | null;
  y3TargetPct: number | null;
  y4TargetPct: number | null;
  notes: string;
}

interface TargetMatrixPayload {
  formSubmissionId: string;
  generatedAt: string;
  header: Record<string, unknown>;
  ploRows: PloTargetRow[];
  programPloAvg: number[];
  courseRows: CourseCloTargetRow[];
}

export function TargetSettingMatrixForm() {
  const [payload, setPayload] = useState<TargetMatrixPayload | null>(null);
  const [ploRows, setPloRows] = useState<PloTargetRow[]>([]);
  const [courseRows, setCourseRows] = useState<CourseCloTargetRow[]>([]);
  const [programId, setProgramId] = useState("");
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!programId.trim() || !termId.trim()) return;
    setLoading(true);
    try {
      const result = await initTargetSettingMatrix({
        programId: programId.trim(),
        termId: termId.trim(),
      });
      if (result.ok) {
        const p = result.data.payload as unknown as TargetMatrixPayload;
        setPayload(p);
        setPloRows(p.ploRows || []);
        setCourseRows(p.courseRows || []);
        toast.create({ title: "Target matrix initialized", type: "success" });
      } else {
        toastError({ title: "Init failed", description: result.error, scope: "target:generate" });
      }
    } finally {
      setLoading(false);
    }
  }, [programId, termId]);

  const handleSave = useCallback(async () => {
    if (!payload?.formSubmissionId) return;
    setSaving(true);
    try {
      const result = await saveTargetSettingMatrix(payload.formSubmissionId, {
        ploRows: ploRows.map((r) => ({
          ploCode: r.ploCode,
          statement: r.statement,
          y1TargetPct: r.y1TargetPct,
          y2TargetPct: r.y2TargetPct,
          y3TargetPct: r.y3TargetPct,
          y4TargetPct: r.y4TargetPct,
          rationale: r.rationale,
        })),
        courseRows: courseRows.map((r) => ({
          courseCode: r.courseCode,
          courseTitle: r.courseTitle,
          cloCode: r.cloCode,
          y1TargetPct: r.y1TargetPct ?? undefined,
          y2TargetPct: r.y2TargetPct ?? undefined,
          y3TargetPct: r.y3TargetPct ?? undefined,
          y4TargetPct: r.y4TargetPct ?? undefined,
          notes: r.notes,
        })),
      });
      if (result.ok) {
        toast.create({ title: "Target matrix saved", type: "success" });
      } else {
        toastError({ title: "Save failed", description: result.error, scope: "target:save" });
      }
    } finally {
      setSaving(false);
    }
  }, [payload, ploRows, courseRows]);

  const updatePloRow = (idx: number, field: string, value: string | number) => {
    const next = [...ploRows];
    next[idx] = { ...next[idx], [field]: value };
    setPloRows(next);
  };

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Initialize Target-Setting Matrix</FrameTitle>
          <FrameDescription>
            Set PLO and CLO targets per year level (≥70% floor enforced).
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
                {loading ? "Initializing..." : "Initialize"}
              </Button>
            </div>
          </div>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <div className="space-y-4">
      {/* PLO targets */}
      <Frame>
        <FrameHeader>
          <FrameTitle>PLO Targets by Year Level</FrameTitle>
          <FrameDescription>
            Targets ≥70%. Rationale required if any target exceeds 70%.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-2">PLO</th>
                  <th className="py-2 pr-2 text-right">Y1</th>
                  <th className="py-2 pr-2 text-right">Y2</th>
                  <th className="py-2 pr-2 text-right">Y3</th>
                  <th className="py-2 pr-2 text-right">Y4</th>
                  <th className="py-2 pr-2">Rationale</th>
                </tr>
              </thead>
              <tbody>
                {ploRows.map((row, idx) => (
                  <tr key={row.ploCode} className="border-b last:border-0">
                    <td className="py-1 pr-2 font-medium">{row.ploCode}</td>
                    {(["y1TargetPct", "y2TargetPct", "y3TargetPct", "y4TargetPct"] as const).map((field) => (
                      <td key={field} className="py-1 pr-2">
                        <Input
                          type="number" min={70} max={100}
                          value={row[field]}
                          onChange={(e) => updatePloRow(idx, field, Number(e.target.value))}
                          className="h-8 w-16 text-xs text-right"
                        />
                      </td>
                    ))}
                    <td className="py-1 pr-2">
                      <Input
                        value={row.rationale}
                        onChange={(e) => updatePloRow(idx, "rationale", e.target.value)}
                        className="h-8 text-xs"
                        placeholder="Required if >70%"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium text-muted-foreground">
                  <td className="py-2 pr-2">Program Avg</td>
                  {payload.programPloAvg.map((avg, i) => (
                    <td key={i} className="py-2 pr-2 text-right text-xs">
                      {avg !== null ? `${avg.toFixed(1)}%` : "—"}
                    </td>
                  ))}
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </FramePanel>
      </Frame>

      {/* CLO targets */}
      {courseRows.length > 0 && (
        <Frame>
          <FrameHeader>
            <FrameTitle>Course-Level CLO Targets</FrameTitle>
          </FrameHeader>
          <FramePanel>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-2">Course</th>
                    <th className="py-2 pr-2">CLO</th>
                    <th className="py-2 pr-2 text-right">Y1</th>
                    <th className="py-2 pr-2 text-right">Y2</th>
                    <th className="py-2 pr-2 text-right">Y3</th>
                    <th className="py-2 pr-2 text-right">Y4</th>
                    <th className="py-2 pr-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {courseRows.map((row, idx) => (
                    <tr key={`${row.courseCode}-${row.cloCode}`} className="border-b last:border-0">
                      <td className="py-1 pr-2 text-xs">{row.courseCode}</td>
                      <td className="py-1 pr-2 font-medium text-xs">{row.cloCode}</td>
                      {(["y1TargetPct", "y2TargetPct", "y3TargetPct", "y4TargetPct"] as const).map((field) => (
                        <td key={field} className="py-1 pr-2">
                          <Input
                            type="number" min={70} max={100}
                            value={row[field] ?? ""}
                            onChange={(e) => {
                              const next = [...courseRows];
                              next[idx] = { ...next[idx], [field]: e.target.value ? Number(e.target.value) : null };
                              setCourseRows(next);
                            }}
                            className="h-8 w-16 text-xs text-right"
                          />
                        </td>
                      ))}
                      <td className="py-1 pr-2">
                        <Input
                          value={row.notes}
                          onChange={(e) => {
                            const next = [...courseRows];
                            next[idx] = { ...next[idx], notes: e.target.value };
                            setCourseRows(next);
                          }}
                          className="h-8 text-xs"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FramePanel>
        </Frame>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => { setPayload(null); setPloRows([]); setCourseRows([]); }}>
          Re-initialize
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
