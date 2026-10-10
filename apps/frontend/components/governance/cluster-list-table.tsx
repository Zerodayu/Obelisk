"use client";

// NOTE: this file keeps "use no memo" — same reason as upload-history-table.tsx:
// its cell templates read row/column state through builder calls the React
// Compiler cannot see, so the primitive wraps its own reads.
"use no memo";

import {
	type ColumnDef,
	type PaginationState,
	type SortingState,
	useTable,
} from "@tanstack/react-table";
import { useAtomValue } from "jotai";
import Link from "next/link";
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
import {
	clustersDataAtom,
	type ClusterListRecord,
} from "@/lib/store/atoms/governance";

const STATUS_LABELS: Record<string, string> = {
	open: "Open",
	compiling: "Compiling",
	archived: "Archived",
};

const STATUS_VARIANTS: Record<
	string,
	"secondary" | "default" | "success" | "destructive" | "warning"
> = {
	open: "secondary",
	compiling: "warning",
	archived: "success",
};

function formatDate(value: string | null): string {
	if (!value) return "—";
	return new Date(value).toLocaleDateString();
}

/**
 * `/archives` — the graduation-cluster list.
 *
 * A cluster with no `compiledAt` has not been compiled yet, so its
 * `studentCount` still reflects the live rows a compile will later purge —
 * which is why an `open` row can show a count while an `archived` one shows 0.
 */
export function ClusterListTable() {
	const clusters = useAtomValue(clustersDataAtom);

	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "graduationTerm", desc: true },
	]);

	const columns = useMemo<ColumnDef<DataGridFeatures, ClusterListRecord>[]>(
		() => [
			{
				accessorKey: "label",
				header: "Cluster",
				cell: ({ row }) => (
					<Link
						className="font-medium hover:underline"
						href={`/archives/${row.original.id}`}
					>
						{row.original.label}
					</Link>
				),
			},
			{
				accessorFn: (row) => row.graduationTerm.schoolYear,
				id: "graduationTerm",
				header: "Graduation term",
				cell: ({ row }) =>
					`${row.original.graduationTerm.schoolYear} ${row.original.graduationTerm.semester}`,
			},
			{
				accessorFn: (row) => row.program.code,
				id: "program",
				header: "Program",
				cell: ({ row }) => row.original.program.code,
			},
			{
				accessorKey: "status",
				header: "Status",
				cell: ({ row }) => (
					<Badge variant={STATUS_VARIANTS[row.original.status] ?? "secondary"}>
						{STATUS_LABELS[row.original.status] ?? row.original.status}
					</Badge>
				),
			},
			{
				accessorKey: "studentCount",
				header: "Students",
				cell: ({ row }) =>
					row.original.status === "archived"
						? `${row.original.studentCount} live`
						: row.original.studentCount,
			},
			{
				accessorKey: "confirmedAt",
				header: "Confirmed",
				cell: ({ row }) => formatDate(row.original.confirmedAt),
			},
			{
				accessorKey: "archivedAt",
				header: "Archived",
				cell: ({ row }) => formatDate(row.original.archivedAt),
			},
		],
		[],
	);

	const table = useTable({
		features: dataGridFeatures,
		columns,
		data: clusters,
		pageCount: Math.ceil(clusters.length / pagination.pageSize),
		getRowId: (row: ClusterListRecord) => row.id,
		state: { pagination, sorting },
		onPaginationChange: setPagination,
		onSortingChange: setSorting,
	});

	return (
		<DataGrid
			table={table}
			recordCount={clusters.length}
			tableLayout={{ headerBackground: false }}
			emptyMessage="No graduation clusters yet. A cluster is opened when a program's cohort finishes in a term."
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
