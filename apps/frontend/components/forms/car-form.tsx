"use client";

import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { ContextRequired } from "@/components/forms/context-required";
import { SubmissionStatusCard } from "@/components/forms/submission-status-card";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { FormSelect } from "@/components/ui/form-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/components/ui/toast";
import {
  ASSESSMENT_TYPES,
  BLOOMS_LEVELS,
  ROOT_CAUSES,
} from "@/lib/constants/obe";
import { selectedClassSectionIdAtom } from "@/lib/store/atoms/academic";
import {
  type AssessmentTypeRow,
  type CarPart1,
  type CarPart2,
  type CarPart3,
  type CarPart4,
  type CarPart5,
  type CarPart6,
  type CarPart7,
  type CarPayload,
  type CloPloMappingRow,
  carDirtyAtom,
  carPayloadAtom,
} from "@/lib/store/atoms/car";
import { cn } from "@/lib/utils";
import { generateCar, saveCar } from "@/server/actions/car";

// ---------------------------------------------------------------------------
// 4-tier level helpers
// ---------------------------------------------------------------------------

function levelBadge(level: string | null | undefined, status: string) {
  if (!level) return <Badge variant="secondary">N/A</Badge>;
  const v =
    level === "Exceptional"
      ? "success"
      : level === "Proficient"
        ? "info"
        : level === "Basic"
          ? "warning"
          : "destructive";
  return (
    <Badge
      variant={
        v === "success"
          ? "success"
          : v === "info"
            ? "info"
            : v === "warning"
              ? "warning"
              : "destructive"
      }
    >
      {level} {status === "MET" ? "✓" : "✗"}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Part components
// ---------------------------------------------------------------------------

function Part1({
  part1,
  onChange,
}: {
  part1?: CarPart1;
  onChange?: (part1: CarPart1) => void;
}) {
  if (!part1) {
    return (
      <p className="text-sm text-muted-foreground">
        Course and section information could not be loaded.
      </p>
    );
  }

  const courseDisplay =
    part1.courseCode && part1.courseTitle
      ? `${part1.courseCode} — ${part1.courseTitle}`
      : part1.courseCode || part1.courseTitle || "—";

  // NOTE: only Bloom's, weight and assessment types are editable here — no
  // other source fills them (testing_results 6.4)
  const updateMapping = (cloCode: string, patch: Partial<CloPloMappingRow>) => {
    if (!onChange) return;
    onChange({
      ...part1,
      cloPloMapping: part1.cloPloMapping.map((row) =>
        row.cloCode === cloCode ? { ...row, ...patch } : row,
      ),
    });
  };

  /** Toggle one assessment type, keeping the manual's canonical column order. */
  const toggleAssessmentType = (
    current: string[] | null | undefined,
    type: (typeof ASSESSMENT_TYPES)[number],
  ): string[] => {
    const next = new Set(current ?? []);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    return ASSESSMENT_TYPES.filter((candidate) => next.has(candidate));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <span className="text-xs text-muted-foreground">Course</span>
          <p className="font-medium">{courseDisplay}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Section</span>
          <p className="font-medium">{part1.sectionCode || "—"}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Program</span>
          <p className="font-medium">
            {part1.programName || part1.programCode || "—"}
          </p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Term</span>
          <p className="font-medium">
            {part1.schoolYear && part1.semester
              ? `${part1.schoolYear} ${part1.semester}${part1.term ? ` (${part1.term})` : ""}`
              : part1.term || "—"}
          </p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Year Level</span>
          <p className="font-medium">
            {part1.yearLevel ? `Year ${part1.yearLevel}` : "—"}
          </p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Faculty</span>
          <p className="font-medium">{part1.facultyName || "—"}</p>
        </div>
      </div>

      {(part1.cloPloMapping ?? []).length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4">CLO</th>
                <th className="py-2 pr-4">Bloom's</th>
                <th className="py-2 pr-4">I-P-D</th>
                <th className="py-2 pr-4">Assessment Types</th>
                <th className="py-2 pr-4 text-right">Weight %</th>
              </tr>
            </thead>
            <tbody>
              {part1.cloPloMapping.map((row) => (
                <tr key={row.cloCode} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{row.cloCode}</td>
                  <td className="py-2 pr-4">
                    <FormSelect
                      value={row.bloomsLevel ?? ""}
                      onValueChange={(v) =>
                        updateMapping(row.cloCode, { bloomsLevel: v })
                      }
                      options={BLOOMS_LEVELS.map((level) => ({
                        value: level,
                        label: level,
                      }))}
                      placeholder="—"
                      disabled={!onChange}
                      className="h-8 w-32"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <Badge variant="outline">
                      {row.ipdStage?.toUpperCase() || "—"}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {ASSESSMENT_TYPES.map((type) => {
                        const selected =
                          row.assessmentTypes?.includes(type) ?? false;
                        return (
                          <button
                            key={type}
                            type="button"
                            aria-pressed={selected}
                            disabled={!onChange}
                            onClick={() =>
                              updateMapping(row.cloCode, {
                                assessmentTypes: toggleAssessmentType(
                                  row.assessmentTypes,
                                  type,
                                ),
                              })
                            }
                            className={cn(
                              "h-5 rounded-4xl border px-1.25 py-0.5 text-xs leading-none outline-hidden",
                              "disabled:cursor-not-allowed disabled:opacity-60",
                              selected
                                ? "border-primary/10 bg-primary/10 text-primary dark:border-primary/25 dark:bg-primary/15 dark:text-primary"
                                : "border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground",
                            )}
                          >
                            {type}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={row.weightInGradePct ?? ""}
                      onChange={(e) =>
                        updateMapping(row.cloCode, {
                          weightInGradePct:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                      disabled={!onChange}
                      className="h-8 w-20 text-right"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Part2({ part2 }: { part2?: CarPart2 }) {
  if (!part2) {
    return (
      <p className="text-sm text-muted-foreground">
        No assessment-type data available.
      </p>
    );
  }

  const sections: { title: string; rows: AssessmentTypeRow[] }[] = [
    { title: "Exams / Major Assessments", rows: part2.exams ?? [] },
    { title: "Rubric-Based Assessments", rows: part2.rubric ?? [] },
    { title: "Performance Tasks", rows: part2.perfTasks ?? [] },
    { title: "Portfolio", rows: part2.portfolio ?? [] },
  ].filter((s) => s.rows.length > 0);

  if (sections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No assessment-type data available.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.title} className="space-y-2">
          <h4 className="text-sm font-semibold">{section.title}</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">CLO</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4 text-right">Attainment %</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row) => {
                  const status =
                    row.belowBenchmark === false
                      ? "MET"
                      : row.belowBenchmark === true
                        ? "NOT MET"
                        : "N/A";
                  return (
                    <tr key={row.cloCode} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{row.cloCode}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {row.cloDescription || "—"}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {row.attainmentPct !== null &&
                        row.attainmentPct !== undefined
                          ? `${row.attainmentPct.toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {row.belowBenchmark !== null &&
                        row.belowBenchmark !== undefined ? (
                          <Badge
                            variant={
                              !row.belowBenchmark ? "success" : "destructive"
                            }
                          >
                            {status}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">—</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function Part3({ part3 }: { part3?: CarPart3 }) {
  if (!part3 || part3.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No cohort data available.</p>
    );
  }
  return (
    <div className="space-y-6">
      {part3.map((cohort, idx) => (
        <div key={cohort.yearLevel ?? idx} className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">
              {cohort.yearLevel !== null && cohort.yearLevel !== undefined
                ? `Year ${cohort.yearLevel}`
                : "All Students"}
            </h4>
            {cohort.cohortAvg && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Cohort Average:</span>
                <span className="font-semibold">
                  {cohort.cohortAvg.weightedAvgPct !== null &&
                  cohort.cohortAvg.weightedAvgPct !== undefined
                    ? `${cohort.cohortAvg.weightedAvgPct.toFixed(1)}%`
                    : "—"}
                </span>
                {cohort.cohortAvg.level &&
                  levelBadge(cohort.cohortAvg.level, "MET")}
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">CLO</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4 text-right">Weighted Avg %</th>
                  <th className="py-2 pr-4">Level</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {cohort.rows.map((row) => (
                  <tr key={row.cloCode} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{row.cloCode}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {row.cloDescription || "—"}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {row.weightedAvgPct !== null &&
                      row.weightedAvgPct !== undefined
                        ? `${row.weightedAvgPct.toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {levelBadge(row.level, row.status)}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge
                        variant={
                          row.status === "MET" ? "success" : "destructive"
                        }
                      >
                        {row.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function Part4({ part4 }: { part4?: CarPart4 }) {
  if (!part4 || !part4.rows || part4.rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No at-risk students.</p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          At-Risk Students Identified: {part4.count ?? part4.rows.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4">Student</th>
              <th className="py-2 pr-4">Student #</th>
              <th className="py-2 pr-4">At-Risk CLOs</th>
              <th className="py-2 pr-4">Intervention</th>
            </tr>
          </thead>
          <tbody>
            {part4.rows.map((row) => (
              <tr key={row.studentId} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{row.studentName}</td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {row.studentNumber || "—"}
                </td>
                <td className="py-2 pr-4">
                  <div className="flex flex-wrap gap-1.5">
                    {row.atRiskClos.map((c) => (
                      <Badge key={c.cloCode} variant="destructive">
                        {c.cloCode}: {c.attainmentPct.toFixed(1)}%
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">
                  {row.intervention || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Part5({
  part5,
  onChange,
}: {
  part5?: CarPart5;
  onChange: (rows: CarPart5) => void;
}) {
  const rows = part5 ?? [];

  const updateRow = (idx: number, field: string, value: string) => {
    const next = [...rows];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  };

  const addRow = () => {
    onChange([
      ...rows,
      {
        cloCode: "",
        cloDescription: "",
        attainmentPct: 0,
        rootCauseCategory: ROOT_CAUSES[0],
        intervention: "",
        owner: "",
        timelineAndKpi: "",
      },
    ]);
  };

  const removeRow = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No CQI entries. Click "Add Entry" to add one for a NOT-MET CLO.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-2">CLO</th>
                <th className="py-2 pr-2">Root Cause</th>
                <th className="py-2 pr-2">Intervention</th>
                <th className="py-2 pr-2">Owner</th>
                <th className="py-2 pr-2">Timeline & KPI</th>
                <th className="py-2 pr-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  <td className="py-1 pr-2">
                    <Input
                      value={row.cloCode}
                      onChange={(e) =>
                        updateRow(idx, "cloCode", e.target.value)
                      }
                      className="h-8 w-20"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <FormSelect
                      value={row.rootCauseCategory}
                      onValueChange={(v) =>
                        updateRow(idx, "rootCauseCategory", v)
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
                      value={row.intervention}
                      onChange={(e) =>
                        updateRow(idx, "intervention", e.target.value)
                      }
                      className="h-8"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <Input
                      value={row.owner}
                      onChange={(e) => updateRow(idx, "owner", e.target.value)}
                      className="h-8 w-32"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <Input
                      value={row.timelineAndKpi}
                      onChange={(e) =>
                        updateRow(idx, "timelineAndKpi", e.target.value)
                      }
                      className="h-8"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <Button
                      variant="ghost"
                      onClick={() => removeRow(idx)}
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
      )}
      <Button variant="outline" onClick={addRow}>
        + Add Entry
      </Button>
    </div>
  );
}

function Part6({
  part6,
  onChange,
}: {
  part6?: CarPart6;
  onChange: (value: CarPart6) => void;
}) {
  const currentPart6: CarPart6 = part6 ?? {
    studentExitCrossReferences: [],
    teachingStrategies: [],
    facultyReflection: null,
  };

  return (
    <div className="space-y-4">
      <div>
        <Field>
          <FieldLabel>Teaching Strategies</FieldLabel>
          <Textarea
            value={currentPart6.teachingStrategies?.join("\n") || ""}
            onChange={(e) =>
              onChange({
                ...currentPart6,
                teachingStrategies: e.target.value.split("\n").filter(Boolean),
              })
            }
            placeholder="One strategy per line (max 11)"
            rows={4}
          />
        </Field>
      </div>
      <div>
        <Field>
          <FieldLabel>Faculty Reflection</FieldLabel>
          <Textarea
            value={currentPart6.facultyReflection || ""}
            onChange={(e) =>
              onChange({ ...currentPart6, facultyReflection: e.target.value })
            }
            placeholder="Reflect on the term's delivery and outcomes..."
            rows={4}
          />
        </Field>
      </div>
      {(currentPart6.studentExitCrossReferences ?? []).length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">
            Student Exit Cross-References
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">CLO/PLO</th>
                  <th className="py-2 pr-4 text-right">Avg Perceived</th>
                  <th className="py-2 pr-4">Faculty Note</th>
                </tr>
              </thead>
              <tbody>
                {currentPart6.studentExitCrossReferences.map((row, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{row.cloPloCode}</td>
                    <td className="py-2 pr-4 text-right">
                      {row.studentAvgPerceived !== null &&
                      row.studentAvgPerceived !== undefined
                        ? row.studentAvgPerceived
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">{row.facultyNote || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Part7({
  part7,
  onChange,
}: {
  part7?: CarPart7;
  onChange: (value: CarPart7) => void;
}) {
  const currentPart7: CarPart7 = part7 ?? {
    facultyCertification: false,
    submittedBy: null,
    receivedBy: null,
    programChairDisposition: null,
  };

  const d = currentPart7.programChairDisposition ?? {
    accepted: false,
    returnReason: null,
    returnByDate: null,
    cqiEntriesReviewed: false,
    escalationRequired: false,
    atRiskListReceived: false,
  };

  const update = (field: string, value: unknown) => {
    onChange({
      ...currentPart7,
      programChairDisposition: { ...d, [field]: value },
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="text-xs text-muted-foreground">
            Faculty Submitter
          </span>
          <p className="font-medium">{currentPart7.submittedBy || "—"}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Chair Receiver</span>
          <p className="font-medium">{currentPart7.receivedBy || "—"}</p>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-medium">Program Chair Disposition</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={d.accepted ?? false}
              onChange={(e) => update("accepted", e.target.checked)}
              className="rounded border-input"
            />
            Accepted
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={d.cqiEntriesReviewed ?? false}
              onChange={(e) => update("cqiEntriesReviewed", e.target.checked)}
              className="rounded border-input"
            />
            CQI Entries Reviewed
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={d.escalationRequired ?? false}
              onChange={(e) => update("escalationRequired", e.target.checked)}
              className="rounded border-input"
            />
            Escalation Required
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={d.atRiskListReceived ?? false}
              onChange={(e) => update("atRiskListReceived", e.target.checked)}
              className="rounded border-input"
            />
            At-Risk List Received
          </label>
        </div>
        <Field>
          <FieldLabel>Return Reason (if returning)</FieldLabel>
          <Textarea
            value={d.returnReason || ""}
            onChange={(e) => update("returnReason", e.target.value)}
            placeholder="Reason for returning the report..."
            rows={2}
          />
        </Field>
        <Field>
          <FieldLabel>Return By Date</FieldLabel>
          <Input
            type="date"
            value={d.returnByDate || ""}
            onChange={(e) => update("returnByDate", e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main CAR Form
// ---------------------------------------------------------------------------

const TABS = [
  { key: "p1", label: "P1 — Course Info" },
  { key: "p2", label: "P2 — Assessment" },
  { key: "p3", label: "P3 — Cohort" },
  { key: "p4", label: "P4 — At-Risk" },
  { key: "p5", label: "P5 — CQI" },
  { key: "p6", label: "P6 — Exit & Strategies" },
  { key: "p7", label: "P7 — Disposition" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function CarForm() {
  const [payload, setPayload] = useAtom(carPayloadAtom);
  const [dirty, setDirty] = useAtom(carDirtyAtom);
  const [activeTab, setActiveTab] = useState<TabKey>("p1");
  // NOTE: target section comes from the dashboard picker, not local state.
  const classSectionId = useAtomValue(selectedClassSectionIdAtom);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // NOTE: changing the global section drops a CAR loaded for another section
  // (was inline in the section select's onChange before the dashboard picker).
  useEffect(() => {
    if (payload && classSectionId !== payload.classSectionId) {
      setPayload(null);
      setDirty(false);
    }
  }, [classSectionId, payload, setPayload, setDirty]);

  const handleGenerate = useCallback(async () => {
    if (!classSectionId.trim()) return;
    setGenerating(true);
    try {
      const result = await generateCar({
        classSectionId: classSectionId.trim(),
      });
      if (result.ok) {
        setPayload(result.data.payload as unknown as CarPayload);
        setDirty(false);
        toast.create({ title: "CAR generated successfully", type: "success" });
      } else {
        toastError({
          title: "Generate failed",
          description: result.error,
          scope: "car:generate",
        });
      }
    } finally {
      setGenerating(false);
    }
  }, [classSectionId, setPayload, setDirty]);

  const handleSave = useCallback(async () => {
    if (!payload?.formSubmissionId) return;
    setSaving(true);
    try {
      const result = await saveCar(payload.formSubmissionId, {
        part1: payload.part1 as unknown as Record<string, unknown>,
        part5: payload.part5 as unknown as Record<string, unknown>[],
        part6: payload.part6 as unknown as Record<string, unknown>,
        part7: payload.part7 as unknown as Record<string, unknown>,
      });
      if (result.ok) {
        setDirty(false);
        toast.create({ title: "CAR saved successfully", type: "success" });
      } else {
        toastError({
          title: "Save failed",
          description: result.error,
          scope: "car:save",
        });
      }
    } finally {
      setSaving(false);
    }
  }, [payload, setDirty]);

  const updatePart5 = (rows: CarPart5) => {
    if (!payload) return;
    setPayload({ ...payload, part5: rows });
    setDirty(true);
  };

  const updatePart1 = (part1: CarPart1) => {
    if (!payload) return;
    setPayload({ ...payload, part1 });
    setDirty(true);
  };

  const updatePart6 = (value: CarPart6) => {
    if (!payload) return;
    setPayload({ ...payload, part6: value });
    setDirty(true);
  };

  const updatePart7 = (value: CarPart7) => {
    if (!payload) return;
    setPayload({ ...payload, part7: value });
    setDirty(true);
  };

  const courseTitleDisplay =
    payload?.part1?.courseCode && payload?.part1?.courseTitle
      ? `${payload.part1.courseCode} — ${payload.part1.courseTitle}`
      : payload?.part1?.courseCode ||
        payload?.part1?.courseTitle ||
        "Course Assessment Report";

  return (
    <div className="space-y-4">
      {/* Top Generator Bar */}
      <Frame>
        <FrameHeader>
          <FrameTitle>Generate Course Assessment Report</FrameTitle>
          <FrameDescription>
            Generate or view the 7-part CAR from ingest data for the selected
            class section.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          {!classSectionId ? (
            <ContextRequired scope="class-section" />
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={generating || !classSectionId.trim()}
            >
              {generating ? "Generating..." : "Generate CAR"}
            </Button>
          )}
        </FramePanel>
      </Frame>

      {/* Payload Loaded View */}
      {payload && (
        <div className="space-y-4">
          <SubmissionStatusCard submissionId={payload.formSubmissionId} />

          {/* Header bar */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{courseTitleDisplay}</h3>
                {payload.part1?.sectionCode && (
                  <Badge variant="outline">{payload.part1.sectionCode}</Badge>
                )}
                {(payload.part1?.schoolYear || payload.part1?.semester) && (
                  <Badge variant="outline">
                    {payload.part1.schoolYear} {payload.part1.semester}
                  </Badge>
                )}
                {payload.part1?.term && (
                  <Badge variant="outline">{payload.part1.term}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Generated {new Date(payload.generatedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {dirty && <Badge variant="warning">Unsaved</Badge>}
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={!dirty || saving}
              >
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="flex gap-1 overflow-x-auto border-b">
            {TABS.map((tab) => (
              <Button
                key={tab.key}
                variant="ghost"
                onClick={() => setActiveTab(tab.key)}
                // Neutralise Button's default box (h-8, pill corners, hover
                // fill, full border) so the underline-tab strip is unchanged.
                className={`h-auto rounded-none border-0 border-b-2 hover:bg-transparent whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? "border-primary text-foreground hover:text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          {/* Tab content */}
          <Frame>
            <FramePanel>
              {activeTab === "p1" && (
                <Part1 part1={payload.part1} onChange={updatePart1} />
              )}
              {activeTab === "p2" && <Part2 part2={payload.part2} />}
              {activeTab === "p3" && <Part3 part3={payload.part3} />}
              {activeTab === "p4" && <Part4 part4={payload.part4} />}
              {activeTab === "p5" && (
                <Part5 part5={payload.part5} onChange={updatePart5} />
              )}
              {activeTab === "p6" && (
                <Part6 part6={payload.part6} onChange={updatePart6} />
              )}
              {activeTab === "p7" && (
                <Part7 part7={payload.part7} onChange={updatePart7} />
              )}
            </FramePanel>
            {dirty && (
              <FrameFooter>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" onClick={() => setDirty(false)}>
                    Discard
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </FrameFooter>
            )}
          </Frame>
        </div>
      )}
    </div>
  );
}
