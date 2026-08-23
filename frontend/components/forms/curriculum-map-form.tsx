"use client";

import { useCallback, useState } from "react";

import { toast, toastError } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
} from "@/components/reui/frame";
import { initCurriculumMap, saveCurriculumMap } from "@/server/actions/plan";

interface PloDirectoryRow {
  ploCode: string;
  statement: string;
  evidenceSources: string[];
  dStageCourse: string;
  validationStatus: string;
}

interface CurriculumCourseRow {
  yearLevel: number;
  courseCode: string;
  courseTitle: string;
  cells: {
    ploCode: string;
    stage: string | null;
    cloCodes: string[];
  }[];
}

interface CurriculumMapPayload {
  formSubmissionId: string;
  generatedAt: string;
  header: Record<string, unknown>;
  directoryRows: PloDirectoryRow[];
  courseRows: CurriculumCourseRow[];
  coverageCheck: Record<string, boolean>;
}

const STAGES = ["i", "p", "d"] as const;

export function CurriculumMapForm() {
  const [payload, setPayload] = useState<CurriculumMapPayload | null>(null);
  const [plos, setPlos] = useState<PloDirectoryRow[]>([]);
  const [courses, setCourses] = useState<CurriculumCourseRow[]>([]);
  const [programId, setProgramId] = useState("");
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!programId.trim() || !termId.trim()) return;
    setLoading(true);
    try {
      const result = await initCurriculumMap({
        programId: programId.trim(),
        termId: termId.trim(),
      });
      if (result.ok) {
        const p = result.data.payload as unknown as CurriculumMapPayload;
        setPayload(p);
        setPlos(p.directoryRows || []);
        setCourses(p.courseRows || []);
        toast.create({ title: "Curriculum map initialized", type: "success" });
      } else {
        toastError({ title: "Init failed", description: result.error, scope: "cmap:generate" });
      }
    } finally {
      setLoading(false);
    }
  }, [programId, termId]);

  const handleSave = useCallback(async () => {
    if (!payload?.formSubmissionId) return;
    setSaving(true);
    try {
      const result = await saveCurriculumMap(payload.formSubmissionId, {
        plos: plos.map((p) => ({
          ploCode: p.ploCode,
          statement: p.statement,
          evidenceSources: p.evidenceSources,
          dStageCourse: p.dStageCourse,
          validationStatus: p.validationStatus,
        })),
        courses: courses.map((c) => ({
          yearLevel: c.yearLevel,
          courseCode: c.courseCode,
          courseTitle: c.courseTitle,
          cells: c.cells.map((cell) => ({
            ploCode: cell.ploCode,
            stage: cell.stage ?? undefined,
            cloCodes: cell.cloCodes?.join(", ") || undefined,
          })),
        })),
      });
      if (result.ok) {
        toast.create({ title: "Curriculum map saved", type: "success" });
      } else {
        toastError({ title: "Save failed", description: result.error, scope: "cmap:save" });
      }
    } finally {
      setSaving(false);
    }
  }, [payload, plos, courses]);

  const updateCell = (courseIdx: number, ploCode: string, stage: string | null) => {
    const next = [...courses];
    const course = { ...next[courseIdx] };
    const cells = [...course.cells];
    const cellIdx = cells.findIndex((c) => c.ploCode === ploCode);
    if (cellIdx >= 0) {
      cells[cellIdx] = { ...cells[cellIdx], stage };
    } else {
      cells.push({ ploCode, stage, cloCodes: [] });
    }
    course.cells = cells;
    next[courseIdx] = course;
    setCourses(next);
  };

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Initialize Curriculum Map</FrameTitle>
          <FrameDescription>
            Set up the PLO directory and I-P-D × course matrix for a program + term.
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

  const ploCodes = plos.map((p) => p.ploCode);

  return (
    <div className="space-y-4">
      {/* Coverage check */}
      <Frame>
        <FrameHeader>
          <FrameTitle>PLO Coverage</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <div className="flex flex-wrap gap-2">
            {plos.map((plo) => (
              <Badge key={plo.ploCode} variant={payload.coverageCheck[plo.ploCode] ? "success" : "destructive"}>
                {plo.ploCode}: {payload.coverageCheck[plo.ploCode] ? "Covered" : "Gap"}
              </Badge>
            ))}
          </div>
        </FramePanel>
      </Frame>

      {/* I-P-D Matrix */}
      <Frame>
        <FrameHeader>
          <FrameTitle>I-P-D × Course Matrix</FrameTitle>
          <FrameDescription>
            Click cells to cycle through I → P → D stages. D-stage coverage ensures PLO mapping.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">Course</th>
                  {ploCodes.map((code) => (
                    <th key={code} className="py-2 pr-2 text-center min-w-[60px]">{code}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courses.map((course, cIdx) => (
                  <tr key={course.courseCode} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      <div className="font-medium">{course.courseCode}</div>
                      <div className="text-xs text-muted-foreground">{course.courseTitle}</div>
                    </td>
                    {ploCodes.map((ploCode) => {
                      const cell = course.cells.find((c) => c.ploCode === ploCode);
                      const stage = cell?.stage ?? null;
                      return (
                        <td key={ploCode} className="py-2 pr-2 text-center">
                          <button
                            onClick={() => {
                              const next = stage === "i" ? "p" : stage === "p" ? "d" : stage === "d" ? null : "i";
                              updateCell(cIdx, ploCode, next);
                            }}
                            className={`w-10 h-8 rounded border text-xs font-medium transition-colors ${
                              stage === "d"
                                ? "bg-success/20 border-success text-success"
                                : stage === "p"
                                  ? "bg-info/20 border-info text-info"
                                  : stage === "i"
                                    ? "bg-warning/20 border-warning text-warning"
                                    : "bg-background border-input text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {stage ? stage.toUpperCase() : "—"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FramePanel>
      </Frame>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => { setPayload(null); setPlos([]); setCourses([]); }}>
          Re-initialize
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
