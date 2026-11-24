"use client";

import {
	type ColumnDef,
	type PaginationState,
	type SortingState,
	useTable,
} from "@tanstack/react-table";
import { useAtomValue } from "jotai";
import {
	CircleAlertIcon,
	CircleCheckIcon,
	FunnelXIcon,
	GraduationCapIcon,
	ListFilterIcon,
	TargetIcon,
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
import { cohortStudentsDataAtom } from "@/lib/store/atoms/attainments";
import { cn } from "@/lib/utils";

type YearKey = "Y1" | "Y2" | "Y3" | "Y4";

const YEAR_KEYS: YearKey[] = ["Y1", "Y2", "Y3", "Y4"];

const COHORT_COLORS: Record<YearKey, string> = {
	Y1: "bg-violet-500",
	Y2: "bg-blue-500",
	Y3: "bg-cyan-500",
	Y4: "bg-emerald-500",
};

/** One row per student, backed by `GET /rollup/cohort-tracking/students`. */
interface CohortStudentRow {
	studentId: string;
	studentName: string;
	studentNumber: string;
	yearLevel: number | null;
	cloScores: Record<string, number>;
	ploScores: Record<string, number>;
	status: "MET" | "NOT MET";
}

function cohortLabel(yearLevel: number | null): string {
	return yearLevel === null ? "—" : `Y${yearLevel}`;
}

function matchesFilter(student: CohortStudentRow, filter: Filter): boolean {
	const { field, operator, values } = filter;

	if (field === "cohort") {
		const value = cohortLabel(student.yearLevel);
		switch (operator) {
			case "is":
				return values.length === 0 || values.includes(value);
			case "is_not":
				return values.length === 0 || !values.includes(value);
			case "is_any_of":
				return values.length === 0 || values.includes(value);
			case "is_not_any_of":
				return values.length === 0 || !values.includes(value);
			default:
				return true;
		}
	}

	if (field === "status") {
		const match = (v: unknown) =>
			v === "met" ? "MET" === student.status : "NOT MET" === student.status;
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

	return true;
}

function applyFilters(
	data: CohortStudentRow[],
	filters: Filter[],
): CohortStudentRow[] {
	if (filters.length === 0) return data;
	return data.filter((student) =>
		filters.every((f) => matchesFilter(student, f)),
	);
}

function AttainmentCell({ score }: { score: number | undefined }) {
	if (score === undefined) {
		return <span className="text-muted-foreground">—</span>;
	}
	const met = score >= 70;
	return (
		<div className="flex flex-col items-center gap-0.5">
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
	const payload = useAtomValue(cohortStudentsDataAtom);
	const students = payload?.students ?? [];
	const cloCodes = payload?.cloCodes ?? [];
	const ploCodes = payload?.ploCodes ?? [];

	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "name", desc: false },
	]);
	const [filters, setFilters] = useState<Filter[]>([
		createFilter("cohort", "is_any_of", [...YEAR_KEYS]),
	]);

	const filteredData = useMemo(
		() => applyFilters(students, filters),
		[students, filters],
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
				],
			},
			{
				group: "Status",
				fields: [
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

	const columns = useMemo<ColumnDef<DataGridFeatures, CohortStudentRow>[]>(
		() => [
			{
				accessorKey: "studentName",
				id: "name",
				header: "Student",
				cell: ({ row }) => (
					<div className="space-y-px">
						<div className="text-foreground font-medium">
							{row.original.studentName}
						</div>
						<div className="text-muted-foreground font-mono text-xs">
							{row.original.studentNumber || "—"}
						</div>
					</div>
				),
				size: 220,
				enableSorting: true,
				enableHiding: false,
			},
			{
				accessorFn: (row) => row.yearLevel ?? 0,
				id: "cohort",
				header: "Cohort",
				cell: ({ row }) => {
					const label = cohortLabel(row.original.yearLevel);
					const year = row.original.yearLevel;
					return (
						<div className="flex items-center gap-2">
							{year !== null && (
								<div
									className={cn(
										"size-2.25 shrink-0 rounded-full",
										COHORT_COLORS[cohortLabel(year) as YearKey],
									)}
								/>
							)}
							<span className="text-foreground font-medium">{label}</span>
						</div>
					);
				},
				size: 90,
				enableSorting: true,
				enableHiding: false,
			},
			...cloCodes.map<ColumnDef<DataGridFeatures, CohortStudentRow>>(
				(code) => ({
					id: code,
					accessorFn: (row) => row.cloScores[code],
					header: code,
					cell: ({ row }) => (
						<AttainmentCell score={row.original.cloScores[code]} />
					),
					size: 130,
					enableSorting: true,
					enableHiding: true,
				}),
			),
			...ploCodes.map<ColumnDef<DataGridFeatures, CohortStudentRow>>(
				(code) => ({
					id: code,
					accessorFn: (row) => row.ploScores[code],
					header: code,
					cell: ({ row }) => (
						<AttainmentCell score={row.original.ploScores[code]} />
					),
					size: 130,
					enableSorting: true,
					enableHiding: true,
				}),
			),
			{
				accessorKey: "status",
				id: "status",
				header: "Status",
				cell: ({ row }) =>
					row.original.status === "MET" ? (
						<Badge variant="success-outline">MET</Badge>
					) : (
						<Badge variant="warning-outline">NOT MET</Badge>
					),
				size: 100,
				enableSorting: true,
				enableHiding: false,
			},
		],
		[cloCodes, ploCodes],
	);

	const table = useTable({
		features: dataGridFeatures,
		columns,
		data: filteredData,
		pageCount: Math.ceil((filteredData?.length || 0) / pagination.pageSize),
		getRowId: (row: CohortStudentRow) => row.studentId,
		state: {
			pagination,
			sorting,
		},
		onPaginationChange: setPagination,
		onSortingChange: setSorting,
	});

	if (!payload || students.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				No per-student attainment for this program yet — upload a class record
				first.
			</p>
		);
	}

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
