"use client";

import { createListCollection } from "@ark-ui/react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast, toastError } from "@/components/ui/toast";
import {
  type CloEntity,
  type CloPloMapDto,
  createCloPloMap,
  deleteCloPloMap,
  listCloPloEntities,
  listCloPloMaps,
  type PloEntity,
  updateCloPloMap,
} from "@/server/actions/plan";

const STAGES = ["i", "p", "d"] as const;

interface CloPloMapPanelProps {
  programId: string;
}

export function CloPloMapPanel({ programId }: CloPloMapPanelProps) {
  const [maps, setMaps] = useState<CloPloMapDto[]>([]);
  const [clos, setClos] = useState<CloEntity[]>([]);
  const [plos, setPlos] = useState<PloEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMap, setEditingMap] = useState<CloPloMapDto | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form state
  const [selectedCloId, setSelectedCloId] = useState("");
  const [selectedPloId, setSelectedPloId] = useState("");
  const [weight, setWeight] = useState("1.0");
  const [stage, setStage] = useState<string>("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [mapsResult, entitiesResult] = await Promise.all([
      listCloPloMaps(programId),
      listCloPloEntities(programId),
    ]);

    if (mapsResult.ok) setMaps(mapsResult.data);
    else
      toastError({
        title: "Failed to load mappings",
        description: mapsResult.error,
        scope: "clo-plo-map:list",
      });

    if (entitiesResult.ok) {
      setClos(entitiesResult.data.clos);
      setPlos(entitiesResult.data.plos);
    } else
      toastError({
        title: "Failed to load CLOs/PLOs",
        description: entitiesResult.error,
        scope: "clo-plo-map:entities",
      });

    setLoading(false);
  }, [programId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreateDialog = () => {
    setEditingMap(null);
    setSelectedCloId("");
    setSelectedPloId("");
    setWeight("1.0");
    setStage("");
    setDialogOpen(true);
  };

  const openEditDialog = (map: CloPloMapDto) => {
    setEditingMap(map);
    setSelectedCloId(map.cloId);
    setSelectedPloId(map.ploId);
    setWeight(map.weight.toString());
    setStage(map.stage ?? "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const weightNum = parseFloat(weight);
    if (Number.isNaN(weightNum) || weightNum < 0 || weightNum > 1) {
      toast.create({ title: "Weight must be between 0 and 1", type: "error" });
      return;
    }

    if (editingMap) {
      const result = await updateCloPloMap(editingMap.id, {
        weight: weightNum,
        stage: stage || undefined,
      });
      if (result.ok) {
        toast.create({ title: "Mapping updated", type: "success" });
        setDialogOpen(false);
        fetchData();
      } else {
        toastError({
          title: "Update failed",
          description: result.error,
          scope: "clo-plo-map:update",
        });
      }
    } else {
      if (!selectedCloId || !selectedPloId) {
        toast.create({
          title: "Please select a CLO and PLO",
          type: "error",
        });
        return;
      }

      const result = await createCloPloMap({
        cloId: selectedCloId,
        ploId: selectedPloId,
        weight: weightNum,
        stage: stage || undefined,
      });
      if (result.ok) {
        toast.create({ title: "Mapping created", type: "success" });
        setDialogOpen(false);
        fetchData();
      } else {
        toastError({
          title: "Create failed",
          description: result.error,
          scope: "clo-plo-map:create",
        });
      }
    }
  };

  const handleDelete = async (id: string) => {
    const result = await deleteCloPloMap(id);
    if (result.ok) {
      toast.create({ title: "Mapping deleted", type: "success" });
      setDeleteConfirmId(null);
      fetchData();
    } else {
      toastError({
        title: "Delete failed",
        description: result.error,
        scope: "clo-plo-map:delete",
      });
    }
  };

  // Group clos by course for the dropdown
  const closByCourse = clos.reduce(
    (acc, clo) => {
      const key = `${clo.courseCode} - ${clo.courseTitle}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(clo);
      return acc;
    },
    {} as Record<string, CloEntity[]>,
  );

  // Create collections for Ark UI Select
  const cloCollection = createListCollection({
    items: clos,
    itemToValue: (item) => item.id,
    itemToString: (item) => `${item.code} - ${item.description}`,
  });

  const ploCollection = createListCollection({
    items: plos,
    itemToValue: (item) => item.id,
    itemToString: (item) => `${item.code} - ${item.description}`,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">CLO-PLO Connections</h3>
          <p className="text-xs text-muted-foreground">
            Map Course Learning Outcomes to Program Learning Outcomes with
            weight and I-P-D stage.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={openCreateDialog}>
          + Add Connection
        </Button>
      </div>

      {loading ? (
        <div className="py-4 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : maps.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No CLO-PLO connections yet. Click "Add Connection" to create one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">CLO</th>
                <th className="px-3 py-2 font-medium">PLO</th>
                <th className="px-3 py-2 font-medium text-center">Weight</th>
                <th className="px-3 py-2 font-medium text-center">Stage</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {maps.map((map) => (
                <tr
                  key={map.id}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{map.clo.code}</div>
                    <div className="text-xs text-muted-foreground">
                      {map.clo.description}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{map.plo.code}</div>
                    <div className="text-xs text-muted-foreground">
                      {map.plo.description}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">{map.weight}</td>
                  <td className="px-3 py-2 text-center">
                    {map.stage ? (
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                          map.stage === "d"
                            ? "bg-success/20 text-success"
                            : map.stage === "p"
                              ? "bg-info/20 text-info"
                              : "bg-warning/20 text-warning"
                        }`}
                      >
                        {map.stage.toUpperCase()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => openEditDialog(map)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive"
                      onClick={() => setDeleteConfirmId(map.id)}
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
      <Dialog
        open={dialogOpen}
        onOpenChange={(details) => setDialogOpen(details.open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMap ? "Edit Connection" : "Add Connection"}
            </DialogTitle>
            <DialogDescription>
              {editingMap
                ? "Update the weight and stage for this CLO-PLO connection."
                : "Select a CLO and PLO to connect."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!editingMap && (
              <>
                <Field>
                  <FieldLabel>Course Learning Outcome (CLO)</FieldLabel>
                  <FieldDescription>
                    Select the CLO to connect. CLOs are grouped by course.
                  </FieldDescription>
                  <Select
                    value={selectedCloId ? [selectedCloId] : undefined}
                    onValueChange={(details) =>
                      setSelectedCloId(details.value[0] ?? "")
                    }
                    collection={cloCollection}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a CLO" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(closByCourse).map(([course, cloList]) => (
                        <SelectGroup key={course}>
                          <SelectGroupLabel>{course}</SelectGroupLabel>
                          {cloList.map((clo) => (
                            <SelectItem key={clo.id} item={clo}>
                              {clo.code} - {clo.description}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel>Program Learning Outcome (PLO)</FieldLabel>
                  <FieldDescription>
                    Select the PLO to connect to.
                  </FieldDescription>
                  <Select
                    value={selectedPloId ? [selectedPloId] : undefined}
                    onValueChange={(details) =>
                      setSelectedPloId(details.value[0] ?? "")
                    }
                    collection={ploCollection}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a PLO" />
                    </SelectTrigger>
                    <SelectContent>
                      {plos.map((plo) => (
                        <SelectItem key={plo.id} item={plo}>
                          {plo.code} - {plo.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </>
            )}

            <Field>
              <FieldLabel>Weight (0-1)</FieldLabel>
              <FieldDescription>
                Correlation strength. Default is 1.0 (full weight).
              </FieldDescription>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel>I-P-D Stage</FieldLabel>
              <FieldDescription>
                Introduction, Proficiency, or Demonstration stage.
              </FieldDescription>
              <div className="flex gap-2">
                {STAGES.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant={stage === s ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStage(stage === s ? "" : s)}
                    className={
                      stage === s
                        ? s === "d"
                          ? "bg-success hover:bg-success/90"
                          : s === "p"
                            ? "bg-info hover:bg-info/90"
                            : "bg-warning hover:bg-warning/90"
                        : ""
                    }
                  >
                    {s.toUpperCase()}
                  </Button>
                ))}
              </div>
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingMap ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={(details) => {
          if (!details.open) setDeleteConfirmId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Connection</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this CLO-PLO connection? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
