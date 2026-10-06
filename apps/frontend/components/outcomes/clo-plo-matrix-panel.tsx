"use client";

import { createListCollection } from "@ark-ui/react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
import { ProgramSelect } from "@/components/ui/program-select";
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
import { cn } from "@/lib/utils";
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

const WEIGHT_OPTIONS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

// NOTE: same I-P-D badge colors as clo-plo-map-panel — keep them in sync.
const STAGE_BADGE_CLASS: Record<string, string> = {
  i: "bg-warning/20 text-warning",
  p: "bg-info/20 text-info",
  d: "bg-success/20 text-success",
};

// NOTE: dev-mode fallback when the backend is unreachable (DEVELOPMENT=true).
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
];

const SAMPLE_PLOS: PloEntity[] = [
  { id: "plo-1", code: "PLO1", description: "Apply knowledge of computing" },
  { id: "plo-2", code: "PLO2", description: "Solve complex problems" },
  { id: "plo-3", code: "PLO3", description: "Design systems" },
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
];

interface CourseGroup {
  id: string;
  label: string;
  clos: CloEntity[];
}

interface WeightOption {
  value: number;
  label: string;
}

/**
 * CLO × PLO connection matrix: rows are CLOs grouped by course, columns are
 * the program's PLOs. Filled cells show weight + I-P-D stage (click to edit),
 * empty cells show "+" (click to connect). Coverage counts call out CLOs
 * that map to nothing and PLOs no CLO reaches.
 */
export function CloPloMatrixPanel() {
  const [programId, setProgramId] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [maps, setMaps] = useState<CloPloMapDto[]>([]);
  const [clos, setClos] = useState<CloEntity[]>([]);
  const [plos, setPlos] = useState<PloEntity[]>([]);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CloPloMapDto | null>(null);
  // Cell-clicked create locks the CLO/PLO pair; the toolbar button leaves both selectable.
  const [lockedPair, setLockedPair] = useState<{
    clo: CloEntity;
    plo: PloEntity;
  } | null>(null);
  const [selectedCloId, setSelectedCloId] = useState("");
  const [selectedPloId, setSelectedPloId] = useState("");
  const [weight, setWeight] = useState("1");
  const [stage, setStage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CloPloMapDto | null>(null);

  const fetchData = useCallback(async (selectedProgramId: string) => {
    if (!selectedProgramId) {
      setMaps([]);
      setClos([]);
      setPlos([]);
      return;
    }
    setLoading(true);
    const [mapsResult, entitiesResult] = await Promise.all([
      listCloPloMaps(selectedProgramId),
      listCloPloEntities(selectedProgramId),
    ]);

    if (mapsResult.ok) {
      setMaps(mapsResult.data);
    } else if (isDevMode) {
      setMaps(SAMPLE_MAPS);
    } else {
      toastError({
        title: "Failed to load connections",
        description: mapsResult.error,
        scope: "clo-plo-matrix:list",
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
        scope: "clo-plo-matrix:entities",
      });
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData(programId);
  }, [programId, fetchData]);

  // Group CLOs by course, preserving the entities order from the backend.
  const courses = useMemo(() => {
    const byId = new Map<string, CourseGroup>();
    for (const clo of clos) {
      let group = byId.get(clo.courseId);
      if (!group) {
        group = {
          id: clo.courseId,
          label: `${clo.courseCode} - ${clo.courseTitle}`,
          clos: [],
        };
        byId.set(clo.courseId, group);
      }
      group.clos.push(clo);
    }
    return [...byId.values()];
  }, [clos]);

  // Fast (cloId:ploId) → map lookup for cell rendering.
  const mapIndex = useMemo(() => {
    const index = new Map<string, CloPloMapDto>();
    for (const map of maps) index.set(`${map.cloId}:${map.ploId}`, map);
    return index;
  }, [maps]);

  const unmappedCloIds = useMemo(() => {
    const mapped = new Set(maps.map((map) => map.cloId));
    return new Set(
      clos.filter((clo) => !mapped.has(clo.id)).map((clo) => clo.id),
    );
  }, [clos, maps]);

  const uncoveredPloIds = useMemo(() => {
    const mapped = new Set(maps.map((map) => map.ploId));
    return new Set(
      plos.filter((plo) => !mapped.has(plo.id)).map((plo) => plo.id),
    );
  }, [plos, maps]);

  // NOTE: course filter is client-side so the PLO columns stay program-wide.
  const visibleCourses = courseFilter
    ? courses.filter((group) => group.id === courseFilter)
    : courses;

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

  // NOTE: itemToValue must use plain toString so state strings ("1", "0.8")
  // match collection values; labels stay one-decimal for display.
  const weightItems = useMemo<WeightOption[]>(() => {
    const items = WEIGHT_OPTIONS.map((w) => ({
      value: w,
      label: w.toFixed(1),
    }));
    // NOTE: add the exact stored weight when finer than the 0.1 steps, so
    // saving an untouched row never silently rounds it.
    if (editing && !WEIGHT_OPTIONS.includes(editing.weight)) {
      items.unshift({ value: editing.weight, label: String(editing.weight) });
    }
    return items;
  }, [editing]);

  const weightCollection = createListCollection({
    items: weightItems,
    itemToValue: (item) => String(item.value),
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

  const courseCollection = createListCollection({
    items: courses,
    itemToValue: (item) => item.id,
    itemToString: (item) => item.label,
  });

  const resetDialog = () => {
    setEditing(null);
    setLockedPair(null);
    setSelectedCloId("");
    setSelectedPloId("");
    setWeight("1");
    setStage("");
  };

  const openCreateFromToolbar = () => {
    resetDialog();
    setDialogOpen(true);
  };

  const openCreateFromCell = (clo: CloEntity, plo: PloEntity) => {
    resetDialog();
    setLockedPair({ clo, plo });
    setDialogOpen(true);
  };

  const openEdit = (map: CloPloMapDto) => {
    resetDialog();
    setEditing(map);
    setWeight(String(map.weight));
    setStage(map.stage ?? "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const weightNum = parseFloat(weight);
    if (Number.isNaN(weightNum) || weightNum < 0 || weightNum > 1) {
      toast.create({ title: "Weight must be between 0 and 1", type: "error" });
      return;
    }

    if (editing) {
      const result = await updateCloPloMap(editing.id, {
        weight: weightNum,
        stage: stage || undefined,
      });
      if (result.ok) {
        toast.create({ title: "Connection updated", type: "success" });
        setDialogOpen(false);
        fetchData(programId);
      } else if (isDevMode) {
        setMaps((prev) =>
          prev.map((map) =>
            map.id === editing.id
              ? { ...map, weight: weightNum, stage: stage || null }
              : map,
          ),
        );
        toast.create({ title: "Connection updated (dev)", type: "success" });
        setDialogOpen(false);
      } else {
        toastError({
          title: "Update failed",
          description: result.error,
          scope: "clo-plo-matrix:update",
        });
      }
      return;
    }

    const cloId = lockedPair?.clo.id ?? selectedCloId;
    const ploId = lockedPair?.plo.id ?? selectedPloId;
    if (!cloId || !ploId) {
      toast.create({
        title: "Please select a CLO and PLO",
        type: "error",
      });
      return;
    }

    const result = await createCloPloMap({
      cloId,
      ploId,
      weight: weightNum,
      stage: stage || undefined,
    });
    if (result.ok) {
      toast.create({ title: "Connection created", type: "success" });
      setDialogOpen(false);
      fetchData(programId);
    } else if (isDevMode) {
      const clo = lockedPair?.clo ?? clos.find((item) => item.id === cloId);
      const plo = lockedPair?.plo ?? plos.find((item) => item.id === ploId);
      if (clo && plo) {
        const newMap: CloPloMapDto = {
          id: `map-${Date.now()}`,
          cloId,
          ploId,
          weight: weightNum,
          stage: stage || null,
          clo,
          plo,
        };
        setMaps((prev) => [...prev, newMap]);
        toast.create({ title: "Connection created (dev)", type: "success" });
        setDialogOpen(false);
      }
    } else {
      toastError({
        title: "Create failed",
        description: result.error,
        scope: "clo-plo-matrix:create",
      });
    }
  };

  const handleDelete = async (mapId: string) => {
    const result = await deleteCloPloMap(mapId);
    if (result.ok) {
      toast.create({ title: "Connection deleted", type: "success" });
      setDeleteTarget(null);
      fetchData(programId);
    } else if (isDevMode) {
      setMaps((prev) => prev.filter((map) => map.id !== mapId));
      toast.create({ title: "Connection deleted (dev)", type: "success" });
      setDeleteTarget(null);
    } else {
      toastError({
        title: "Delete failed",
        description: result.error,
        scope: "clo-plo-matrix:delete",
      });
    }
  };

  const pairClo = editing ? editing.clo : lockedPair?.clo;
  const pairPlo = editing ? editing.plo : lockedPair?.plo;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-sm space-y-1">
            <Field>
              <FieldLabel>Program</FieldLabel>
              <FieldDescription>
                Pick a program to see its CLO-PLO connections.
              </FieldDescription>
              <ProgramSelect
                value={programId || undefined}
                onValueChange={(value) => {
                  setProgramId(value);
                  setCourseFilter("");
                }}
              />
            </Field>
          </div>
          {programId && courses.length > 0 && (
            <div className="w-full max-w-xs space-y-1">
              <Field>
                <FieldLabel>Course</FieldLabel>
                <FieldDescription>Optional row filter.</FieldDescription>
                <Select
                  value={courseFilter ? [courseFilter] : undefined}
                  onValueChange={(details) =>
                    setCourseFilter(details.value[0] ?? "")
                  }
                  collection={courseCollection}
                >
                  <SelectTrigger className="w-full" showClear>
                    <SelectValue placeholder="All courses" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((course) => (
                      <SelectItem key={course.id} item={course}>
                        {course.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}
        </div>
        <Button
          onClick={openCreateFromToolbar}
          disabled={!programId || plos.length === 0 || clos.length === 0}
        >
          + Add Connection
        </Button>
      </div>

      {!programId ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Select a program to see which PLO each CLO connects to.
        </div>
      ) : loading ? (
        <div className="py-4 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : plos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No PLOs yet. Create them in the PLOs tab first, then map them to CLOs
          here.
        </div>
      ) : clos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No CLOs yet. CLOs come from this program's courses — add them via
          class records / the Curriculum Map first.
        </div>
      ) : (
        <>
          {/* Coverage summary: gaps are the point of this screen. */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
              {maps.length} connection{maps.length === 1 ? "" : "s"}
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5",
                unmappedCloIds.size > 0
                  ? "border-warning/40 text-warning"
                  : "text-muted-foreground",
              )}
            >
              {unmappedCloIds.size} CLO
              {unmappedCloIds.size === 1 ? "" : "s"} not mapped
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5",
                uncoveredPloIds.size > 0
                  ? "border-warning/40 text-warning"
                  : "text-muted-foreground",
              )}
            >
              {uncoveredPloIds.size} PLO
              {uncoveredPloIds.size === 1 ? "" : "s"} uncovered
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 min-w-64 border-r bg-muted/50 px-3 py-2 font-medium"
                  >
                    Course / CLO
                  </th>
                  {plos.map((plo) => (
                    <th
                      key={plo.id}
                      scope="col"
                      title={plo.description}
                      className={cn(
                        "min-w-24 px-2 py-2 text-center font-medium",
                        uncoveredPloIds.has(plo.id) && "text-warning",
                      )}
                    >
                      <div>{plo.code}</div>
                      <div className="max-w-36 truncate text-xs font-normal text-muted-foreground/80">
                        {plo.description}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleCourses.map((course) => (
                  <Fragment key={course.id}>
                    <tr className="border-b bg-muted/40">
                      <td className="sticky left-0 z-10 border-r bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                        {course.label}
                      </td>
                      <td colSpan={plos.length} className="bg-muted/40" />
                    </tr>
                    {course.clos.map((clo) => (
                      <tr
                        key={clo.id}
                        className="border-b last:border-0 hover:bg-muted/30"
                      >
                        <td className="sticky left-0 z-10 border-r bg-background px-3 py-2">
                          <div className="font-medium">{clo.code}</div>
                          <div className="text-xs text-muted-foreground">
                            {clo.description}
                          </div>
                        </td>
                        {plos.map((plo) => {
                          const map = mapIndex.get(`${clo.id}:${plo.id}`);
                          return (
                            <td key={plo.id} className="px-1 py-1 text-center">
                              {map ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-full gap-1"
                                  onClick={() => openEdit(map)}
                                  aria-label={`Edit connection ${clo.code} to ${plo.code}`}
                                >
                                  <span className="font-medium tabular-nums">
                                    {map.weight.toFixed(1)}
                                  </span>
                                  {map.stage && (
                                    <span
                                      className={cn(
                                        "rounded px-1 text-[10px] font-semibold",
                                        STAGE_BADGE_CLASS[map.stage],
                                      )}
                                    >
                                      {map.stage.toUpperCase()}
                                    </span>
                                  )}
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-full text-muted-foreground/50 hover:text-foreground"
                                  onClick={() => openCreateFromCell(clo, plo)}
                                  aria-label={`Connect ${clo.code} to ${plo.code}`}
                                >
                                  +
                                </Button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Cell = weight (0.1–1.0) + I-P-D stage (I Introduction · P
            Proficiency · D Demonstration). Click a cell to edit, "+" to
            connect.
          </p>
        </>
      )}

      {/* Create/Edit Connection Dialog */}
      <AlertDialog
        open={dialogOpen}
        onOpenChange={(details) => setDialogOpen(details.open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {editing ? "Edit Connection" : "Add Connection"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {editing
                ? "Update the weight and stage for this CLO-PLO connection."
                : "Select a CLO and PLO to connect."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogBody>
            <div className="space-y-4">
              {pairClo && pairPlo ? (
                <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <div className="font-medium">{pairClo.code}</div>
                  <div className="text-xs text-muted-foreground">
                    {pairClo.description}
                  </div>
                  <div className="my-1 text-muted-foreground">↓</div>
                  <div className="font-medium">{pairPlo.code}</div>
                  <div className="text-xs text-muted-foreground">
                    {pairPlo.description}
                  </div>
                </div>
              ) : (
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
                        {courses.map((course) => (
                          <SelectGroup key={course.id}>
                            <SelectGroupLabel>{course.label}</SelectGroupLabel>
                            {course.clos.map((clo) => (
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
                <Select
                  value={[weight]}
                  onValueChange={(details) =>
                    setWeight(details.value[0] ?? "1")
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

              {editing && (
                <Button
                  variant="ghost"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => {
                    setDialogOpen(false);
                    setDeleteTarget(editing);
                  }}
                >
                  Delete Connection
                </Button>
              )}
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
        open={deleteTarget !== null}
        onOpenChange={(details) => {
          if (!details.open) setDeleteTarget(null);
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
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
