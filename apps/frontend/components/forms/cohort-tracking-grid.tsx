"use client";

import {
  type ColumnDef,
  type PaginationState,
  type SortingState,
  useTable,
} from "@tanstack/react-table";
import Avatar from "boring-avatars";
import {
  CalendarClockIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  FunnelXIcon,
  GraduationCapIcon,
  ListFilterIcon,
  TargetIcon,
  UsersIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/reui/badge";
import {
  DataGrid,
  DataGridContainer,
  type DataGridFeatures,
  dataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import {
  createFilter,
  type Filter,
  type FilterFieldConfig,
  Filters,
} from "@/components/reui/filters";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type YearKey = "Y1" | "Y2" | "Y3" | "Y4";

const YEAR_KEYS: YearKey[] = ["Y1", "Y2", "Y3", "Y4"];

// NOTE: demo column set — one column per CLO/PLO code, matching the seeded
// workbook CLOs (CLO1–CLO5) and the first five PLOs. Cohort stays a row/filter.
const CLO_KEYS = ["CLO1", "CLO2", "CLO3", "CLO4", "CLO5"] as const;
const PLO_KEYS = ["PLO1", "PLO2", "PLO3", "PLO4", "PLO5"] as const;

type CloKey = (typeof CLO_KEYS)[number];
type PloKey = (typeof PLO_KEYS)[number];
type CodeKey = CloKey | PloKey;

interface CohortStudent {
  id: string;
  name: string;
  studentId: string;
  program: string;
  cohort: YearKey;
  term: string;
  cloScores: Record<CloKey, number>;
  ploScores: Record<PloKey, number>;
  status: "met" | "not-met";
}

const COHORT_COLORS: Record<YearKey, string> = {
  Y1: "bg-violet-500",
  Y2: "bg-blue-500",
  Y3: "bg-cyan-500",
  Y4: "bg-emerald-500",
};

const PROGRAMS = ["BSIT", "BSCS", "BSCpE", "BSCE"];
const TERMS = ["2023-1S", "2023-2S", "2024-1S", "2024-2S"];

const STUDENT_NAMES = [
  "Alyza Santos",
  "Miguel Dela Cruz",
  "Gabrielle Reyes",
  "Joshua Ramos",
  "Sofia Mendoza",
  "Rafael Bautista",
  "Isabella Aquino",
  "Lorenzo Garcia",
  "Kassandra Lim",
  "Marco Antonio",
  "Julia Navarro",
  "Nathaniel Cruz",
  "Camille Domingo",
  "Adrian Villanueva",
  "Bea Soriano",
  "Christian Pascual",
  "Nica Fernandez",
  "Julian Castillo",
  "Trisha Aguilar",
  "Ethan Morales",
];

// Composite score per cohort-term, kept consistent with the `CohortTrendDatum`
// series the chart above renders — students vary around the mean so the MET/NOT
// MET badges (≥70% floor, server-derived in prod) spread.
const COHORT_MEANS: Record<YearKey, Record<string, number>> = {
  Y1: { "2023-1S": 74.0, "2023-2S": 76.5, "2024-1S": 78.2, "2024-2S": 80.1 },
  Y2: { "2023-1S": 75.8, "2023-2S": 78.0, "2024-1S": 79.4, "2024-2S": 81.5 },
  Y3: { "2023-1S": 77.3, "2023-2S": 79.1, "2024-1S": 82.0, "2024-2S": 83.4 },
  Y4: { "2023-1S": 79.9, "2023-2S": 81.3, "2024-1S": 84.6, "2024-2S": 85.8 },
};

// NOTE: demo-only per-code offsets around the cohort mean — kept small enough
// that most cells clear the 70% floor but a few dip under it (NOT MET).
const CODE_OFFSETS: Record<CodeKey, number> = {
  CLO1: 3.5,
  CLO2: -5.5,
  CLO3: 1.2,
  CLO4: -2.4,
  CLO5: 4.8,
  PLO1: 2.1,
  PLO2: -4.3,
  PLO3: 0.7,
  PLO4: -1.8,
  PLO5: 3.3,
};

function scoreFor(code: CodeKey, mean: number, index: number): number {
  return Math.round(mean + CODE_OFFSETS[code] + ((index % 5) - 2) * 3.7);
}

function buildDemoData(): CohortStudent[] {
  return STUDENT_NAMES.map((name, index) => {
    const cohort = YEAR_KEYS[index % YEAR_KEYS.length];
    const term = TERMS[index % TERMS.length];
    const mean = COHORT_MEANS[cohort][term] ?? COHORT_MEANS[cohort]["2023-1S"];

    const cloScores = Object.fromEntries(
      CLO_KEYS.map((code) => [code, scoreFor(code, mean, index)]),
    ) as Record<CloKey, number>;
    const ploScores = Object.fromEntries(
      PLO_KEYS.map((code) => [code, scoreFor(code, mean, index + 2)]),
    ) as Record<PloKey, number>;

    const all = [...Object.values(cloScores), ...Object.values(ploScores)];
    const notMet = all.some((score) => score < 70);

    return {
      id: String(index + 1),
      name,
      studentId: `2023-${(1000 + index * 13).toString()}`,
      program: PROGRAMS[index % PROGRAMS.length],
      cohort,
      term,
      cloScores,
      ploScores,
      status: notMet ? "not-met" : "met",
    };
  });
}

const demoData = buildDemoData();

function matchesFilter(student: CohortStudent, filter: Filter): boolean {
  const { field, operator, values } = filter;
  const value = student[field as keyof CohortStudent];

  if (field === "status") {
    const match = (v: unknown) =>
      v === "met" ? "met" === value : "not-met" === value;
    switch (operator) {
      case "is":
        return values.length === 0 || match(values[0]);
      case "is_not":
        return values.length === 0 || !match(values[0]);
      case "is_any_of":
        return values.some(match);
      case "is_not_any_of":
        return !values.some(match);
      default:
        return true;
    }
  }

  if (typeof value === "string") {
    switch (operator) {
      case "is":
        return values.length === 0 || values.includes(value);
      case "is_not":
        return values.length === 0 || !values.includes(value);
      case "is_any_of":
        return values.length === 0 || values.includes(value);
      case "is_not_any_of":
        return values.length === 0 || !values.includes(value);
      case "contains":
        return values.some((v) =>
          value.toLowerCase().includes(String(v).toLowerCase()),
        );
      default:
        return true;
    }
  }

  return true;
}

function applyFilters(
  data: CohortStudent[],
  filters: Filter[],
): CohortStudent[] {
  if (filters.length === 0) return data;
  return data.filter((student) =>
    filters.every((f) => matchesFilter(student, f)),
  );
}

function AttainmentCell({ score }: { score: number }) {
  const met = score >= 70;
  return (
    <div className="flex items-center gap-2">
      <Badge variant={met ? "success-outline" : "warning-outline"}>
        {met ? "MET" : "NOT MET"}
      </Badge>
      <span className="text-muted-foreground font-mono text-xs tabular-nums">
        {score.toFixed(1)}%
      </span>
    </div>
  );
}

export function CohortTrackingGrid() {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([
    { id: "cohort", desc: false },
  ]);
  const [filters, setFilters] = useState<Filter[]>([
    createFilter("cohort", "is_any_of", ["Y1", "Y2", "Y3", "Y4"]),
  ]);

  const filteredData = useMemo(
    () => applyFilters(demoData, filters),
    [filters],
  );

  const handleFiltersChange = useCallback((next: Filter[]) => {
    setFilters(next);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const fields: FilterFieldConfig[] = useMemo(
    () => [
      {
        group: "Cohort",
        fields: [
          {
            key: "cohort",
            label: "Cohort",
            icon: <GraduationCapIcon />,
            type: "multiselect",
            className: "w-[180px]",
            defaultOperator: "is_any_of",
            options: YEAR_KEYS.map((year) => ({
              value: year,
              label: year,
              icon: (
                <div
                  className={cn(
                    "size-2.25 shrink-0 rounded-full",
                    COHORT_COLORS[year],
                  )}
                />
              ),
            })),
          },
          {
            key: "term",
            label: "Term",
            icon: <CalendarClockIcon />,
            type: "select",
            searchable: false,
            className: "w-[180px]",
            defaultOperator: "is",
            options: TERMS.map((term) => ({ value: term, label: term })),
          },
        ],
      },
      {
        group: "Student",
        fields: [
          {
            key: "program",
            label: "Program",
            icon: <UsersIcon />,
            type: "select",
            searchable: false,
            className: "w-[180px]",
            defaultOperator: "is",
            options: PROGRAMS.map((program) => ({
              value: program,
              label: program,
            })),
          },
          {
            key: "status",
            label: "Attainment status",
            icon: <TargetIcon />,
            type: "multiselect",
            className: "w-[200px]",
            defaultOperator: "is_any_of",
            options: [
              {
                value: "met",
                label: "MET",
                icon: <CircleCheckIcon className="stroke-green-500" />,
              },
              {
                value: "not-met",
                label: "NOT MET",
                icon: <CircleAlertIcon className="stroke-yellow-500" />,
              },
            ],
          },
        ],
      },
    ],
    [],
  );

  const columns = useMemo<ColumnDef<DataGridFeatures, CohortStudent>[]>(
    () => [
      {
        accessorKey: "name",
        id: "name",
        header: "Student",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar name={row.original.name} variant="beam" size={32} />
            <div className="space-y-px">
              <div className="text-foreground font-medium">
                {row.original.name}
              </div>
              <div className="text-muted-foreground font-mono text-xs">
                {row.original.studentId}
              </div>
            </div>
          </div>
        ),
        size: 240,
        enableSorting: true,
        enableHiding: false,
      },
      {
        accessorKey: "cohort",
        id: "cohort",
        header: "Cohort",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "size-2.25 shrink-0 rounded-full",
                COHORT_COLORS[row.original.cohort],
              )}
            />
            <span className="text-foreground font-medium">
              {row.original.cohort}
            </span>
          </div>
        ),
        size: 90,
        enableSorting: true,
        enableHiding: false,
      },
      {
        accessorKey: "program",
        id: "program",
        header: "Program",
        cell: ({ row }) => (
          <Badge variant="secondary">{row.original.program}</Badge>
        ),
        size: 110,
        enableSorting: true,
        enableHiding: false,
      },
      // NOTE: one column per CLO/PLO code replaces the old Y1–Y4 year columns;
      // the cohort stays on the row + filter.
      ...CLO_KEYS.map<ColumnDef<DataGridFeatures, CohortStudent>>((code) => ({
        accessorKey: code,
        id: code,
        header: code,
        cell: ({ row }) => (
          <AttainmentCell score={row.original.cloScores[code]} />
        ),
        size: 130,
        enableSorting: true,
        enableHiding: true,
      })),
      ...PLO_KEYS.map<ColumnDef<DataGridFeatures, CohortStudent>>((code) => ({
        accessorKey: code,
        id: code,
        header: code,
        cell: ({ row }) => (
          <AttainmentCell score={row.original.ploScores[code]} />
        ),
        size: 130,
        enableSorting: true,
        enableHiding: true,
      })),
      {
        accessorKey: "status",
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const met = row.original.status === "met";
          return met ? (
            <Badge variant="success-outline">MET</Badge>
          ) : (
            <Badge variant="warning-outline">NOT MET</Badge>
          );
        },
        size: 100,
        enableSorting: true,
        enableHiding: false,
      },
    ],
    [],
  );

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: filteredData,
    pageCount: Math.ceil((filteredData?.length || 0) / pagination.pageSize),
    getRowId: (row: CohortStudent) => row.id,
    state: {
      pagination,
      sorting,
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
  });

  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2.5">
        <div className="flex-1">
          <Filters
            filters={filters}
            fields={fields}
            onChange={handleFiltersChange}
            shortcutKey="f"
            shortcutLabel="F"
            enableShortcut={true}
            trigger={
              <Button variant="outline">
                <ListFilterIcon />
                Add Filter
              </Button>
            }
          />
        </div>

        {filters.length > 0 && (
          <Button variant="outline" onClick={() => handleFiltersChange([])}>
            <FunnelXIcon />
            Clear
          </Button>
        )}
      </div>

      <DataGrid
        table={table}
        recordCount={filteredData?.length || 0}
        tableLayout={{ headerSticky: true }}
      >
        <div className="w-full space-y-2.5">
          <DataGridContainer>
            <DataGridScrollArea className="h-96">
              <DataGridTable />
            </DataGridScrollArea>
          </DataGridContainer>
          <DataGridPagination />
        </div>
      </DataGrid>
    </div>
  );
}
