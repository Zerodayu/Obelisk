"use client";

import { createListCollection } from "@ark-ui/react";
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
import { isDevMode } from "@/lib/dev-mode";
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

const WEIGHT_OPTIONS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

interface WeightOption {
  value: number;
  label: string;
}

const weightItems: WeightOption[] = WEIGHT_OPTIONS.map((w) => ({
  value: w,
  label: w.toFixed(1),
}));

// Sample data for dev mode
const SAMPLE_CLOS: CloEntity[] = [
  {
    id: "clo-1",
    code: "CLO1",
    description: "Apply programming fundamentals",
    courseId: "course-1",
    courseCode: "CS101",
    courseTitle: "Introduction to Programming",
  },
  {
    id: "clo-2",
    code: "CLO2",
    description: "Design algorithms",
    courseId: "course-1",
    courseCode: "CS101",
    courseTitle: "Introduction to Programming",
  },
  {
    id: "clo-3",
    code: "CLO1",
    description: "Analyze data structures",
    courseId: "course-2",
    courseCode: "CS201",
    courseTitle: "Data Structures",
  },
  {
    id: "clo-4",
    code: "CLO2",
    description: "Implement tree algorithms",
    courseId: "course-2",
    courseCode: "CS201",
    courseTitle: "Data Structures",
  },
  {
    id: "clo-5",
    code: "CLO1",
    description: "Design database schemas",
    courseId: "course-3",
    courseCode: "CS301",
    courseTitle: "Database Systems",
  },
];

const SAMPLE_PLOS: PloEntity[] = [
  { id: "plo-1", code: "PLO1", description: "Apply knowledge of computing" },
  { id: "plo-2", code: "PLO2", description: "Solve complex problems" },
  { id: "plo-3", code: "PLO3", description: "Design systems" },
  { id: "plo-4", code: "PLO4", description: "Communicate effectively" },
];

const SAMPLE_MAPS: CloPloMapDto[] = [
  {
    id: "map-1",
    cloId: "clo-1",
    ploId: "plo-1",
    weight: 1.0,
    stage: "d",
    clo: SAMPLE_CLOS[0],
    plo: SAMPLE_PLOS[0],
  },
  {
    id: "map-2",
    cloId: "clo-2",
    ploId: "plo-2",
    weight: 0.8,
    stage: "p",
    clo: SAMPLE_CLOS[1],
    plo: SAMPLE_PLOS[1],
  },
  {
    id: "map-3",
    cloId: "clo-3",
    ploId: "plo-1",
    weight: 0.9,
    stage: "d",
    clo: SAMPLE_CLOS[2],
    plo: SAMPLE_PLOS[0],
  },
  {
    id: "map-4",
    cloId: "clo-4",
    ploId: "plo-2",
    weight: 0.7,
    stage: "i",
    clo: SAMPLE_CLOS[3],
    plo: SAMPLE_PLOS[1],
  },
  {
    id: "map-5",
    cloId: "clo-5",
    ploId: "plo-3",
    weight: 1.0,
    stage: "d",
    clo: SAMPLE_CLOS[4],
    plo: SAMPLE_PLOS[2],
  },
];

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

    // In dev mode, use sample data if API fails
    const [mapsResult, entitiesResult] = await Promise.all([
      listCloPloMaps(programId),
      listCloPloEntities(programId),
    ]);

    if (mapsResult.ok) {
      setMaps(mapsResult.data);
    } else if (isDevMode) {
      setMaps(SAMPLE_MAPS);
    } else {
      toastError({
        title: "Failed to load mappings",
        description: mapsResult.error,
        scope: "clo-plo-map:list",
      });
    }

    if (entitiesResult.ok) {
      setClos(entitiesResult.data.clos);
      setPlos(entitiesResult.data.plos);
    } else if (isDevMode) {
      setClos(SAMPLE_CLOS);
      setPlos(SAMPLE_PLOS);
    } else {
      toastError({
        title: "Failed to load CLOs/PLOs",
        description: entitiesResult.error,
        scope: "clo-plo-map:entities",
      });
    }

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
      } else if (isDevMode) {
        // Dev mode: simulate update locally
        setMaps((prev) =>
          prev.map((m) =>
            m.id === editingMap.id
              ? { ...m, weight: weightNum, stage: stage || null }
              : m,
          ),
        );
        toast.create({ title: "Mapping updated (dev)", type: "success" });
        setDialogOpen(false);
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
      } else if (isDevMode) {
        // Dev mode: simulate create locally
        const clo = clos.find((c) => c.id === selectedCloId);
        const plo = plos.find((p) => p.id === selectedPloId);
        if (clo && plo) {
          const newMap: CloPloMapDto = {
            id: `map-${Date.now()}`,
            cloId: selectedCloId,
            ploId: selectedPloId,
            weight: weightNum,
            stage: stage || null,
            clo,
            plo,
          };
          setMaps((prev) => [...prev, newMap]);
          toast.create({ title: "Mapping created (dev)", type: "success" });
          setDialogOpen(false);
        }
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
    } else if (isDevMode) {
      // Dev mode: simulate delete locally
      setMaps((prev) => prev.filter((m) => m.id !== id));
      toast.create({ title: "Mapping deleted (dev)", type: "success" });
      setDeleteConfirmId(null);
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

  const weightCollection = createListCollection({
    items: weightItems,
    itemToValue: (item) => item.value.toString(),
    itemToString: (item) => item.label,
  });

  const stageCollection = createListCollection({
    items: [
      { value: "", label: "None" },
      { value: "i", label: "I - Introduction" },
      { value: "p", label: "P - Proficiency" },
      { value: "d", label: "D - Demonstration" },
    ],
    itemToValue: (item) => item.value,
    itemToString: (item) => item.label,
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
      <AlertDialog
        open={dialogOpen}
        onOpenChange={(details) => setDialogOpen(details.open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {editingMap ? "Edit Connection" : "Add Connection"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {editingMap
                ? "Update the weight and stage for this CLO-PLO connection."
                : "Select a CLO and PLO to connect."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogBody>
            <div className="space-y-4">
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
                        {Object.entries(closByCourse).map(
                          ([course, cloList]) => (
                            <SelectGroup key={course}>
                              <SelectGroupLabel>{course}</SelectGroupLabel>
                              {cloList.map((clo) => (
                                <SelectItem key={clo.id} item={clo}>
                                  {clo.code} - {clo.description}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ),
                        )}
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
                <Select
                  value={[weight]}
                  onValueChange={(details) =>
                    setWeight(details.value[0] ?? "1.0")
                  }
                  collection={weightCollection}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select weight" />
                  </SelectTrigger>
                  <SelectContent>
                    {weightItems.map((item) => (
                      <SelectItem key={item.value} item={item}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel>I-P-D Stage</FieldLabel>
                <FieldDescription>
                  Introduction, Proficiency, or Demonstration stage.
                </FieldDescription>
                <Select
                  value={[stage]}
                  onValueChange={(details) => setStage(details.value[0] ?? "")}
                  collection={stageCollection}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stageCollection.items.map((item) => (
                      <SelectItem key={item.value} item={item}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </AlertDialogBody>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave}>
              {editingMap ? "Save Changes" : "Create"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirmId !== null}
        onOpenChange={(details) => {
          if (!details.open) setDeleteConfirmId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this CLO-PLO connection? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
