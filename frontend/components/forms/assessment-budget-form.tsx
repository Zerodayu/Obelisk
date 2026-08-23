"use client";

import { useCallback, useState } from "react";

import { toast, toastError } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
} from "@/components/reui/frame";
import { initAssessmentBudget, saveAssessmentBudget } from "@/server/actions/plan";

interface BudgetLineItem {
  id: string;
  phase: string;
  name: string;
  estimatedCost: number;
  approvedCost: number | null;
  source: string | null;
  notes: string | null;
  isFixed: boolean;
}

interface AssessmentBudgetPayload {
  formSubmissionId: string;
  generatedAt: string;
  header: Record<string, unknown>;
  lineItems: BudgetLineItem[];
  totals: { estimatedTotal: number; approvedTotal: number };
}

const PHASES = ["plan", "do", "check", "act"] as const;
const SOURCES = ["aqau", "dean", "vpaa"] as const;

export function AssessmentBudgetForm() {
  const [payload, setPayload] = useState<AssessmentBudgetPayload | null>(null);
  const [lineItems, setLineItems] = useState<BudgetLineItem[]>([]);
  const [programId, setProgramId] = useState("");
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!programId.trim() || !termId.trim()) return;
    setLoading(true);
    try {
      const result = await initAssessmentBudget({
        programId: programId.trim(),
        termId: termId.trim(),
      });
      if (result.ok) {
        const p = result.data.payload as unknown as AssessmentBudgetPayload;
        setPayload(p);
        setLineItems(p.lineItems || []);
        toast.create({ title: "Budget initialized", type: "success" });
      } else {
        toastError({ title: "Init failed", description: result.error, scope: "budget:generate" });
      }
    } finally {
      setLoading(false);
    }
  }, [programId, termId]);

  const handleSave = useCallback(async () => {
    if (!payload?.formSubmissionId) return;
    setSaving(true);
    try {
      const result = await saveAssessmentBudget(payload.formSubmissionId, {
        lineItems: lineItems.map((item) => ({
          id: item.isFixed ? undefined : item.id,
          phase: item.phase,
          name: item.name,
          estimatedCost: item.estimatedCost,
          approvedCost: item.approvedCost,
          source: item.source,
          notes: item.notes,
        })),
      });
      if (result.ok) {
        toast.create({ title: "Budget saved", type: "success" });
      } else {
        toastError({ title: "Save failed", description: result.error, scope: "budget:save" });
      }
    } finally {
      setSaving(false);
    }
  }, [payload, lineItems]);

  const updateItem = (idx: number, field: string, value: unknown) => {
    const next = [...lineItems];
    next[idx] = { ...next[idx], [field]: value };
    setLineItems(next);
  };

  const addItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: `new-${Date.now()}`,
        phase: "plan",
        name: "",
        estimatedCost: 0,
        approvedCost: null,
        source: null,
        notes: null,
        isFixed: false,
      },
    ]);
  };

  const removeItem = (idx: number) => {
    setLineItems(lineItems.filter((_, i) => i !== idx));
  };

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Initialize Assessment Budget</FrameTitle>
          <FrameDescription>
            Set up the budget with 12 fixed line items and add custom items.
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
      <Frame>
        <FrameHeader>
          <FrameTitle>Assessment Budget</FrameTitle>
          <FrameDescription>
            Estimated total: ₱{payload.totals.estimatedTotal.toLocaleString()} · Approved: ₱{payload.totals.approvedTotal.toLocaleString()}
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-2">Phase</th>
                  <th className="py-2 pr-2">Item</th>
                  <th className="py-2 pr-2 text-right">Estimated</th>
                  <th className="py-2 pr-2 text-right">Approved</th>
                  <th className="py-2 pr-2">Source</th>
                  <th className="py-2 pr-2">Notes</th>
                  <th className="py-2 pr-2" />
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, idx) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-1 pr-2">
                      <select
                        value={item.phase}
                        onChange={(e) => updateItem(idx, "phase", e.target.value)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        disabled={item.isFixed}
                      >
                        {PHASES.map((p) => (
                          <option key={p} value={p}>{p.toUpperCase()}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      {item.isFixed ? (
                        <span className="text-xs font-medium">{item.name}</span>
                      ) : (
                        <Input value={item.name} onChange={(e) => updateItem(idx, "name", e.target.value)} className="h-8 text-xs" />
                      )}
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        type="number" min={0}
                        value={item.estimatedCost}
                        onChange={(e) => updateItem(idx, "estimatedCost", Number(e.target.value))}
                        className="h-8 w-24 text-xs text-right"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        type="number" min={0}
                        value={item.approvedCost ?? ""}
                        onChange={(e) => updateItem(idx, "approvedCost", e.target.value ? Number(e.target.value) : null)}
                        className="h-8 w-24 text-xs text-right"
                        placeholder="—"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        value={item.source ?? ""}
                        onChange={(e) => updateItem(idx, "source", e.target.value || null)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="">—</option>
                        {SOURCES.map((s) => (
                          <option key={s} value={s}>{s.toUpperCase()}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <Input value={item.notes ?? ""} onChange={(e) => updateItem(idx, "notes", e.target.value || null)} className="h-8 w-32 text-xs" />
                    </td>
                    <td className="py-1 pr-2">
                      {!item.isFixed && (
                        <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="h-8 px-2 text-destructive">
                          ✕
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium">
                  <td className="py-2 pr-2" colSpan={2}>Total</td>
                  <td className="py-2 pr-2 text-right text-sm">
                    ₱{lineItems.reduce((sum, item) => sum + item.estimatedCost, 0).toLocaleString()}
                  </td>
                  <td className="py-2 pr-2 text-right text-sm">
                    ₱{lineItems.reduce((sum, item) => sum + (item.approvedCost ?? 0), 0).toLocaleString()}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </FramePanel>
      </Frame>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={addItem}>
          + Add Line Item
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setPayload(null); setLineItems([]); }}>
          Re-initialize
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
