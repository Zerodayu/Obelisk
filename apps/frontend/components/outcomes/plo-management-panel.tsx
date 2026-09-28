"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ProgramSelect } from "@/components/ui/program-select";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/components/ui/toast";
import { isDevMode } from "@/lib/dev-mode";
import {
  createPlo,
  deletePlo,
  listPlos,
  type PloRecord,
  updatePlo,
} from "@/server/actions/plan";

const SAMPLE_PLO_RECORDS: PloRecord[] = [
  {
    id: "plo-1",
    programId: "program-1",
    code: "PLO1",
    description: "Apply knowledge of computing",
    targetAttainmentPct: 70,
  },
  {
    id: "plo-2",
    programId: "program-1",
    code: "PLO2",
    description: "Solve complex problems",
    targetAttainmentPct: 70,
  },
  {
    id: "plo-3",
    programId: "program-1",
    code: "PLO3",
    description: "Design systems",
    targetAttainmentPct: 75,
  },
];

/**
 * Next sequential PLO code from the existing records: keeps the prefix of the
 * highest-numbered code and increments it (PLO1 → PLO2 → PLO3 …); falls back
 * to `PLO1` when there are no numbered codes yet.
 */
function nextPloCode(records: PloRecord[]): string {
  let found = false;
  let bestPrefix = "";
  let bestNum = 0;
  for (const record of records) {
    const match = /^(.*?)(\d+)$/.exec(record.code.trim());
    if (!match) continue;
    const num = Number(match[2]);
    if (!found || num >= bestNum) {
      found = true;
      bestPrefix = match[1];
      bestNum = num;
    }
  }
  return found ? `${bestPrefix}${bestNum + 1}` : "PLO1";
}

/**
 * Dean-only PLO management: pick a program, then add/edit/delete its Program
 * Learning Outcomes. The Add dialog opens with the next sequential code
 * (PLO1, PLO2, …) already filled in — the dean mainly types the statement.
 */
export function PloManagementPanel() {
  const [programId, setProgramId] = useState("");
  const [records, setRecords] = useState<PloRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PloRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState("70");

  const fetchRecords = useCallback(async (selectedProgramId: string) => {
    if (!selectedProgramId) {
      setRecords([]);
      return;
    }
    setLoading(true);
    const result = await listPlos(selectedProgramId);
    if (result.ok) {
      setRecords(result.data);
    } else if (isDevMode) {
      setRecords(SAMPLE_PLO_RECORDS);
    } else {
      toastError({
        title: "Failed to load PLOs",
        description: result.error,
        scope: "plo:list",
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRecords(programId);
  }, [programId, fetchRecords]);

  const openCreateDialog = () => {
    setEditing(null);
    setCode(nextPloCode(records));
    setDescription("");
    setTarget("70");
    setDialogOpen(true);
  };

  const openEditDialog = (record: PloRecord) => {
    setEditing(record);
    setCode(record.code);
    setDescription(record.description);
    setTarget(record.targetAttainmentPct.toString());
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const trimmedCode = code.trim();
    const trimmedDescription = description.trim();
    const targetNum = parseFloat(target);

    if (!trimmedCode) {
      toast.create({ title: "PLO code is required", type: "error" });
      return;
    }
    if (!trimmedDescription) {
      toast.create({ title: "PLO statement is required", type: "error" });
      return;
    }
    if (Number.isNaN(targetNum) || targetNum < 70 || targetNum > 100) {
      toast.create({
        title: "Target must be between 70 and 100",
        type: "error",
      });
      return;
    }

    if (editing) {
      const result = await updatePlo(editing.id, {
        code: trimmedCode,
        description: trimmedDescription,
        targetAttainmentPct: targetNum,
      });
      if (result.ok) {
        toast.create({ title: "PLO updated", type: "success" });
        setDialogOpen(false);
        fetchRecords(programId);
      } else if (isDevMode) {
        setRecords((prev) =>
          prev.map((record) =>
            record.id === editing.id
              ? {
                  ...record,
                  code: trimmedCode,
                  description: trimmedDescription,
                  targetAttainmentPct: targetNum,
                }
              : record,
          ),
        );
        toast.create({ title: "PLO updated (dev)", type: "success" });
        setDialogOpen(false);
      } else {
        toastError({
          title: "Update failed",
          description: result.error,
          scope: "plo:update",
        });
      }
    } else {
      const result = await createPlo({
        programId,
        code: trimmedCode,
        description: trimmedDescription,
        targetAttainmentPct: targetNum,
      });
      if (result.ok) {
        toast.create({ title: "PLO created", type: "success" });
        setDialogOpen(false);
        fetchRecords(programId);
      } else if (isDevMode) {
        setRecords((prev) => [
          ...prev,
          {
            id: `plo-${Date.now()}`,
            programId,
            code: trimmedCode,
            description: trimmedDescription,
            targetAttainmentPct: targetNum,
          },
        ]);
        toast.create({ title: "PLO created (dev)", type: "success" });
        setDialogOpen(false);
      } else {
        toastError({
          title: "Create failed",
          description: result.error,
          scope: "plo:create",
        });
      }
    }
  };

  const handleDelete = async (id: string) => {
    const result = await deletePlo(id);
    if (result.ok) {
      toast.create({ title: "PLO deleted", type: "success" });
      setDeleteId(null);
      fetchRecords(programId);
    } else if (isDevMode) {
      setRecords((prev) => prev.filter((record) => record.id !== id));
      toast.create({ title: "PLO deleted (dev)", type: "success" });
      setDeleteId(null);
    } else {
      toastError({
        title: "Delete failed",
        description: result.error,
        scope: "plo:delete",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-sm space-y-1">
          <Field>
            <FieldLabel>Program</FieldLabel>
            <FieldDescription>
              Select the program whose PLOs you want to manage.
            </FieldDescription>
            <ProgramSelect
              value={programId || undefined}
              onValueChange={setProgramId}
            />
          </Field>
        </div>
        <Button onClick={openCreateDialog} disabled={!programId}>
          + Add PLO
        </Button>
      </div>

      {!programId ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Select a program to view its Program Learning Outcomes.
        </div>
      ) : loading ? (
        <div className="py-4 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No PLOs yet. Click "Add PLO" to create the first one (PLO1).
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Statement</th>
                <th className="px-3 py-2 font-medium text-center">Target</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr
                  key={record.id}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2 font-medium">{record.code}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {record.description}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {record.targetAttainmentPct}%
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => openEditDialog(record)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-7 px-2 text-destructive"
                      onClick={() => setDeleteId(record.id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <AlertDialog
        open={dialogOpen}
        onOpenChange={(details) => setDialogOpen(details.open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {editing ? "Edit PLO" : "Add PLO"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {editing
                ? "Update this Program Learning Outcome."
                : "The code continues the sequence — PLO1, PLO2, … — and can be adjusted if needed."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogBody>
            <div className="space-y-4">
              <Field>
                <FieldLabel>Code</FieldLabel>
                <FieldDescription>
                  Unique within the program. Suggested as the next in sequence.
                </FieldDescription>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="PLO1"
                />
              </Field>

              <Field>
                <FieldLabel>Statement / Description</FieldLabel>
                <FieldDescription>
                  The Program Learning Outcome statement.
                </FieldDescription>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Apply knowledge of computing..."
                />
              </Field>

              <Field>
                <FieldLabel>Target Attainment (%)</FieldLabel>
                <FieldDescription>
                  Must be at least 70 — the institutional hard floor.
                </FieldDescription>
                <Input
                  type="number"
                  min={70}
                  max={100}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </Field>
            </div>
          </AlertDialogBody>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave}>
              {editing ? "Save Changes" : "Create"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(details) => {
          if (!details.open) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete PLO</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this PLO? PLOs mapped to CLOs or
              with attainment history cannot be deleted. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
