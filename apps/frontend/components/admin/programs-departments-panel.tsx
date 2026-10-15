"use client";

import {
	type ColumnDef,
	type PaginationState,
	type SortingState,
	useTable,
} from "@tanstack/react-table";
import {
	BuildingIcon,
	FunnelXIcon,
	HashIcon,
	ListFilterIcon,
	TagIcon,
	TypeIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SelectDepartment } from "@/components/auth/select-department";
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
	type Filter,
	type FilterFieldConfig,
	Filters,
} from "@/components/reui/filters";
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
import { toast, toastError } from "@/components/ui/toast";
import { isDevMode } from "@/lib/dev-mode";
import type { AcademicDepartment } from "@/lib/store/atoms/academic";
import {
	type AcademicProgram,
	createDepartment,
	createProgram,
	listDepartments,
	listPrograms,
} from "@/server/actions/academic";

/**
 * System-admin reference-data panel: add the institution's departments
 * (colleges) and the programs under them. Programs require a department, so
 * the department list doubles as the program dialog's picker. Reads/writes go
 * through the `manageReferenceData` server actions (system_admin-gated).
 *
 * Both lists render as one filterable table (same pattern as
 * `CohortTrackingGrid`): a Type filter separates departments from programs, so
 * the two-column lists collapse into one grid.
 */

interface ReferenceRow {
	kind: "department" | "program";
	id: string;
	code: string;
	name: string;
	departmentCode: string;
}

function matchesFilter(row: ReferenceRow, filter: Filter): boolean {
	const value = row[filter.field as keyof ReferenceRow];
	if (typeof value !== "string") return true;
	const { operator, values } = filter;

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

function applyFilters(rows: ReferenceRow[], filters: Filter[]): ReferenceRow[] {
	if (filters.length === 0) return rows;
	return rows.filter((row) => filters.every((f) => matchesFilter(row, f)));
}

export function ProgramsDepartmentsPanel() {
	const [departments, setDepartments] = useState<AcademicDepartment[]>([]);
	const [programs, setPrograms] = useState<AcademicProgram[]>([]);
	const [loading, setLoading] = useState(true);

	const [departmentOpen, setDepartmentOpen] = useState(false);
	const [departmentCode, setDepartmentCode] = useState("");
	const [departmentName, setDepartmentName] = useState("");

	const [programOpen, setProgramOpen] = useState(false);
	const [programCode, setProgramCode] = useState("");
	const [programName, setProgramName] = useState("");
	const [programDepartmentId, setProgramDepartmentId] = useState("");

	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "code", desc: false },
	]);
	const [filters, setFilters] = useState<Filter[]>([]);

	const load = useCallback(async () => {
		setLoading(true);
		const [departmentResult, programResult] = await Promise.all([
			listDepartments(),
			listPrograms(),
		]);
		if (departmentResult.ok) {
			setDepartments(departmentResult.data);
		} else if (!isDevMode) {
			toastError({
				title: "Could not load departments",
				description: departmentResult.error,
				scope: "reference-data:departments",
			});
		}
		if (programResult.ok) {
			setPrograms(programResult.data);
		} else if (!isDevMode) {
			toastError({
				title: "Could not load programs",
				description: programResult.error,
				scope: "reference-data:programs",
			});
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const openDepartmentDialog = () => {
		setDepartmentCode("");
		setDepartmentName("");
		setDepartmentOpen(true);
	};

	const openProgramDialog = () => {
		setProgramCode("");
		setProgramName("");
		setProgramDepartmentId("");
		setProgramOpen(true);
	};

	async function handleCreateDepartment() {
		const code = departmentCode.trim();
		const name = departmentName.trim();
		if (!code || !name) {
			toast.create({ title: "Code and name are required", type: "error" });
			return;
		}

		const result = await createDepartment({ code, name });
		if (result.ok) {
			// NOTE: append the created row instead of re-listing, so it shows
			// without a refresh (and can't be lost to a stale read).
			setDepartments((prev) => [...prev, result.data]);
			toast.create({ title: "Department added", type: "success" });
			setDepartmentOpen(false);
		} else if (isDevMode) {
			setDepartments((prev) => [
				...prev,
				{ id: `dept-${Date.now()}`, code, name },
			]);
			toast.create({ title: "Department added (dev)", type: "success" });
			setDepartmentOpen(false);
		} else {
			toastError({
				title: "Could not add department",
				description: result.error,
				scope: "reference-data:department",
			});
		}
	}

	async function handleCreateProgram() {
		const code = programCode.trim();
		const name = programName.trim();
		if (!code || !name || !programDepartmentId) {
			toast.create({
				title: "Code, name and department are required",
				type: "error",
			});
			return;
		}

		const result = await createProgram({
			code,
			name,
			departmentId: programDepartmentId,
		});
		if (result.ok) {
			// NOTE: append the created row instead of re-listing, so it shows
			// without a refresh (and can't be lost to a stale read).
			setPrograms((prev) => [...prev, result.data]);
			toast.create({ title: "Program added", type: "success" });
			setProgramOpen(false);
		} else if (isDevMode) {
			setPrograms((prev) => [
				...prev,
				{
					id: `prog-${Date.now()}`,
					code,
					name,
					departmentId: programDepartmentId,
				},
			]);
			toast.create({ title: "Program added (dev)", type: "success" });
			setProgramOpen(false);
		} else {
			toastError({
				title: "Could not add program",
				description: result.error,
				scope: "reference-data:program",
			});
		}
	}

	const rows = useMemo<ReferenceRow[]>(() => {
		const departmentCodeFor = (id: string) =>
			departments.find((department) => department.id === id)?.code ?? "";

		return [
			...departments.map((department) => ({
				kind: "department" as const,
				id: department.id,
				code: department.code,
				name: department.name,
				departmentCode: "",
			})),
			...programs.map((program) => ({
				kind: "program" as const,
				id: program.id,
				code: program.code,
				name: program.name,
				departmentCode: departmentCodeFor(program.departmentId),
			})),
		];
	}, [departments, programs]);

	const filteredData = useMemo(
		() => applyFilters(rows, filters),
		[rows, filters],
	);

	const handleFiltersChange = useCallback((next: Filter[]) => {
		setFilters(next);
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, []);

	const fields: FilterFieldConfig[] = useMemo(() => {
		const departmentCodes = [...new Set(departments.map((d) => d.code))].sort();
		return [
			{
				group: "Reference data",
				fields: [
					{
						key: "kind",
						label: "Type",
						icon: <TagIcon />,
						type: "multiselect",
						className: "w-[160px]",
						defaultOperator: "is_any_of",
						options: [
							{ value: "department", label: "Department" },
							{ value: "program", label: "Program" },
						],
					},
					{
						key: "code",
						label: "Code",
						icon: <HashIcon />,
						type: "text",
						className: "w-[140px]",
						defaultOperator: "contains",
					},
					{
						key: "name",
						label: "Name",
						icon: <TypeIcon />,
						type: "text",
						className: "w-[200px]",
						defaultOperator: "contains",
					},
					{
						key: "departmentCode",
						label: "Department",
						icon: <BuildingIcon />,
						type: "multiselect",
						searchable: true,
						className: "w-[180px]",
						defaultOperator: "is_any_of",
						options: departmentCodes.map((code) => ({
							value: code,
							label: code,
						})),
					},
				],
			},
		];
	}, [departments]);

	const columns = useMemo<ColumnDef<DataGridFeatures, ReferenceRow>[]>(
		() => [
			{
				accessorKey: "kind",
				id: "kind",
				header: "Type",
				cell: ({ row }) => (
					<Badge
						variant={row.original.kind === "program" ? "secondary" : "outline"}
					>
						{row.original.kind === "program" ? "Program" : "Department"}
					</Badge>
				),
				size: 110,
				enableSorting: true,
				enableHiding: false,
			},
			{
				accessorKey: "code",
				id: "code",
				header: "Code",
				cell: ({ row }) => (
					<span className="text-foreground font-medium">
						{row.original.code}
					</span>
				),
				size: 110,
				enableSorting: true,
				enableHiding: false,
			},
			{
				accessorKey: "name",
				id: "name",
				header: "Name",
				cell: ({ row }) => (
					<span className="text-muted-foreground truncate">
						{row.original.name}
					</span>
				),
				size: 240,
				enableSorting: true,
				enableHiding: true,
			},
			{
				accessorKey: "departmentCode",
				id: "departmentCode",
				header: "Department",
				cell: ({ row }) =>
					row.original.departmentCode ? (
						<Badge variant="secondary">{row.original.departmentCode}</Badge>
					) : (
						<span className="text-muted-foreground text-xs">—</span>
					),
				size: 120,
				enableSorting: true,
				enableHiding: true,
			},
		],
		[],
	);

	const table = useTable({
		features: dataGridFeatures,
		columns,
		data: filteredData,
		pageCount: Math.ceil((filteredData?.length || 0) / pagination.pageSize),
		getRowId: (row: ReferenceRow) => row.id,
		state: {
			pagination,
			sorting,
		},
		onPaginationChange: setPagination,
		onSortingChange: setSorting,
	});

	return (
		<section className="bg-card rounded-xl border p-6 shadow-sm">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h3 className="text-base font-semibold">
						Programs &amp; departments
					</h3>
					<p className="text-muted-foreground text-xs">
						Departments group programs; every program belongs to one.
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						disabled={loading}
						onClick={openDepartmentDialog}
						type="button"
						variant="outline"
					>
						Add department
					</Button>
					<Button
						disabled={loading || departments.length === 0}
						onClick={openProgramDialog}
						type="button"
					>
						Add program
					</Button>
				</div>
			</div>

			{loading ? (
				<p className="text-muted-foreground mt-4 text-sm">Loading…</p>
			) : (
				<div className="mt-4 space-y-2.5">
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
						emptyMessage="No departments or programs yet — add one to get started."
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
			)}

			<AlertDialog
				open={departmentOpen}
				onOpenChange={(details) => setDepartmentOpen(details.open)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Add department</AlertDialogTitle>
						<AlertDialogDescription>
							Departments (colleges) group the programs under them. The code
							must be unique.
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogBody>
						<div className="space-y-4">
							<Field>
								<FieldLabel>Code</FieldLabel>
								<FieldDescription>
									Short unique code, e.g. CITE.
								</FieldDescription>
								<Input
									value={departmentCode}
									onChange={(event) => setDepartmentCode(event.target.value)}
									placeholder="CITE"
								/>
							</Field>

							<Field>
								<FieldLabel>Name</FieldLabel>
								<FieldDescription>The department's full name.</FieldDescription>
								<Input
									value={departmentName}
									onChange={(event) => setDepartmentName(event.target.value)}
									placeholder="College of Information Technology Education"
								/>
							</Field>
						</div>
					</AlertDialogBody>

					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => void handleCreateDepartment()}>
							Create
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={programOpen}
				onOpenChange={(details) => setProgramOpen(details.open)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Add program</AlertDialogTitle>
						<AlertDialogDescription>
							A program belongs to one department. The code must be unique.
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogBody>
						<div className="space-y-4">
							<Field>
								<FieldLabel>Department</FieldLabel>
								<SelectDepartment
									departments={departments}
									onValueChange={setProgramDepartmentId}
									value={programDepartmentId}
								/>
							</Field>

							<Field>
								<FieldLabel>Code</FieldLabel>
								<FieldDescription>
									Short unique code, e.g. BSIT.
								</FieldDescription>
								<Input
									value={programCode}
									onChange={(event) => setProgramCode(event.target.value)}
									placeholder="BSIT"
								/>
							</Field>

							<Field>
								<FieldLabel>Name</FieldLabel>
								<FieldDescription>The program's full name.</FieldDescription>
								<Input
									value={programName}
									onChange={(event) => setProgramName(event.target.value)}
									placeholder="Bachelor of Science in Information Technology"
								/>
							</Field>
						</div>
					</AlertDialogBody>

					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => void handleCreateProgram()}>
							Create
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}
