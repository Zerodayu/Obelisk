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

const FORM_CODE: CheckFormCode = "student_exit_survey";

interface PloRow {
  ploCode: string;
  description?: string;
  y1AvgRating?: number;
  y2AvgRating?: number;
  y3AvgRating?: number;
  y4AvgRating?: number;
}

interface Payload {
  id: string;
  status: string;
  header: {
    program?: string;
    semesterAcademicYear?: string;
    dateAdministered?: string;
    totalEnrolled?: number;
    totalRespondents?: number;
    responseRatePct?: number;
    year1Respondents?: number;
    year2Respondents?: number;
    year3Respondents?: number;
    year4Respondents?: number;
    surveyMode?: string;
  };
  ploRows: PloRow[];
  divergenceInvestigationNotes: string | null;
  qualitativeThemes: string | null;
}

export function StudentExitSurveyForm() {
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
          scope: "student-exit:init",
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
          scope: "student-exit:get",
        });
        return;
      }
      setPayload(getResult.data);
      toast.create({
        title: "Student Exit Survey initialized",
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
        ploRows: payload.ploRows,
        divergenceInvestigationNotes: payload.divergenceInvestigationNotes,
        qualitativeThemes: payload.qualitativeThemes,
      });
      if (result.ok) {
        toast.create({ title: "Student Exit Survey saved", type: "success" });
      } else {
        toastError({
          title: "Save failed",
          description: result.error,
          scope: "student-exit:save",
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

  function updatePloRow(
    idx: number,
    field: keyof PloRow,
    value: string | number | undefined,
  ) {
    setPayload((prev) => {
      if (!prev) return prev;
      const newRows = [...prev.ploRows];
      newRows[idx] = { ...newRows[idx], [field]: value };
      return { ...prev, ploRows: newRows };
    });
  }

  function addPloRow() {
    setPayload((prev) =>
      prev ? { ...prev, ploRows: [...prev.ploRows, { ploCode: "" }] } : prev,
    );
  }

  function removePloRow(idx: number) {
    setPayload((prev) =>
      prev
        ? { ...prev, ploRows: prev.ploRows.filter((_, i) => i !== idx) }
        : prev,
    );
  }

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Initialize Student Exit Survey</FrameTitle>
          <FrameDescription>
            Set up a Student Exit Survey (F17) for a given program and term.
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
          <FrameTitle>Student Exit Survey</FrameTitle>
          <FrameDescription>
            Collect graduating student feedback on PLO attainment across year
            levels.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel>Program</FieldLabel>
              <Input
                value={payload.header.program ?? ""}
                onChange={(e) => updateHeader("program", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Semester / AY</FieldLabel>
              <Input
                value={payload.header.semesterAcademicYear ?? ""}
                onChange={(e) =>
                  updateHeader("semesterAcademicYear", e.target.value)
                }
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
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel>Total Enrolled</FieldLabel>
              <Input
                type="number"
                min={0}
                value={payload.header.totalEnrolled ?? ""}
                onChange={(e) =>
                  updateHeader(
                    "totalEnrolled",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
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
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field>
              <FieldLabel>Y1 Respondents</FieldLabel>
              <Input
                type="number"
                min={0}
                value={payload.header.year1Respondents ?? ""}
                onChange={(e) =>
                  updateHeader(
                    "year1Respondents",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              />
            </Field>
            <Field>
              <FieldLabel>Y2 Respondents</FieldLabel>
              <Input
                type="number"
                min={0}
                value={payload.header.year2Respondents ?? ""}
                onChange={(e) =>
                  updateHeader(
                    "year2Respondents",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              />
            </Field>
            <Field>
              <FieldLabel>Y3 Respondents</FieldLabel>
              <Input
                type="number"
                min={0}
                value={payload.header.year3Respondents ?? ""}
                onChange={(e) =>
                  updateHeader(
                    "year3Respondents",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              />
            </Field>
            <Field>
              <FieldLabel>Y4 Respondents</FieldLabel>
              <Input
                type="number"
                min={0}
                value={payload.header.year4Respondents ?? ""}
                onChange={(e) =>
                  updateHeader(
                    "year4Respondents",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel>Survey Mode</FieldLabel>
              <Input
                value={payload.header.surveyMode ?? ""}
                onChange={(e) => updateHeader("surveyMode", e.target.value)}
              />
            </Field>
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>PLO Rating Data</FrameTitle>
          <FrameDescription>
            Average student ratings (1–5) per PLO across year levels.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">PLO Code</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Description
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Y1 Avg Rating
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Y2 Avg Rating
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Y3 Avg Rating
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Y4 Avg Rating
                  </th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {payload.ploRows.map((row, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Input
                        value={row.ploCode}
                        onChange={(e) =>
                          updatePloRow(idx, "ploCode", e.target.value)
                        }
                        className="h-8 w-24 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={row.description ?? ""}
                        onChange={(e) =>
                          updatePloRow(idx, "description", e.target.value)
                        }
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={5}
                        step={0.1}
                        value={row.y1AvgRating ?? ""}
                        onChange={(e) =>
                          updatePloRow(
                            idx,
                            "y1AvgRating",
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                        className="h-8 w-20 text-xs text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={5}
                        step={0.1}
                        value={row.y2AvgRating ?? ""}
                        onChange={(e) =>
                          updatePloRow(
                            idx,
                            "y2AvgRating",
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                        className="h-8 w-20 text-xs text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={5}
                        step={0.1}
                        value={row.y3AvgRating ?? ""}
                        onChange={(e) =>
                          updatePloRow(
                            idx,
                            "y3AvgRating",
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                        className="h-8 w-20 text-xs text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={5}
                        step={0.1}
                        value={row.y4AvgRating ?? ""}
                        onChange={(e) =>
                          updatePloRow(
                            idx,
                            "y4AvgRating",
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
                        onClick={() => removePloRow(idx)}
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
            <Button variant="outline" size="sm" onClick={addPloRow}>
              + Add PLO Row
            </Button>
          </div>
        </FramePanel>
      </Frame>

      <div className="grid gap-4 sm:grid-cols-2">
        <Frame>
          <FrameHeader>
            <FrameTitle>Divergence Investigation Notes</FrameTitle>
            <FrameDescription>
              Investigate divergences between exit survey perception and
              institutional data.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <Textarea
              rows={4}
              value={payload.divergenceInvestigationNotes ?? ""}
              onChange={(e) =>
                setPayload((prev) =>
                  prev
                    ? {
                        ...prev,
                        divergenceInvestigationNotes: e.target.value || null,
                      }
                    : prev,
                )
              }
              placeholder="Note any divergences between survey results and institutional PLO data..."
            />
          </FramePanel>
        </Frame>
        <Frame>
          <FrameHeader>
            <FrameTitle>Qualitative Themes</FrameTitle>
            <FrameDescription>
              Summarize key qualitative themes from open-ended survey responses.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <Textarea
              rows={4}
              value={payload.qualitativeThemes ?? ""}
              onChange={(e) =>
                setPayload((prev) =>
                  prev
                    ? { ...prev, qualitativeThemes: e.target.value || null }
                    : prev,
                )
              }
              placeholder="Summarize recurring themes from open-ended responses..."
            />
          </FramePanel>
        </Frame>
      </div>

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
