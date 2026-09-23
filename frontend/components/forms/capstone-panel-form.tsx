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
import { FormSelect } from "@/components/ui/form-select";
import { Input } from "@/components/ui/input";
import { ProgramSelect } from "@/components/ui/program-select";
import { TermSelect } from "@/components/ui/term-select";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/components/ui/toast";
import type { CheckFormCode } from "@/server/actions/check";
import {
  getCheckForm,
  initCheckForm,
  saveCheckForm,
} from "@/server/actions/check";

const FORM_CODE: CheckFormCode = "capstone_panel_evaluation";

interface PanelistRow {
  id?: string;
  panelistName: string;
  panelistRole: string;
  ploRatings: Record<string, number>;
  overallComments?: string;
}

interface Payload {
  id: string;
  status: string;
  header: {
    studentName?: string;
    studentId?: string;
    program?: string;
    academicYear?: string;
    capstoneTitle?: string;
    panelDate?: string;
    venue?: string;
    sectionCohort?: string;
    type?: string;
    panelMemberCount?: number;
    chair?: string;
    member2?: string;
    industryAssessor?: string;
    additionalPanelist?: string;
  };
  panelistRows: PanelistRow[];
  programReadinessDeclaration: string | null;
  cqiActionRequired: boolean | null;
}

export default function CapstonePanelForm() {
  const [programId, setProgramId] = useState("");
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [panelistRatings, setPanelistRatings] = useState<
    Record<number, string>
  >({});

  const handleInit = useCallback(async () => {
    setLoading(true);
    try {
      const result = await initCheckForm(FORM_CODE, { programId, termId });
      if (result.ok) {
        const data = await getCheckForm<Payload>(FORM_CODE, result.data.id);
        if (data.ok) {
          setPayload(data.data);
          const ratingsInit: Record<number, string> = {};
          data.data.panelistRows?.forEach((p, i) => {
            ratingsInit[i] = JSON.stringify(p.ploRatings ?? {}, null, 2);
          });
          setPanelistRatings(ratingsInit);
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
      const panelistRows = payload.panelistRows.map((p, i) => ({
        ...p,
        ploRatings: JSON.parse(panelistRatings[i] || "{}"),
      }));
      await saveCheckForm(FORM_CODE, payload.id, {
        header: payload.header,
        panelistRows,
        programReadinessDeclaration: payload.programReadinessDeclaration,
        cqiActionRequired: payload.cqiActionRequired,
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
  }, [payload, panelistRatings]);

  function updateHeader<K extends keyof Payload["header"]>(
    key: K,
    value: Payload["header"][K],
  ) {
    setPayload((prev) => {
      if (!prev) return prev;
      return { ...prev, header: { ...prev.header, [key]: value } };
    });
  }

  function addPanelistRow() {
    setPayload((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        panelistRows: [
          ...prev.panelistRows,
          {
            panelistName: "",
            panelistRole: "faculty",
            ploRatings: {},
            overallComments: "",
          },
        ],
      };
    });
    setPanelistRatings((prev) => {
      const next = { ...prev };
      const keys = Object.keys(next).map(Number);
      next[Math.max(...keys, -1) + 1] = "{}";
      return next;
    });
  }

  function removePanelistRow(idx: number) {
    setPayload((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        panelistRows: prev.panelistRows.filter((_, i) => i !== idx),
      };
    });
    setPanelistRatings((prev) => {
      const next: Record<number, string> = {};
      const entries = Object.entries(prev).filter(([k]) => Number(k) !== idx);
      entries.forEach(([k, v], i) => {
        next[i] = v;
      });
      return next;
    });
  }

  function updatePanelistRating(idx: number, value: string) {
    setPanelistRatings((prev) => ({ ...prev, [idx]: value }));
  }

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Capstone Panel Evaluation</FrameTitle>
          <FrameDescription>
            F19 — Load an existing form instance.
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
          <FrameTitle>Capstone Panel Evaluation</FrameTitle>
          <FrameDescription>F19</FrameDescription>
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
              <FieldLabel>Academic Year</FieldLabel>
              <Input
                value={payload.header.academicYear ?? ""}
                onChange={(e) => updateHeader("academicYear", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Capstone Title</FieldLabel>
              <Input
                value={payload.header.capstoneTitle ?? ""}
                onChange={(e) => updateHeader("capstoneTitle", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Panel Date</FieldLabel>
              <Input
                type="date"
                value={payload.header.panelDate ?? ""}
                onChange={(e) => updateHeader("panelDate", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <Field>
              <FieldLabel>Venue</FieldLabel>
              <Input
                value={payload.header.venue ?? ""}
                onChange={(e) => updateHeader("venue", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Section / Cohort</FieldLabel>
              <Input
                value={payload.header.sectionCohort ?? ""}
                onChange={(e) => updateHeader("sectionCohort", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Type</FieldLabel>
              <Input
                value={payload.header.type ?? ""}
                onChange={(e) => updateHeader("type", e.target.value)}
                placeholder="Project / Thesis / Exhibition / Other"
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <Field>
              <FieldLabel>Panel Members (count)</FieldLabel>
              <Input
                type="number"
                min="0"
                value={payload.header.panelMemberCount ?? ""}
                onChange={(e) =>
                  updateHeader(
                    "panelMemberCount",
                    Number(e.target.value) || undefined,
                  )
                }
              />
            </Field>
            <Field>
              <FieldLabel>Chair</FieldLabel>
              <Input
                value={payload.header.chair ?? ""}
                onChange={(e) => updateHeader("chair", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Member 2</FieldLabel>
              <Input
                value={payload.header.member2 ?? ""}
                onChange={(e) => updateHeader("member2", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <Field>
              <FieldLabel>Industry Assessor</FieldLabel>
              <Input
                value={payload.header.industryAssessor ?? ""}
                onChange={(e) =>
                  updateHeader("industryAssessor", e.target.value)
                }
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
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Panelist Scoring</FrameTitle>
          <FrameDescription>
            Add each panelist and their PLO ratings as JSON.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="px-3 py-2 text-left font-medium">
                  Panelist Name
                </th>
                <th className="px-3 py-2 text-left font-medium">Role</th>
                <th className="px-3 py-2 text-left font-medium">
                  PLO Ratings (JSON)
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  Overall Comments
                </th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {payload.panelistRows.map((p, i) => (
                <tr key={i} className="border-b">
                  <td className="px-3 py-2">
                    <Input
                      value={p.panelistName}
                      onChange={(e) => {
                        const rows = [...payload.panelistRows];
                        rows[i] = { ...rows[i], panelistName: e.target.value };
                        setPayload({ ...payload, panelistRows: rows });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <FormSelect
                      value={p.panelistRole}
                      onValueChange={(v) => {
                        const rows = [...payload.panelistRows];
                        rows[i] = { ...rows[i], panelistRole: v };
                        setPayload({ ...payload, panelistRows: rows });
                      }}
                      options={[
                        { value: "faculty", label: "Faculty" },
                        { value: "industry", label: "Industry" },
                        { value: "other", label: "Other" },
                      ]}
                      className="w-full"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={panelistRatings[i] ?? "{}"}
                      onChange={(e) => updatePanelistRating(i, e.target.value)}
                      placeholder='{"PLO1": 8, "PLO2": 7}'
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={p.overallComments ?? ""}
                      onChange={(e) => {
                        const rows = [...payload.panelistRows];
                        rows[i] = {
                          ...rows[i],
                          overallComments: e.target.value,
                        };
                        setPayload({ ...payload, panelistRows: rows });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      onClick={() => removePanelistRow(i)}
                      className="text-destructive"
                    >
                      ✕
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button variant="outline" onClick={addPanelistRow} className="mt-2">
            + Add Row
          </Button>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Declarations</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <Field>
            <FieldLabel>Program Readiness Declaration</FieldLabel>
            <Textarea
              rows={3}
              value={payload.programReadinessDeclaration ?? ""}
              onChange={(e) =>
                setPayload({
                  ...payload,
                  programReadinessDeclaration: e.target.value || null,
                })
              }
              placeholder="Program readiness declaration statement…"
            />
          </Field>
          <Field className="mt-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={payload.cqiActionRequired === true}
                onChange={(e) =>
                  setPayload({
                    ...payload,
                    cqiActionRequired: e.target.checked,
                  })
                }
                className="h-4 w-4"
              />
              <FieldLabel className="mb-0">CQI Action Required</FieldLabel>
            </div>
          </Field>
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
