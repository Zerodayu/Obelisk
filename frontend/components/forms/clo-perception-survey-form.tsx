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
import type { CheckFormCode } from "@/server/actions/check";
import {
  getCheckForm,
  initCheckForm,
  saveCheckForm,
} from "@/server/actions/check";

const FORM_CODE: CheckFormCode = "clo_perception_survey";

interface CloRow {
  cloCode: string;
  statement?: string;
  rating1Count?: number;
  rating2Count?: number;
  rating3Count?: number;
  rating4Count?: number;
  rating5Count?: number;
  directAttainmentPct?: number;
}

interface Payload {
  id: string;
  status: string;
  header: {
    courseTitle?: string;
    courseCode?: string;
    academicYear?: string;
    semester?: string;
    dateAdministered?: string;
    totalRespondents?: number;
    section?: string;
    responseRatePct?: number;
    yearLevelCohort?: string;
  };
  cloRows: CloRow[];
  divergenceNotes: string | null;
}

export function CloPerceptionSurveyForm() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [programId, setProgramId] = useState("");
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleInit = useCallback(async () => {
    if (!programId.trim() || !termId.trim()) return;
    setLoading(true);
    try {
      const initResult = await initCheckForm(FORM_CODE, {
        programId: programId.trim(),
        termId: termId.trim(),
      });
      if (!initResult.ok) {
        toastError({
          title: "Init failed",
          description: initResult.error,
          scope: "clo-perception:init",
        });
        return;
      }
      const getResult = await getCheckForm<Payload>(
        FORM_CODE,
        initResult.data.id,
      );
      if (!getResult.ok) {
        toastError({
          title: "Load failed",
          description: getResult.error,
          scope: "clo-perception:get",
        });
        return;
      }
      setPayload(getResult.data);
      toast.create({
        title: "CLO Perception Survey initialized",
        type: "success",
      });
    } finally {
      setLoading(false);
    }
  }, [programId, termId]);

  const handleSave = useCallback(async () => {
    if (!payload) return;
    setSaving(true);
    try {
      const result = await saveCheckForm(FORM_CODE, payload.id, {
        header: payload.header,
        cloRows: payload.cloRows,
        divergenceNotes: payload.divergenceNotes,
      });
      if (result.ok) {
        toast.create({ title: "CLO Perception Survey saved", type: "success" });
      } else {
        toastError({
          title: "Save failed",
          description: result.error,
          scope: "clo-perception:save",
        });
      }
    } finally {
      setSaving(false);
    }
  }, [payload]);

  const updateHeader = useCallback(
    (field: string, value: string | number | undefined) => {
      setPayload((prev) =>
        prev ? { ...prev, header: { ...prev.header, [field]: value } } : prev,
      );
    },
    [],
  );

  function updateCloRow(
    idx: number,
    field: keyof CloRow,
    value: string | number | undefined,
  ) {
    setPayload((prev) => {
      if (!prev) return prev;
      const newRows = [...prev.cloRows];
      newRows[idx] = { ...newRows[idx], [field]: value };
      return { ...prev, cloRows: newRows };
    });
  }

  function addCloRow() {
    setPayload((prev) =>
      prev ? { ...prev, cloRows: [...prev.cloRows, { cloCode: "" }] } : prev,
    );
  }

  function removeCloRow(idx: number) {
    setPayload((prev) =>
      prev
        ? { ...prev, cloRows: prev.cloRows.filter((_, i) => i !== idx) }
        : prev,
    );
  }

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Initialize CLO Perception Survey</FrameTitle>
          <FrameDescription>
            Set up a CLO Perception Survey (F12) for a given program and term.
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
              <Button
                onClick={handleInit}
                disabled={loading || !programId.trim() || !termId.trim()}
              >
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
          <FrameTitle>CLO Perception Survey</FrameTitle>
          <FrameDescription>
            Record student perception data for each CLO with Likert-scale
            tabulation.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel>Course Title</FieldLabel>
              <Input
                value={payload.header.courseTitle ?? ""}
                onChange={(e) => updateHeader("courseTitle", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Course Code</FieldLabel>
              <Input
                value={payload.header.courseCode ?? ""}
                onChange={(e) => updateHeader("courseCode", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Academic Year</FieldLabel>
              <Input
                value={payload.header.academicYear ?? ""}
                onChange={(e) => updateHeader("academicYear", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel>Semester</FieldLabel>
              <Input
                value={payload.header.semester ?? ""}
                onChange={(e) => updateHeader("semester", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Date Administered</FieldLabel>
              <Input
                type="date"
                value={payload.header.dateAdministered ?? ""}
                onChange={(e) =>
                  updateHeader("dateAdministered", e.target.value)
                }
              />
            </Field>
            <Field>
              <FieldLabel>Total Respondents</FieldLabel>
              <Input
                type="number"
                min={0}
                value={payload.header.totalRespondents ?? ""}
                onChange={(e) =>
                  updateHeader(
                    "totalRespondents",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel>Section</FieldLabel>
              <Input
                value={payload.header.section ?? ""}
                onChange={(e) => updateHeader("section", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Response Rate %</FieldLabel>
              <Input
                type="number"
                min={0}
                max={100}
                value={payload.header.responseRatePct ?? ""}
                onChange={(e) =>
                  updateHeader(
                    "responseRatePct",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              />
            </Field>
            <Field>
              <FieldLabel>Year Level / Cohort</FieldLabel>
              <Input
                value={payload.header.yearLevelCohort ?? ""}
                onChange={(e) =>
                  updateHeader("yearLevelCohort", e.target.value)
                }
              />
            </Field>
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>CLO Perception Data</FrameTitle>
          <FrameDescription>
            Tabulate Likert-scale responses (1–5) per CLO and compute direct
            attainment.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">CLO Code</th>
                  <th className="px-3 py-2 text-left font-medium">Statement</th>
                  <th className="px-3 py-2 text-right font-medium">Rating 1</th>
                  <th className="px-3 py-2 text-right font-medium">Rating 2</th>
                  <th className="px-3 py-2 text-right font-medium">Rating 3</th>
                  <th className="px-3 py-2 text-right font-medium">Rating 4</th>
                  <th className="px-3 py-2 text-right font-medium">Rating 5</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Direct Attainment %
                  </th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {payload.cloRows.map((row, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Input
                        value={row.cloCode}
                        onChange={(e) =>
                          updateCloRow(idx, "cloCode", e.target.value)
                        }
                        className="h-8 w-24 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={row.statement ?? ""}
                        onChange={(e) =>
                          updateCloRow(idx, "statement", e.target.value)
                        }
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        value={row.rating1Count ?? ""}
                        onChange={(e) =>
                          updateCloRow(
                            idx,
                            "rating1Count",
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                        className="h-8 w-16 text-xs text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        value={row.rating2Count ?? ""}
                        onChange={(e) =>
                          updateCloRow(
                            idx,
                            "rating2Count",
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                        className="h-8 w-16 text-xs text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        value={row.rating3Count ?? ""}
                        onChange={(e) =>
                          updateCloRow(
                            idx,
                            "rating3Count",
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                        className="h-8 w-16 text-xs text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        value={row.rating4Count ?? ""}
                        onChange={(e) =>
                          updateCloRow(
                            idx,
                            "rating4Count",
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                        className="h-8 w-16 text-xs text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        value={row.rating5Count ?? ""}
                        onChange={(e) =>
                          updateCloRow(
                            idx,
                            "rating5Count",
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                        className="h-8 w-16 text-xs text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={row.directAttainmentPct ?? ""}
                        onChange={(e) =>
                          updateCloRow(
                            idx,
                            "directAttainmentPct",
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                        className="h-8 w-20 text-xs text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCloRow(idx)}
                        className="h-8 px-2 text-destructive"
                      >
                        ✕
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={addCloRow}>
              + Add CLO Row
            </Button>
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Divergence Notes</FrameTitle>
          <FrameDescription>
            Note any significant divergences between student perception and
            direct assessment results.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <Textarea
            rows={5}
            value={payload.divergenceNotes ?? ""}
            onChange={(e) =>
              setPayload((prev) =>
                prev
                  ? { ...prev, divergenceNotes: e.target.value || null }
                  : prev,
              )
            }
            placeholder="Describe any divergences between CLO perception and direct attainment..."
          />
        </FramePanel>
      </Frame>

      <div className="flex items-center justify-between">
        <Badge
          variant={payload.status === "submitted" ? "success" : "secondary"}
        >
          {payload.status}
        </Badge>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPayload(null)}>
            Re-initialize
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
