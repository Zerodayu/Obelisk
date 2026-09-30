"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FormWorkflow } from "@/components/forms/form-workflow";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ClassSectionSelect } from "@/components/ui/class-section-select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/components/ui/toast";
import type { ActionTakenData, AtRiskFlagRow } from "@/server/actions/at-risk";
import {
  getActionTaken,
  initActionTaken,
  listAtRiskFlags,
  saveActionTaken,
} from "@/server/actions/at-risk";

/**
 * Action-Taken Record (test 9.9) — pick a class section, review its at-risk
 * watchlist, select the students the intervention covered, describe the
 * intervention, then run the normal submit/approve workflow. The backend
 * clears the selected students' `AtRiskFlag` rows when the final approval
 * step lands (never before), so a returned or rejected form leaves every
 * flag in place.
 */

interface Payload {
  id: string;
  status: string;
  formData: Partial<ActionTakenData>;
}

/** One row per flagged student (a student can trip several CLOs). */
interface WatchlistEntry {
  studentId: string;
  name: string;
  studentNumber: string;
  cloCodes: string[];
  reasons: string[];
}

function groupFlags(rows: AtRiskFlagRow[]): WatchlistEntry[] {
  const byStudent = new Map<string, WatchlistEntry>();
  for (const row of rows) {
    const entry = byStudent.get(row.studentId) ?? {
      studentId: row.studentId,
      name: `${row.student.lastName}, ${row.student.firstName}`,
      studentNumber: row.student.studentNumber,
      cloCodes: [],
      reasons: [],
    };
    const cloCode = row.cloAttainment?.clo.code;
    if (cloCode && !entry.cloCodes.includes(cloCode)) {
      entry.cloCodes.push(cloCode);
    }
    if (!entry.reasons.includes(row.reason)) entry.reasons.push(row.reason);
    byStudent.set(row.studentId, entry);
  }
  return [...byStudent.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function ActionTakenForm() {
  const [classSectionId, setClassSectionId] = useState("");
  const [flags, setFlags] = useState<AtRiskFlagRow[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionTaken, setActionTaken] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load the watchlist whenever the section changes (before init even).
  useEffect(() => {
    if (!classSectionId) {
      setFlags([]);
      return;
    }
    let cancelled = false;
    setFlagsLoading(true);
    listAtRiskFlags(classSectionId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setFlags(result.data);
        else
          toastError({
            title: "Watchlist load failed",
            description: result.error,
            scope: "atrisk:flags",
          });
      })
      .finally(() => {
        if (!cancelled) setFlagsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classSectionId]);

  const handleInit = useCallback(async () => {
    setLoading(true);
    try {
      const init = await initActionTaken(classSectionId);
      if (!init.ok) {
        toastError({
          title: "Init failed",
          description: init.error,
          scope: "atrisk:init",
        });
        return;
      }
      const loaded = await getActionTaken<Payload>(init.data.id);
      if (!loaded.ok) {
        toastError({
          title: "Load failed",
          description: loaded.error,
          scope: "atrisk:load",
        });
        return;
      }
      setPayload(loaded.data);
      setSelectedIds(loaded.data.formData.studentIds ?? []);
      setActionTaken(loaded.data.formData.actionTaken ?? "");
      toast.create({ title: "Form opened", type: "success" });
    } finally {
      setLoading(false);
    }
  }, [classSectionId]);

  const handleSave = useCallback(async () => {
    if (!payload) return;
    setSaving(true);
    try {
      const result = await saveActionTaken<Payload>(payload.id, {
        studentIds: selectedIds,
        actionTaken,
      });
      if (result.ok) {
        setPayload(result.data);
        toast.create({ title: "Saved successfully", type: "success" });
      } else {
        toastError({
          title: "Save failed",
          description: result.error,
          scope: "atrisk:save",
        });
      }
    } finally {
      setSaving(false);
    }
  }, [payload, selectedIds, actionTaken]);

  const submissionId = payload?.id;
  // NOTE: merge only `status` after a workflow action so unsaved edits survive.
  const syncStatus = useCallback(async () => {
    if (!submissionId) return;
    const result = await getActionTaken<Payload>(submissionId);
    if (result.ok) {
      setPayload((prev) =>
        prev ? { ...prev, status: result.data.status } : prev,
      );
    }
  }, [submissionId]);

  const watchlist = useMemo(() => groupFlags(flags), [flags]);

  function toggleStudent(studentId: string) {
    setSelectedIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId],
    );
  }

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Open Action-Taken Record</FrameTitle>
          <FrameDescription>
            Select the class section to see its at-risk watchlist, then open the
            form for that section.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="max-w-md">
            <Field>
              <FieldLabel>Class Section</FieldLabel>
              <ClassSectionSelect
                value={classSectionId}
                onValueChange={setClassSectionId}
                loadAll
              />
            </Field>
          </div>
          {classSectionId ? (
            <div className="mt-4 text-sm text-muted-foreground">
              {flagsLoading
                ? "Loading at-risk students..."
                : watchlist.length === 0
                  ? "No at-risk students in this section."
                  : `${watchlist.length} at-risk student(s) in this section.`}
            </div>
          ) : null}
          <div className="mt-4">
            <Button onClick={handleInit} disabled={loading || !classSectionId}>
              {loading ? "Opening..." : "Open Form"}
            </Button>
          </div>
        </FramePanel>
      </Frame>
    );
  }

  // NOTE: mirrors backend EDITABLE_STATUSES — saves are rejected outside draft/returned anyway.
  const editable = payload.status === "draft" || payload.status === "returned";

  return (
    <div className="space-y-6">
      <FormWorkflow submissionId={payload.id} onChanged={syncStatus} />

      <Frame>
        <FrameHeader>
          <FrameTitle>At-Risk Students Covered</FrameTitle>
          <FrameDescription>
            Select every student this intervention covered. Their at-risk flag
            is cleared only once the form is fully approved.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          {watchlist.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No at-risk students recorded for this section.
            </p>
          ) : (
            <ul className="divide-y">
              {watchlist.map((entry) => (
                <li
                  key={entry.studentId}
                  className="flex items-start gap-3 py-3"
                >
                  <Checkbox
                    checked={selectedIds.includes(entry.studentId)}
                    onCheckedChange={() => toggleStudent(entry.studentId)}
                    disabled={!editable}
                    aria-label={`Select ${entry.name}`}
                    className="mt-1"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {entry.name}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {entry.studentNumber}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.cloCodes.join(", ")} — {entry.reasons.join("; ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Action Taken</FrameTitle>
          <FrameDescription>
            Describe the intervention performed for the selected students.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <Field>
            <FieldLabel>Intervention</FieldLabel>
            <Textarea
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              disabled={!editable}
              rows={5}
              placeholder="e.g. One-on-one coaching sessions held on Sep 8/10/12; supplemental exercises issued; re-assessment scheduled for week 11."
            />
          </Field>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving || !editable}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            {!editable ? (
              <p className="text-xs text-muted-foreground">
                Locked — editing is only allowed while the form is draft or
                returned.
              </p>
            ) : null}
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}
