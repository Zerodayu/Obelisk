"use client";

// This file keeps "use no memo": its own cell/header templates read state
// through builder calls on a stable row/column, which React Compiler cannot
// see. The primitive wraps its own such reads in TanStack's Subscribe; a
// consumer template has to opt out or subscribe itself.
"use no memo";

import {
  type ColumnDef,
  type PaginationState,
  type SortingState,
  useTable,
} from "@tanstack/react-table";
import { useAtomValue } from "jotai";
import { ChevronDownIcon, ChevronUpIcon, FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import {
  type UploadHistoryRecord,
  uploadsHistoryDataAtom,
  uploadsHistoryStateAtom,
} from "@/lib/store/atoms/ingest";

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function UploadHistoryTable() {
  const history = useAtomValue(uploadsHistoryDataAtom);
  const state = useAtomValue(uploadsHistoryStateAtom);

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 5,
  });
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);

  const columns = useMemo<ColumnDef<DataGridFeatures, UploadHistoryRecord>[]>(
    () => [
      {
        id: "expand",
        header: () => null,
        cell: ({ row }) =>
          row.getCanExpand() ? (
            <Button
              {...{
                className: "size-6 text-muted-foreground hover:bg-transparent",
                onClick: row.getToggleExpandedHandler(),
                mode: "icon",
                variant: "ghost",
              }}
            >
              {row.getIsExpanded() ? (
                <ChevronUpIcon aria-hidden="true" />
              ) : (
                <ChevronDownIcon aria-hidden="true" />
              )}
            </Button>
          ) : null,
        size: 25,
        meta: {
          expandedContent: (row: UploadHistoryRecord) => {
            if (row.status === "failed") {
              return (
                <div className="text-destructive-foreground ms-12 py-3 text-sm">
                  {row.error ?? "Upload failed."}
                </div>
              );
            }
            const failures = row.summary?.cloMatchFailures ?? [];
            if (failures.length > 0) {
              return (
                <div className="text-muted-foreground ms-12 py-3 text-sm">
                  {failures.length} CLO match{" "}
                  {failures.length === 1 ? "failure" : "failures"}:{" "}
                  {failures
                    .map(
                      (failure) =>
                        `"${failure.studentName}" → ${failure.cloCode}`,
                    )
                    .join(", ")}
                </div>
              );
            }
            return null;
          },
        },
      },
      {
        accessorKey: "filename",
        id: "filename",
        header: "File name",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <FileSpreadsheet
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="text-foreground font-medium">
              {row.original.filename}
            </span>
          </div>
        ),
        size: 200,
        enableSorting: true,
        enableHiding: false,
      },
      {
        id: "course",
        header: "Course / Section",
        cell: ({ row }) => {
          const classSection = row.original.classSection;
          if (!classSection) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <div className="space-y-0.5">
              <div className="text-foreground font-medium">
                {classSection.course.code} · Section {classSection.sectionCode}
              </div>
              <div className="text-muted-foreground text-xs">
                {classSection.course.title} — {classSection.term.schoolYear}{" "}
                {classSection.term.semester}
              </div>
            </div>
          );
        },
        size: 240,
      },
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: "Uploaded at",
        cell: ({ getValue }) => formatDate(getValue() as string),
        size: 170,
        enableSorting: true,
      },
      {
        id: "students",
        header: "Students",
        cell: ({ row }) => row.original.summary?.studentsProcessed ?? "—",
        size: 100,
      },
      {
        id: "cloAttainments",
        header: "CLO rows",
        cell: ({ row }) => row.original.summary?.cloAttainmentsCreated ?? "—",
        size: 100,
      },
      {
        id: "atRisk",
        header: "At-risk",
        cell: ({ row }) => row.original.summary?.atRiskFlagsCreated ?? "—",
        size: 90,
      },
      {
        accessorKey: "status",
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          switch (row.original.status) {
            case "completed":
              return <Badge variant="success-outline">Completed</Badge>;
            case "failed":
              return <Badge variant="destructive-outline">Failed</Badge>;
            default:
              return <Badge variant="info-outline">Queued</Badge>;
          }
        },
        size: 110,
      },
    ],
    [],
  );

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: history,
    pageCount: Math.ceil((history?.length || 0) / pagination.pageSize),
    getRowId: (row: UploadHistoryRecord) => row.id,
    getRowCanExpand: (row) =>
      row.original.status === "failed" ||
      (row.original.summary?.cloMatchFailures.length ?? 0) > 0,
    state: {
      pagination,
      sorting,
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
  });

  return (
    <DataGrid
      table={table}
      recordCount={history?.length || 0}
      isLoading={state.status === "loading"}
      tableLayout={{ headerBackground: false }}
      emptyMessage="No class-record uploads yet. Upload a sheet above to see your history."
    >
      <div className="w-full space-y-2.5">
        <DataGridContainer>
          <DataGridScrollArea>
            <DataGridTable />
          </DataGridScrollArea>
        </DataGridContainer>
        <DataGridPagination />
      </div>
    </DataGrid>
  );
}
