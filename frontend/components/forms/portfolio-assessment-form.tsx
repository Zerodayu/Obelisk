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
import { ProgramSelect } from "@/components/ui/program-select";
import { TermSelect } from "@/components/ui/term-select";
import { toast, toastError } from "@/components/ui/toast";
import type { CheckFormCode } from "@/server/actions/check";
import {
  getCheckForm,
  initCheckForm,
  saveCheckForm,
} from "@/server/actions/check";

const FORM_CODE: CheckFormCode = "portfolio_assessment_record";

interface CriterionRow {
  id?: string;
  cloCode: string;
  cloDescription?: string;
  criterionName: string;
  maxScore: number;
  assessor1Score?: number;
  assessor2Score?: number;
  industryScore?: number;
  consensusScore?: number;
  evidenceNotes?: string;
}

interface Payload {
  id: string;
  status: string;
  header: {
    studentName?: string;
    studentId?: string;
    program?: string;
    yearLevelCohort?: string;
    portfolioEvent?: string;
    assessmentDate?: string;
    portfolioMilestone?: string;
    cloEvidence?: string;
    assessor1?: string;
    assessor2?: string;
    industryAssessor?: string;
    additionalPanelist?: string;
  };
  criteriaRows: CriterionRow[];
}

function updateRow(
  prev: CriterionRow[],
  idx: number,
  field: keyof CriterionRow,
  value: string | number | undefined,
): CriterionRow[] {
  const newRows = [...prev];
  newRows[idx] = { ...newRows[idx], [field]: value };
  return newRows;
}

export default function PortfolioAssessmentForm() {
  const [programId, setProgramId] = useState("");
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);

  const handleInit = useCallback(async () => {
    setLoading(true);
    try {
      const result = await initCheckForm(FORM_CODE, { programId, termId });
      if (result.ok) {
        const data = await getCheckForm<Payload>(FORM_CODE, result.data.id);
        if (data.ok) {
          setPayload(data.data);
        } else {
          toastError({
            title: "Load failed",
            description: data.error,
            scope: "check:load",
          });
        }
      } else {
        toastError({
          title: "Init failed",
          description: result.error,
          scope: "check:init",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [programId, termId]);

  const handleSave = useCallback(async () => {
    if (!payload) return;
    setSaving(true);
    try {
      await saveCheckForm(FORM_CODE, payload.id, {
        header: payload.header,
        criteriaRows: payload.criteriaRows,
      });
      toast.create({ title: "Saved successfully", type: "success" });
    } catch {
      toastError({
        title: "Save failed",
        description: "Failed to save form.",
        scope: "check:save",
      });
    } finally {
      setSaving(false);
    }
  }, [payload]);

  function updateHeader<K extends keyof Payload["header"]>(
    key: K,
    value: Payload["header"][K],
  ) {
    setPayload((prev) => {
      if (!prev) return prev;
      return { ...prev, header: { ...prev.header, [key]: value } };
    });
  }

  function updateCriterion(
    idx: number,
    field: keyof CriterionRow,
    value: string | number | undefined,
  ) {
    setPayload((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        criteriaRows: updateRow(prev.criteriaRows, idx, field, value),
      };
    });
  }

  function addRow() {
    setPayload((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        criteriaRows: [
          ...prev.criteriaRows,
          { cloCode: "", criterionName: "", maxScore: 5 },
        ],
      };
    });
  }

  function removeRow(idx: number) {
    setPayload((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        criteriaRows: prev.criteriaRows.filter((_, i) => i !== idx),
      };
    });
  }

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Portfolio Assessment Record</FrameTitle>
          <FrameDescription>
            F18 — Load an existing form instance.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>Program</FieldLabel>
              <ProgramSelect value={programId} onValueChange={setProgramId} />
            </Field>
            <Field>
              <FieldLabel>Term</FieldLabel>
              <TermSelect value={termId} onValueChange={setTermId} />
            </Field>
          </div>
          <Button
            className="mt-4"
            onClick={handleInit}
            disabled={loading || !programId || !termId}
          >
            {loading ? "Loading…" : "Load Form"}
          </Button>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <div className="space-y-6">
      <Frame>
        <FrameHeader>
          <FrameTitle>Portfolio Assessment Record</FrameTitle>
          <FrameDescription>F18</FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="grid grid-cols-3 gap-4">
            <Field>
              <FieldLabel>Student Name</FieldLabel>
              <Input
                value={payload.header.studentName ?? ""}
                onChange={(e) => updateHeader("studentName", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Student ID</FieldLabel>
              <Input
                value={payload.header.studentId ?? ""}
                onChange={(e) => updateHeader("studentId", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Program</FieldLabel>
              <Input
                value={payload.header.program ?? ""}
                onChange={(e) => updateHeader("program", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <Field>
              <FieldLabel>Year Level / Cohort</FieldLabel>
              <Input
                value={payload.header.yearLevelCohort ?? ""}
                onChange={(e) =>
                  updateHeader("yearLevelCohort", e.target.value)
                }
              />
            </Field>
            <Field>
              <FieldLabel>Portfolio Event</FieldLabel>
              <Input
                value={payload.header.portfolioEvent ?? ""}
                onChange={(e) => updateHeader("portfolioEvent", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Assessment Date</FieldLabel>
              <Input
                type="date"
                value={payload.header.assessmentDate ?? ""}
                onChange={(e) => updateHeader("assessmentDate", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <Field>
              <FieldLabel>Portfolio Milestone</FieldLabel>
              <Input
                value={payload.header.portfolioMilestone ?? ""}
                onChange={(e) =>
                  updateHeader("portfolioMilestone", e.target.value)
                }
              />
            </Field>
            <Field>
              <FieldLabel>CLO(s) Evidenced</FieldLabel>
              <Input
                value={payload.header.cloEvidence ?? ""}
                onChange={(e) => updateHeader("cloEvidence", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Additional Panelist</FieldLabel>
              <Input
                value={payload.header.additionalPanelist ?? ""}
                onChange={(e) =>
                  updateHeader("additionalPanelist", e.target.value)
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <Field>
              <FieldLabel>Assessor 1 (Faculty)</FieldLabel>
              <Input
                value={payload.header.assessor1 ?? ""}
                onChange={(e) => updateHeader("assessor1", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Assessor 2 (Faculty)</FieldLabel>
              <Input
                value={payload.header.assessor2 ?? ""}
                onChange={(e) => updateHeader("assessor2", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Industry Assessor</FieldLabel>
              <Input
                value={payload.header.industryAssessor ?? ""}
                onChange={(e) =>
                  updateHeader("industryAssessor", e.target.value)
                }
              />
            </Field>
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Rubric Scoring</FrameTitle>
          <FrameDescription>
            Add criteria rows and enter scores for each assessor.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">CLO Code</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Criterion Name
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Max Score</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Assessor 1
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    Assessor 2
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Industry</th>
                  <th className="px-3 py-2 text-left font-medium">Consensus</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Evidence Notes
                  </th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {payload.criteriaRows.map((r, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-3 py-2">
                      <Input
                        value={r.cloCode}
                        onChange={(e) =>
                          updateCriterion(i, "cloCode", e.target.value)
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={r.criterionName}
                        onChange={(e) =>
                          updateCriterion(i, "criterionName", e.target.value)
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="0"
                        value={r.maxScore}
                        onChange={(e) =>
                          updateCriterion(
                            i,
                            "maxScore",
                            Number(e.target.value) || 0,
                          )
                        }
                        className="w-20"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="0"
                        value={r.assessor1Score ?? ""}
                        onChange={(e) =>
                          updateCriterion(
                            i,
                            "assessor1Score",
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                          )
                        }
                        className="w-20"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="0"
                        value={r.assessor2Score ?? ""}
                        onChange={(e) =>
                          updateCriterion(
                            i,
                            "assessor2Score",
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                          )
                        }
                        className="w-20"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="0"
                        value={r.industryScore ?? ""}
                        onChange={(e) =>
                          updateCriterion(
                            i,
                            "industryScore",
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                          )
                        }
                        className="w-20"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="0"
                        value={r.consensusScore ?? ""}
                        onChange={(e) =>
                          updateCriterion(
                            i,
                            "consensusScore",
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                          )
                        }
                        className="w-20"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={r.evidenceNotes ?? ""}
                        onChange={(e) =>
                          updateCriterion(
                            i,
                            "evidenceNotes",
                            e.target.value || undefined,
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRow(i)}
                        className="text-destructive"
                      >
                        ✕
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" onClick={addRow} className="mt-2">
            + Add Row
          </Button>
        </FramePanel>
      </Frame>

      <div className="flex items-center gap-3">
        <Badge
          variant={payload.status === "submitted" ? "default" : "secondary"}
        >
          {payload.status}
        </Badge>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
