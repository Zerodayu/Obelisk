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
import { toast, toastError } from "@/components/ui/toast";
import type { CheckFormCode } from "@/server/actions/check";
import {
  getCheckForm,
  initCheckForm,
  saveCheckForm,
} from "@/server/actions/check";

const FORM_CODE: CheckFormCode = "mid_cycle_attainment";

interface CohortRow {
  id?: string;
  yearLevel: number;
  cloCode: string;
  cloDescription?: string;
  attainmentPct: number;
  benchmarkPct: number;
  status: string;
  studentCount: number;
  belowTargetCount: number;
}

interface Payload {
  id: string;
  status: string;
  header: {
    courseTitle?: string;
    courseCode?: string;
    academicYear?: string;
    semester?: string;
    section?: string;
    studentCountEnrolled?: number;
    program?: string;
    yearLevelCohort?: string;
    assessmentWeek?: string;
    periodCovered?: string;
    dateAdministered?: string;
    facultyName?: string;
    dateSubmittedToPc?: string;
  };
  cohortRows: CohortRow[];
}

export default function MidCycleAttainmentForm() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [programId, setProgramId] = useState("");
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleInit = useCallback(async () => {
    setLoading(true);
    try {
      const result = await initCheckForm(FORM_CODE, { programId, termId });
      if (result.ok) {
        const payloadResult = await getCheckForm<Payload>(
          FORM_CODE,
          result.data.id,
        );
        if (payloadResult.ok) {
          setPayload(payloadResult.data);
          toast.create({ title: "Form initialized", type: "success" });
        } else {
          toastError({
            title: "Load failed",
            description: payloadResult.error,
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
      const result = await saveCheckForm<Payload>(FORM_CODE, payload.id, {
        header: payload.header,
        cohortRows: payload.cohortRows.map(({ id, ...rest }) => rest),
      });
      if (result.ok) {
        setPayload(result.data);
        toast.create({ title: "Saved successfully", type: "success" });
      } else {
        toastError({
          title: "Save failed",
          description: result.error,
          scope: "check:save",
        });
      }
    } finally {
      setSaving(false);
    }
  }, [payload]);

  function updateHeader(field: string, value: string | number | undefined) {
    setPayload((prev) =>
      prev ? { ...prev, header: { ...prev.header, [field]: value } } : prev,
    );
  }

  function updateRow(
    idx: number,
    field: keyof CohortRow,
    value: string | number | undefined,
  ) {
    setPayload((prev) => {
      if (!prev) return prev;
      const newRows = [...prev.cohortRows];
      newRows[idx] = { ...newRows[idx], [field]: value };
      return { ...prev, cohortRows: newRows };
    });
  }

  function addRow() {
    setPayload((prev) =>
      prev
        ? {
            ...prev,
            cohortRows: [
              ...prev.cohortRows,
              {
                yearLevel: 1,
                cloCode: "",
                attainmentPct: 0,
                benchmarkPct: 70,
                status: "pending",
                studentCount: 0,
                belowTargetCount: 0,
              },
            ],
          }
        : prev,
    );
  }

  function removeRow(idx: number) {
    setPayload((prev) =>
      prev
        ? { ...prev, cohortRows: prev.cohortRows.filter((_, i) => i !== idx) }
        : prev,
    );
  }

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Mid-Cycle CLO Attainment Summary (F08)</FrameTitle>
          <FrameDescription>
            Initialize the form with Program and Term to begin.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <Field>
              <FieldLabel>Program</FieldLabel>
              <ProgramSelect value={programId} onValueChange={setProgramId} />
            </Field>
            <Field>
              <FieldLabel>Term</FieldLabel>
              <TermSelect value={termId} onValueChange={setTermId} />
            </Field>
          </div>
          <div className="mt-4">
            <Button
              onClick={handleInit}
              disabled={loading || !programId || !termId}
            >
              {loading ? "Initializing..." : "Initialize Form"}
            </Button>
          </div>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <div className="space-y-6">
      <Frame>
        <FrameHeader>
          <FrameTitle>Course Information</FrameTitle>
          <FrameDescription>
            General details for the course and assessment period.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="grid grid-cols-4 gap-4">
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
            <Field>
              <FieldLabel>Semester</FieldLabel>
              <Input
                value={payload.header.semester ?? ""}
                onChange={(e) => updateHeader("semester", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-4 gap-4 mt-4">
            <Field>
              <FieldLabel>Section</FieldLabel>
              <Input
                value={payload.header.section ?? ""}
                onChange={(e) => updateHeader("section", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Students Enrolled</FieldLabel>
              <Input
                type="number"
                min={0}
                value={payload.header.studentCountEnrolled ?? ""}
                onChange={(e) =>
                  updateHeader(
                    "studentCountEnrolled",
                    e.target.value === "" ? undefined : Number(e.target.value),
                  )
                }
              />
            </Field>
            <Field>
              <FieldLabel>Program</FieldLabel>
              <Input
                value={payload.header.program ?? ""}
                onChange={(e) => updateHeader("program", e.target.value)}
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
          <div className="grid grid-cols-4 gap-4 mt-4">
            <Field>
              <FieldLabel>Assessment Week</FieldLabel>
              <Input
                value={payload.header.assessmentWeek ?? ""}
                onChange={(e) => updateHeader("assessmentWeek", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Period Covered</FieldLabel>
              <Input
                value={payload.header.periodCovered ?? ""}
                onChange={(e) => updateHeader("periodCovered", e.target.value)}
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
              <FieldLabel>Faculty Name</FieldLabel>
              <Input
                value={payload.header.facultyName ?? ""}
                onChange={(e) => updateHeader("facultyName", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-4 gap-4 mt-4">
            <Field>
              <FieldLabel>Date Submitted to PC</FieldLabel>
              <Input
                type="date"
                value={payload.header.dateSubmittedToPc ?? ""}
                onChange={(e) =>
                  updateHeader("dateSubmittedToPc", e.target.value)
                }
              />
            </Field>
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Cohort Attainment by CLO</FrameTitle>
          <FrameDescription>
            Attainment percentages and status for each CLO across cohorts.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Year</th>
                  <th className="px-3 py-2 text-left font-medium">CLO Code</th>
                  <th className="px-3 py-2 text-left font-medium">
                    CLO Description
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    Attainment %
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    Benchmark %
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Students</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Below Target
                  </th>
                  <th className="px-3 py-2 text-left font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {payload.cohortRows.map((row, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="px-3 py-2">
                      <FormSelect
                        value={String(row.yearLevel)}
                        onValueChange={(v) =>
                          updateRow(idx, "yearLevel", Number(v))
                        }
                        options={[
                          { value: "1", label: "1" },
                          { value: "2", label: "2" },
                          { value: "3", label: "3" },
                          { value: "4", label: "4" },
                        ]}
                        className="w-full"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={row.cloCode}
                        onChange={(e) =>
                          updateRow(idx, "cloCode", e.target.value)
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="min-w-[200px]"
                        value={row.cloDescription ?? ""}
                        onChange={(e) =>
                          updateRow(idx, "cloDescription", e.target.value)
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={row.attainmentPct}
                        onChange={(e) =>
                          updateRow(
                            idx,
                            "attainmentPct",
                            Number(e.target.value),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={row.benchmarkPct}
                        onChange={(e) =>
                          updateRow(idx, "benchmarkPct", Number(e.target.value))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <FormSelect
                        value={row.status}
                        onValueChange={(v) => updateRow(idx, "status", v)}
                        options={[
                          { value: "pending", label: "Pending" },
                          { value: "met", label: "Met" },
                          { value: "early_warning", label: "Early Warning" },
                          { value: "not_met", label: "Not Met" },
                        ]}
                        className="w-full"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        value={row.studentCount}
                        onChange={(e) =>
                          updateRow(idx, "studentCount", Number(e.target.value))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        value={row.belowTargetCount}
                        onChange={(e) =>
                          updateRow(
                            idx,
                            "belowTargetCount",
                            Number(e.target.value),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Button variant="ghost" onClick={() => removeRow(idx)}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Button variant="outline" onClick={addRow}>
              Add Row
            </Button>
          </div>
        </FramePanel>
      </Frame>

      <div className="flex items-center gap-3">
        <Badge variant={payload.status === "draft" ? "secondary" : "success"}>
          {payload.status}
        </Badge>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
