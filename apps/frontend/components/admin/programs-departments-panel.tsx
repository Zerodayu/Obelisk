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
	PencilIcon,
	Trash2Icon,
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
	deleteDepartment,
	deleteProgram,
	listDepartments,
	listPrograms,
	updateDepartment,
	updateProgram,
} from "@/server/actions/academic";

/**
 * System-admin reference-data panel: add the institution's departments
 * (colleges) and the programs under them. Programs require a department, so
 * the department list doubles as the program dialog's picker. Reads/writes go
 * through the `manageReferenceData` server actions (system_admin-gated).
 *
 * Departments and programs each render as their own filterable table (same
 * pattern as `CohortTrackingGrid`): the two kinds no longer share one grid.
 */

interface ReferenceRow {
	kind: "department" | "program";
	id: string;
	code: string;
	name: string;
	departmentCode: string;
	departmentId: string;
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

interface ReferenceTableProps {
	title: string;
	description: string;
	addLabel: string;
	onAdd: () => void;
	addDisabled?: boolean;
	rows: ReferenceRow[];
	emptyMessage: string;
	loading: boolean;
	/** Programs show the parent Department column and filter. */
	showDepartment?: boolean;
	departmentCodes?: string[];
	enableShortcut?: boolean;
	onEdit: (row: ReferenceRow) => void;
	onDelete: (row: ReferenceRow) => void;
}

function ReferenceTable({
	title,
	description,
	addLabel,
	onAdd,
	addDisabled = false,
	rows,
	emptyMessage,
	loading,
	showDepartment = false,
	departmentCodes = [],
	enableShortcut = false,
	onEdit,
	onDelete,
}: ReferenceTableProps) {
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "code", desc: false },
	]);
	const [filters, setFilters] = useState<Filter[]>([]);

	const filteredData = useMemo(
		() => applyFilters(rows, filters),
		[rows, filters],
	);

	const handleFiltersChange = useCallback((next: Filter[]) => {
		setFilters(next);
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, []);

	const fields = useMemo<FilterFieldConfig[]>(
		() => [
			{
				group: "Reference data",
				fields: [
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
					...(showDepartment
						? [
								{
									key: "departmentCode",
									label: "Department",
									icon: <BuildingIcon />,
									type: "multiselect" as const,
									searchable: true,
									className: "w-[180px]",
									defaultOperator: "is_any_of",
									options: departmentCodes.map((code) => ({
										value: code,
										label: code,
									})),
								},
							]
						: []),
				],
			},
		],
		[showDepartment, departmentCodes],
	);

	const columns = useMemo<ColumnDef<DataGridFeatures, ReferenceRow>[]>(() => {
		const cols: ColumnDef<DataGridFeatures, ReferenceRow>[] = [
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
		];
		if (showDepartment) {
			cols.push({
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
			});
		}
		cols.push({
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="flex justify-end gap-1">
					<Button
						aria-label={`Edit ${row.original.name}`}
						onClick={() => onEdit(row.original)}
						size="icon-sm"
						type="button"
						variant="ghost"
					>
						<PencilIcon />
					</Button>
					<Button
						aria-label={`Delete ${row.original.name}`}
						onClick={() => onDelete(row.original)}
						size="icon-sm"
						type="button"
						variant="ghost"
					>
						<Trash2Icon />
					</Button>
				</div>
			),
			size: 80,
			enableSorting: false,
			enableHiding: false,
		});
		return cols;
	}, [showDepartment, onEdit, onDelete]);

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
					<h3 className="text-base font-semibold">{title}</h3>
					<p className="text-muted-foreground text-xs">{description}</p>
				</div>
				<Button disabled={addDisabled} onClick={onAdd} type="button">
					{addLabel}
				</Button>
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
								enableShortcut={enableShortcut}
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
						emptyMessage={emptyMessage}
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
		</section>
	);
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

	// Edit/delete — one edit dialog serves both kinds (a program also picks a
	// department); delete target carries the kind + id for the confirm.
	const [editOpen, setEditOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<ReferenceRow | null>(null);
	const [editCode, setEditCode] = useState("");
	const [editName, setEditName] = useState("");
	const [editDepartmentId, setEditDepartmentId] = useState("");

	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<ReferenceRow | null>(null);

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

	function openEdit(row: ReferenceRow) {
		setEditTarget(row);
		setEditCode(row.code);
		setEditName(row.name);
		setEditDepartmentId(row.kind === "program" ? row.departmentId : "");
		setEditOpen(true);
	}

	async function handleUpdate() {
		if (!editTarget) return;
		const code = editCode.trim();
		const name = editName.trim();
		if (!code || !name) {
			toast.create({ title: "Code and name are required", type: "error" });
			return;
		}
		if (editTarget.kind === "program" && !editDepartmentId) {
			toast.create({ title: "Select a department", type: "error" });
			return;
		}

		const result =
			editTarget.kind === "department"
				? await updateDepartment(editTarget.id, { code, name })
				: await updateProgram(editTarget.id, {
						code,
						name,
						departmentId: editDepartmentId,
					});

		// NOTE: `isDevMode` mirrors the create handlers — in frontend-only dev
		// there is no backend to write, so the local row is edited anyway.
		if (!result.ok && !isDevMode) {
			toastError({
				title: "Could not save",
				description: result.error,
				scope: "reference-data:edit",
			});
			return;
		}
		if (editTarget.kind === "department") {
			setDepartments((prev) =>
				prev.map((d) => (d.id === editTarget.id ? { ...d, code, name } : d)),
			);
		} else {
			setPrograms((prev) =>
				prev.map((p) =>
					p.id === editTarget.id
						? { ...p, code, name, departmentId: editDepartmentId }
						: p,
				),
			);
		}
		toast.create({ title: "Saved", type: "success" });
		setEditOpen(false);
	}

	function openDelete(row: ReferenceRow) {
		setDeleteTarget(row);
		setDeleteOpen(true);
	}

	async function handleDelete() {
		if (!deleteTarget) return;
		const result =
			deleteTarget.kind === "department"
				? await deleteDepartment(deleteTarget.id)
				: await deleteProgram(deleteTarget.id);
		if (!result.ok && !isDevMode) {
			toastError({
				title: "Could not delete",
				description: result.error,
				scope: "reference-data:delete",
			});
			return;
		}
		if (deleteTarget.kind === "department") {
			setDepartments((prev) => prev.filter((d) => d.id !== deleteTarget.id));
		} else {
			setPrograms((prev) => prev.filter((p) => p.id !== deleteTarget.id));
		}
		toast.create({ title: "Deleted", type: "success" });
		setDeleteOpen(false);
	}

	const departmentRows = useMemo<ReferenceRow[]>(
		() =>
			departments.map((department) => ({
				kind: "department" as const,
				id: department.id,
				code: department.code,
				name: department.name,
				departmentCode: "",
				departmentId: "",
			})),
		[departments],
	);

	const departmentCodes = useMemo(
		() => [...new Set(departments.map((d) => d.code))].sort(),
		[departments],
	);

	const programRows = useMemo<ReferenceRow[]>(
		() =>
			programs.map((program) => {
				const department = departments.find(
					(d) => d.id === program.departmentId,
				);
				return {
					kind: "program" as const,
					id: program.id,
					code: program.code,
					name: program.name,
					departmentCode: department?.code ?? "",
					departmentId: program.departmentId,
				};
			}),
		[programs, departments],
	);

	return (
		<>
			<div className="space-y-6">
				<ReferenceTable
					title="Departments"
					description="Departments (colleges) group the programs under them."
					addLabel="Add department"
					onAdd={openDepartmentDialog}
					addDisabled={loading}
					rows={departmentRows}
					emptyMessage="No departments yet — add one to get started."
					loading={loading}
					enableShortcut
					onEdit={openEdit}
					onDelete={openDelete}
				/>
				<ReferenceTable
					title="Programs"
					description="Every program belongs to one department."
					addLabel="Add program"
					onAdd={openProgramDialog}
					addDisabled={loading || departments.length === 0}
					rows={programRows}
					emptyMessage="No programs yet — add one to get started."
					loading={loading}
					showDepartment
					departmentCodes={departmentCodes}
					onEdit={openEdit}
					onDelete={openDelete}
				/>
			</div>

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

			<AlertDialog
				open={editOpen}
				onOpenChange={(details) => setEditOpen(details.open)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{editTarget?.kind === "program"
								? "Edit program"
								: "Edit department"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							Rename the record. The code must stay unique.
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogBody>
						<div className="space-y-4">
							{editTarget?.kind === "program" && (
								<Field>
									<FieldLabel>Department</FieldLabel>
									<SelectDepartment
										departments={departments}
										onValueChange={setEditDepartmentId}
										value={editDepartmentId}
									/>
								</Field>
							)}

							<Field>
								<FieldLabel>Code</FieldLabel>
								<Input
									value={editCode}
									onChange={(event) => setEditCode(event.target.value)}
									placeholder="BSIT"
								/>
							</Field>

							<Field>
								<FieldLabel>Name</FieldLabel>
								<Input
									value={editName}
									onChange={(event) => setEditName(event.target.value)}
									placeholder="Name"
								/>
							</Field>
						</div>
					</AlertDialogBody>

					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => void handleUpdate()}>
							Save
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={deleteOpen}
				onOpenChange={(details) => setDeleteOpen(details.open)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Delete{" "}
							{deleteTarget?.kind === "program" ? "program" : "department"}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This cannot be undone. A{" "}
							{deleteTarget?.kind === "program" ? "program" : "department"} that
							is in use (has programs, users, courses, or students) cannot be
							deleted.
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => void handleDelete()}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
