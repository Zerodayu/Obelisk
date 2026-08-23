"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
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
  FrameFooter,
} from "@/components/reui/frame";
import { carDirtyAtom, carPayloadAtom, type CarPayload } from "@/lib/store/atoms/car";
import { generateCar, saveCar } from "@/server/actions/car";

// ---------------------------------------------------------------------------
// 4-tier level helpers
// ---------------------------------------------------------------------------

function levelBadge(level: string | null, status: string) {
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
    <Badge variant={v === "success" ? "success" : v === "info" ? "info" : v === "warning" ? "warning" : "destructive"}>
      {level} {status === "MET" ? "✓" : "✗"}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Part components
// ---------------------------------------------------------------------------

function Part1({ part1 }: { part1: CarPayload["part1"] }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <span className="text-xs text-muted-foreground">Course</span>
          <p className="font-medium">{part1.course.code} — {part1.course.title}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Section</span>
          <p className="font-medium">{part1.sectionCode}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Program</span>
          <p className="font-medium">{part1.program.name}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Term</span>
          <p className="font-medium">{part1.term}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Year Level</span>
          <p className="font-medium">Year {part1.yearLevel}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Faculty</span>
          <p className="font-medium">{part1.facultyName || "—"}</p>
        </div>
      </div>

      {part1.cloPloMapping.length > 0 && (
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
                  <td className="py-2 pr-4">{row.bloomsLevel || "—"}</td>
                  <td className="py-2 pr-4">
                    <Badge variant="outline">{row.ipdStage?.toUpperCase() || "—"}</Badge>
                  </td>
                  <td className="py-2 pr-4">{row.assessmentTypes?.join(", ") || "—"}</td>
                  <td className="py-2 pr-4 text-right">{row.weightInGradePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Part2({ part2 }: { part2: CarPayload["part2"] }) {
  if (!part2 || part2.length === 0) {
    return <p className="text-sm text-muted-foreground">No assessment-type data available.</p>;
  }
  return (
    <div className="space-y-3">
      {part2.map((group) => (
        <div key={group.assessmentType}>
          <h4 className="text-sm font-medium mb-2">{group.assessmentType}</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">CLO</th>
                  <th className="py-2 pr-4 text-right">Score %</th>
                  <th className="py-2 pr-4">Level</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {group.cloAttainments.map((row) => (
                  <tr key={row.cloCode} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{row.cloCode}</td>
                    <td className="py-2 pr-4 text-right">{row.scorePct.toFixed(1)}%</td>
                    <td className="py-2 pr-4">{levelBadge(row.level, row.status)}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={row.status === "MET" ? "success" : "destructive"}>
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

function Part3({ part3 }: { part3: CarPayload["part3"] }) {
  if (!part3 || part3.length === 0) {
    return <p className="text-sm text-muted-foreground">No cohort data available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-4">Year Level</th>
            <th className="py-2 pr-4 text-right">Cohort Size</th>
            <th className="py-2 pr-4 text-right">Weighted Avg %</th>
            <th className="py-2 pr-4">Level</th>
            <th className="py-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {part3.map((row) => (
            <tr key={row.yearLevel} className="border-b last:border-0">
              <td className="py-2 pr-4 font-medium">Year {row.yearLevel}</td>
              <td className="py-2 pr-4 text-right">{row.cohortSize}</td>
              <td className="py-2 pr-4 text-right">
                {row.weightedAvgPct !== null ? `${row.weightedAvgPct.toFixed(1)}%` : "—"}
              </td>
              <td className="py-2 pr-4">{levelBadge(row.level, row.status)}</td>
              <td className="py-2 pr-4">
                <Badge variant={row.status === "MET" ? "success" : "destructive"}>
                  {row.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Part4({ part4 }: { part4: CarPayload["part4"] }) {
  if (!part4 || part4.length === 0) {
    return <p className="text-sm text-muted-foreground">No at-risk students.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-4">Student</th>
            <th className="py-2 pr-4">ID</th>
            <th className="py-2 pr-4">CLO</th>
            <th className="py-2 pr-4 text-right">Score %</th>
            <th className="py-2 pr-4">Reason</th>
          </tr>
        </thead>
        <tbody>
          {part4.map((row) => (
            <tr key={`${row.studentId}-${row.cloCode}`} className="border-b last:border-0">
              <td className="py-2 pr-4 font-medium">{row.studentName}</td>
              <td className="py-2 pr-4 text-muted-foreground">{row.studentNumber}</td>
              <td className="py-2 pr-4">{row.cloCode}</td>
              <td className="py-2 pr-4 text-right text-destructive font-medium">
                {row.scorePct.toFixed(1)}%
              </td>
              <td className="py-2 pr-4">{row.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Part5({
  part5,
  onChange,
}: {
  part5: CarPayload["part5"];
  onChange: (rows: CarPayload["part5"]) => void;
}) {
  const ROOT_CAUSES = [
    "1-Curriculum Design",
    "2-Instruction & Pedagogy",
    "3-Assessment Design",
    "4-Student Factors",
    "5-Resources & Tools",
    "6-Industry & Field Alignment",
  ];

  const updateRow = (idx: number, field: string, value: string) => {
    const next = [...part5];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  };

  const addRow = () => {
    onChange([
      ...part5,
      {
        cloCode: "",
        rootCauseCategory: ROOT_CAUSES[0],
        intervention: "",
        owner: "",
        timelineAndKpi: "",
      },
    ]);
  };

  const removeRow = (idx: number) => {
    onChange(part5.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      {part5.length === 0 ? (
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
              {part5.map((row, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  <td className="py-1 pr-2">
                    <Input
                      value={row.cloCode}
                      onChange={(e) => updateRow(idx, "cloCode", e.target.value)}
                      className="h-8 w-20"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      value={row.rootCauseCategory}
                      onChange={(e) => updateRow(idx, "rootCauseCategory", e.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {ROOT_CAUSES.map((rc) => (
                        <option key={rc} value={rc}>{rc}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <Input
                      value={row.intervention}
                      onChange={(e) => updateRow(idx, "intervention", e.target.value)}
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
                      onChange={(e) => updateRow(idx, "timelineAndKpi", e.target.value)}
                      className="h-8"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <Button
                      variant="ghost"
                      size="sm"
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
      <Button variant="outline" size="sm" onClick={addRow}>
        + Add Entry
      </Button>
    </div>
  );
}

function Part6({
  part6,
  onChange,
}: {
  part6: CarPayload["part6"];
  onChange: (value: CarPayload["part6"]) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Field>
          <FieldLabel>Teaching Strategies</FieldLabel>
          <Textarea
            value={part6.teachingStrategies?.join("\n") || ""}
            onChange={(e) =>
              onChange({
                ...part6,
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
            value={part6.facultyReflection || ""}
            onChange={(e) =>
              onChange({ ...part6, facultyReflection: e.target.value })
            }
            placeholder="Reflect on the term's delivery and outcomes..."
            rows={4}
          />
        </Field>
      </div>
      {part6.studentExitCrossReferences?.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Student Exit Cross-References</h4>
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
                {part6.studentExitCrossReferences.map((row, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{row.cloPloCode}</td>
                    <td className="py-2 pr-4 text-right">{row.studentAvgPerceived}</td>
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
  part7: CarPayload["part7"];
  onChange: (value: CarPayload["part7"]) => void;
}) {
  const d = part7.programChairDisposition;
  const update = (field: string, value: unknown) => {
    onChange({
      ...part7,
      programChairDisposition: { ...d, [field]: value },
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="text-xs text-muted-foreground">Faculty</span>
          <p className="font-medium">{part7.certification.facultyName || "—"}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Date Submitted</span>
          <p className="font-medium">{part7.certification.dateSubmitted || "—"}</p>
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
  const [classSectionId, setClassSectionId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!classSectionId.trim()) return;
    setGenerating(true);
    try {
      const result = await generateCar({ classSectionId: classSectionId.trim() });
      if (result.ok) {
        setPayload(result.data.payload as unknown as CarPayload);
        setDirty(false);
        toast.create({ title: "CAR generated successfully", type: "success" });
      } else {
        toastError({ title: "Generate failed", description: result.error, scope: "car:generate" });
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
        part1: payload.part1,
        part5: payload.part5,
        part6: payload.part6,
        part7: payload.part7,
      });
      if (result.ok) {
        setDirty(false);
        toast.create({ title: "CAR saved successfully", type: "success" });
      } else {
        toastError({ title: "Save failed", description: result.error, scope: "car:save" });
      }
    } finally {
      setSaving(false);
    }
  }, [payload, setDirty]);

  const updatePart5 = (rows: CarPayload["part5"]) => {
    if (!payload) return;
    setPayload({ ...payload, part5: rows });
    setDirty(true);
  };

  const updatePart6 = (value: CarPayload["part6"]) => {
    if (!payload) return;
    setPayload({ ...payload, part6: value });
    setDirty(true);
  };

  const updatePart7 = (value: CarPayload["part7"]) => {
    if (!payload) return;
    setPayload({ ...payload, part7: value });
    setDirty(true);
  };

  // No payload yet — show generate form
  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Generate Course Assessment Report</FrameTitle>
          <FrameDescription>
            Enter a class section ID to generate the 7-part CAR from ingest data.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="flex items-end gap-3">
            <Field className="flex-1">
              <FieldLabel>Class Section ID</FieldLabel>
              <Input
                value={classSectionId}
                onChange={(e) => setClassSectionId(e.target.value)}
                placeholder="e.g. clx_abc123"
              />
            </Field>
            <Button onClick={handleGenerate} disabled={generating || !classSectionId.trim()}>
              {generating ? "Generating..." : "Generate CAR"}
            </Button>
          </div>
        </FramePanel>
      </Frame>
    );
  }

  // Payload loaded — show 7-part tabbed view
  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              {payload.part1.course.code} — {payload.part1.course.title}
            </h3>
            <Badge variant="outline">{payload.part1.sectionCode}</Badge>
            <Badge variant="outline">{payload.part1.term}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Generated {new Date(payload.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <Badge variant="warning">Unsaved</Badge>}
          <Button variant="outline" size="sm" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
              activeTab === tab.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <Frame>
        <FramePanel>
          {activeTab === "p1" && <Part1 part1={payload.part1} />}
          {activeTab === "p2" && <Part2 part2={payload.part2} />}
          {activeTab === "p3" && <Part3 part3={payload.part3} />}
          {activeTab === "p4" && <Part4 part4={payload.part4} />}
          {activeTab === "p5" && <Part5 part5={payload.part5} onChange={updatePart5} />}
          {activeTab === "p6" && <Part6 part6={payload.part6} onChange={updatePart6} />}
          {activeTab === "p7" && <Part7 part7={payload.part7} onChange={updatePart7} />}
        </FramePanel>
        {dirty && (
          <FrameFooter>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDirty(false)}>
                Discard
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </FrameFooter>
        )}
      </Frame>
    </div>
  );
}
