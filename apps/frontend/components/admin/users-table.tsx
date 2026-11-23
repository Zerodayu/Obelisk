"use client";

import {
	type ColumnDef,
	type PaginationState,
	type SortingState,
	useTable,
} from "@tanstack/react-table";
import Avatar from "boring-avatars";
import { useAtomValue, useSetAtom } from "jotai";
import {
	ActivityIcon,
	FunnelXIcon,
	GraduationCapIcon,
	ListFilterIcon,
	PencilIcon,
	RefreshCwIcon,
	ShieldCheckIcon,
	Trash2Icon,
	UserIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { SelectDepartment } from "@/components/auth/select-department";
import { SelectProgram } from "@/components/auth/select-program";
import { SelectRole } from "@/components/auth/select-role";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import {
	ALL_ROLES,
	roleNeedsDepartment,
	roleNeedsProgram,
	ROLE_LABELS,
	type UserRole,
} from "@/lib/roles";
import type {
	AcademicDepartment,
	AcademicProgram,
} from "@/lib/store/atoms/academic";
import {
	platformUsersDataAtom,
	platformUsersStateAtom,
	type PlatformUserRecord,
	refreshPlatformUsersAtom,
} from "@/lib/store/atoms/governance";
import { listDepartments, listPrograms } from "@/server/actions/academic";
import { createUser, deleteUser, updateUser } from "@/server/actions/auth";

const ROLE_OPTIONS = Object.entries(ROLE_LABELS) as [UserRole, string][];

const REQUEST_STATUS_VARIANTS: Record<
	PlatformUserRecord["roleRequestStatus"],
	"success-outline" | "warning-outline" | "destructive" | "secondary"
> = {
	none: "secondary",
	pending: "warning-outline",
	approved: "success-outline",
	denied: "destructive",
};

/** Flattened row — filters address plain strings, like the cohort matcher. */
interface UserRow extends PlatformUserRecord {
	roleLabel: string;
	statusLabel: "active" | "inactive";
	programLabel: string;
	departmentLabel: string;
}

function matchesFilter(row: UserRow, filter: Filter): boolean {
	const value = row[filter.field as keyof UserRow];
	if (typeof value !== "string") return true;
	const { operator, values } = filter;

	switch (operator) {
		case "is":
			return values.length === 0 || values.includes(value);
		case "is_not":
			return values.length === 0 || !values.includes(value);
		case "is_any_of":
			return values.length === 0 || values.some((v) => v === value);
		case "is_not_any_of":
			return values.length === 0 || !values.some((v) => v === value);
		case "contains":
			return (
				values.length === 0 ||
				values.some((v) =>
					value.toLowerCase().includes(String(v).toLowerCase()),
				)
			);
		default:
			return true;
	}
}

function applyFilters(rows: UserRow[], filters: Filter[]): UserRow[] {
	if (filters.length === 0) return rows;
	return rows.filter((row) => filters.every((f) => matchesFilter(row, f)));
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort();
}

/**
 * System-admin users table — the cohort-tracking grid pattern (DataGrid +
 * client-side Filters/sort/pagination) over `GET /auth/users`.
 *
 * Read-only: role-request decisions stay in `RoleRequestsPanel`. The endpoint
 * is admin-gated, so a non-admin caller's fetch 403s and the table shows its
 * empty state. The whole user list is fetched then paged client-side.
 */
export function UsersTable() {
	const users = useAtomValue(platformUsersDataAtom);
	const state = useAtomValue(platformUsersStateAtom);
	const refresh = useSetAtom(refreshPlatformUsersAtom);

	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "createdAt", desc: true },
	]);
	const [filters, setFilters] = useState<Filter[]>([]);

	// Add-user dialog — reference data (programs/departments) loads on open.
	const [userOpen, setUserOpen] = useState(false);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("password123");
	const [role, setRole] = useState<string>();
	const [programId, setProgramId] = useState<string>();
	const [departmentId, setDepartmentId] = useState<string>();
	const [programs, setPrograms] = useState<AcademicProgram[]>([]);
	const [departments, setDepartments] = useState<AcademicDepartment[]>([]);
	const [submitting, setSubmitting] = useState(false);

	// Edit/delete dialogs — edit reuses the add-user field set plus an active toggle.
	const [editOpen, setEditOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<PlatformUserRecord | null>(null);
	const [editName, setEditName] = useState("");
	const [editEmail, setEditEmail] = useState("");
	const [editRole, setEditRole] = useState<string>();
	const [editProgramId, setEditProgramId] = useState<string>();
	const [editDepartmentId, setEditDepartmentId] = useState<string>();
	const [editActive, setEditActive] = useState(true);
	const [editSubmitting, setEditSubmitting] = useState(false);

	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<PlatformUserRecord | null>(
		null,
	);

	async function openUserDialog() {
		setName("");
		setEmail("");
		setPassword("password123");
		setRole(undefined);
		setProgramId(undefined);
		setDepartmentId(undefined);
		setUserOpen(true);
		const [programsResult, departmentsResult] = await Promise.all([
			listPrograms(),
			listDepartments(),
		]);
		if (programsResult.ok) setPrograms(programsResult.data);
		if (departmentsResult.ok) setDepartments(departmentsResult.data);
	}

	async function handleCreateUser() {
		const trimmedName = name.trim();
		const trimmedEmail = email.trim();
		if (!trimmedName || !trimmedEmail || !role) {
			toast.create({
				title: "Name, email and role are required",
				type: "error",
			});
			return;
		}
		if (roleNeedsProgram(role) && !programId) {
			toast.create({ title: "Select the account's program", type: "error" });
			return;
		}
		if (roleNeedsDepartment(role) && !departmentId) {
			toast.create({ title: "Select the account's department", type: "error" });
			return;
		}

		setSubmitting(true);
		const result = await createUser({
			name: trimmedName,
			email: trimmedEmail,
			password,
			role,
			programId,
			departmentId,
		});
		if (result.ok) {
			toast.create({ title: "User account created", type: "success" });
			refresh();
			setUserOpen(false);
		} else {
			toastError({
				title: "Could not create user",
				description: result.error,
				scope: "admin-users:create",
			});
		}
		setSubmitting(false);
	}

	async function openEditDialog(user: PlatformUserRecord) {
		setEditTarget(user);
		setEditName(user.name);
		setEditEmail(user.email);
		setEditRole(user.role);
		setEditProgramId(user.program?.id);
		setEditDepartmentId(user.department?.id);
		setEditActive(user.isActive);
		setEditOpen(true);
		const [programsResult, departmentsResult] = await Promise.all([
			listPrograms(),
			listDepartments(),
		]);
		if (programsResult.ok) setPrograms(programsResult.data);
		if (departmentsResult.ok) setDepartments(departmentsResult.data);
	}

	async function handleUpdateUser() {
		if (!editTarget) return;
		const trimmedName = editName.trim();
		const trimmedEmail = editEmail.trim();
		if (!trimmedName || !trimmedEmail || !editRole) {
			toast.create({
				title: "Name, email and role are required",
				type: "error",
			});
			return;
		}
		if (roleNeedsProgram(editRole) && !editProgramId) {
			toast.create({ title: "Select the account's program", type: "error" });
			return;
		}
		if (roleNeedsDepartment(editRole) && !editDepartmentId) {
			toast.create({ title: "Select the account's department", type: "error" });
			return;
		}

		setEditSubmitting(true);
		const result = await updateUser(editTarget.id, {
			name: trimmedName,
			email: trimmedEmail,
			role: editRole,
			isActive: editActive,
			programId: editProgramId,
			departmentId: editDepartmentId,
		});
		if (result.ok) {
			toast.create({ title: "Account updated", type: "success" });
			refresh();
			setEditOpen(false);
		} else {
			toastError({
				title: "Could not update user",
				description: result.error,
				scope: "admin-users:update",
			});
		}
		setEditSubmitting(false);
	}

	function openDeleteDialog(user: PlatformUserRecord) {
		setDeleteTarget(user);
		setDeleteOpen(true);
	}

	async function handleDeleteUser() {
		if (!deleteTarget) return;
		const result = await deleteUser(deleteTarget.id);
		if (result.ok) {
			toast.create({ title: "Account deleted", type: "success" });
			refresh();
			setDeleteOpen(false);
		} else {
			toastError({
				title: "Could not delete user",
				description: result.error,
				scope: "admin-users:delete",
			});
		}
	}

	const rows = useMemo<UserRow[]>(
		() =>
			users.map((user) => ({
				...user,
				roleLabel: ROLE_LABELS[user.role] ?? user.role,
				statusLabel: user.isActive ? "active" : "inactive",
				programLabel: user.program?.code ?? "—",
				departmentLabel: user.department?.name ?? "—",
			})),
		[users],
	);

	const filteredData = useMemo(
		() => applyFilters(rows, filters),
		[rows, filters],
	);

	const handleFiltersChange = useCallback((next: Filter[]) => {
		setFilters(next);
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, []);

	const fields: FilterFieldConfig[] = useMemo(
		() => [
			{
				group: "Account",
				fields: [
					{
						key: "roleLabel",
						label: "Role",
						icon: <ShieldCheckIcon />,
						type: "multiselect",
						className: "w-[200px]",
						defaultOperator: "is_any_of",
						options: ROLE_OPTIONS.map(([, label]) => ({
							value: label,
							label,
						})),
					},
					{
						key: "statusLabel",
						label: "Status",
						icon: <ActivityIcon />,
						type: "select",
						searchable: false,
						className: "w-[160px]",
						defaultOperator: "is",
						options: [
							{ value: "active", label: "Active" },
							{ value: "inactive", label: "Inactive" },
						],
					},
				],
			},
			{
				group: "Scope",
				fields: [
					{
						key: "programLabel",
						label: "Program",
						icon: <GraduationCapIcon />,
						type: "multiselect",
						className: "w-[180px]",
						defaultOperator: "is_any_of",
						options: uniqueSorted(rows.map((r) => r.programLabel)).map(
							(program) => ({ value: program, label: program }),
						),
					},
					{
						key: "departmentLabel",
						label: "Department",
						icon: <UserIcon />,
						type: "multiselect",
						className: "w-[200px]",
						defaultOperator: "is_any_of",
						options: uniqueSorted(rows.map((r) => r.departmentLabel)).map(
							(department) => ({ value: department, label: department }),
						),
					},
				],
			},
		],
		[rows],
	);

	const columns = useMemo<ColumnDef<DataGridFeatures, UserRow>[]>(
		() => [
			{
				accessorKey: "name",
				id: "name",
				header: "User",
				cell: ({ row }) => (
					<div className="flex items-center gap-3">
						<Avatar name={row.original.name} variant="beam" size={32} />
						<div className="space-y-px">
							<div className="text-foreground font-medium">
								{row.original.name}
							</div>
							<div className="text-muted-foreground text-xs">
								{row.original.email}
							</div>
						</div>
					</div>
				),
				size: 260,
				enableSorting: true,
				enableHiding: false,
			},
			{
				accessorKey: "roleLabel",
				id: "role",
				header: "Role",
				cell: ({ row }) => (
					<Badge variant="secondary">{row.original.roleLabel}</Badge>
				),
				size: 130,
				enableSorting: true,
				enableHiding: false,
			},
			{
				accessorKey: "programLabel",
				id: "program",
				header: "Program",
				cell: ({ row }) => row.original.program?.code ?? "—",
				size: 110,
				enableSorting: true,
				enableHiding: true,
			},
			{
				accessorKey: "departmentLabel",
				id: "department",
				header: "Department",
				cell: ({ row }) => row.original.department?.name ?? "—",
				size: 180,
				enableSorting: true,
				enableHiding: true,
			},
			{
				accessorKey: "statusLabel",
				id: "status",
				header: "Status",
				cell: ({ row }) =>
					row.original.isActive ? (
						<Badge variant="success-outline">Active</Badge>
					) : (
						<Badge variant="secondary">Inactive</Badge>
					),
				size: 100,
				enableSorting: true,
				enableHiding: false,
			},
			{
				accessorKey: "roleRequestStatus",
				id: "roleRequestStatus",
				header: "Request",
				cell: ({ row }) => {
					const status = row.original.roleRequestStatus;
					if (status === "none") return "—";
					return (
						<Badge variant={REQUEST_STATUS_VARIANTS[status]}>{status}</Badge>
					);
				},
				size: 120,
				enableSorting: true,
				enableHiding: true,
			},
			{
				accessorKey: "createdAt",
				id: "createdAt",
				header: "Joined",
				cell: ({ row }) => (
					<span className="text-muted-foreground font-mono text-xs tabular-nums">
						{new Date(row.original.createdAt).toLocaleDateString()}
					</span>
				),
				size: 120,
				enableSorting: true,
				enableHiding: true,
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<div className="flex justify-end gap-1">
						<Button
							aria-label={`Edit ${row.original.name}`}
							onClick={() => openEditDialog(row.original)}
							size="icon-sm"
							type="button"
							variant="ghost"
						>
							<PencilIcon />
						</Button>
						<Button
							aria-label={`Delete ${row.original.name}`}
							onClick={() => openDeleteDialog(row.original)}
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
			},
		],
		[],
	);

	const table = useTable({
		features: dataGridFeatures,
		columns,
		data: filteredData,
		pageCount: Math.ceil((filteredData?.length || 0) / pagination.pageSize),
		getRowId: (row: UserRow) => row.id,
		state: { pagination, sorting },
		onPaginationChange: setPagination,
		onSortingChange: setSorting,
	});

	return (
		<section className="bg-card rounded-xl border p-6 shadow-sm">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h3 className="text-base font-semibold">Users</h3>
					<p className="text-muted-foreground text-xs">
						Every platform account, its role, scope, and status.
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						disabled={state.status === "loading"}
						onClick={() => refresh()}
						type="button"
						variant="outline"
					>
						<RefreshCwIcon />
						Refresh
					</Button>
					<Button onClick={() => void openUserDialog()} type="button">
						Add user
					</Button>
				</div>
			</div>

			{state.status === "loading" ? (
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
						emptyMessage="No users to show."
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
				open={userOpen}
				onOpenChange={(details) => setUserOpen(details.open)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Add user</AlertDialogTitle>
						<AlertDialogDescription>
							Create a test account with a sign-in password you can hand out.
							The email must be unique.
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogBody>
						<div className="space-y-4">
							<Field>
								<FieldLabel>Name</FieldLabel>
								<FieldDescription>
									The account holder's full name.
								</FieldDescription>
								<Input
									value={name}
									onChange={(event) => setName(event.target.value)}
									placeholder="Test Faculty"
								/>
							</Field>

							<Field>
								<FieldLabel>Email</FieldLabel>
								<FieldDescription>Used to sign in.</FieldDescription>
								<Input
									type="email"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									placeholder="tester@jmcfi.edu.ph"
								/>
							</Field>

							<Field>
								<FieldLabel>Password</FieldLabel>
								<FieldDescription>
									Share this with the tester; they sign in with email and
									password.
								</FieldDescription>
								<Input
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									placeholder="password123"
								/>
							</Field>

							<Field>
								<FieldLabel>Role</FieldLabel>
								<FieldDescription>
									What the account can see and do. Scope follows the role.
								</FieldDescription>
								<SelectRole
									className="w-full"
									onValueChange={(value) => {
										setRole(value);
										// Scope follows the role — drop stale picks so a hidden
										// selection can never be sent.
										setProgramId(undefined);
										setDepartmentId(undefined);
									}}
									value={role}
								/>
							</Field>

							{roleNeedsProgram(role) && (
								<Field>
									<FieldLabel>Program</FieldLabel>
									<SelectProgram
										className="w-full"
										onValueChange={setProgramId}
										programs={programs}
										value={programId}
									/>
								</Field>
							)}

							{roleNeedsDepartment(role) && (
								<Field>
									<FieldLabel>Department</FieldLabel>
									<SelectDepartment
										className="w-full"
										departments={departments}
										onValueChange={setDepartmentId}
										value={departmentId}
									/>
								</Field>
							)}
						</div>
					</AlertDialogBody>

					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={submitting}
							onClick={() => void handleCreateUser()}
						>
							{submitting ? "Creating…" : "Create"}
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
						<AlertDialogTitle>Edit user</AlertDialogTitle>
						<AlertDialogDescription>
							Update the account's details. Scope follows the role.
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogBody>
						<div className="space-y-4">
							<Field>
								<FieldLabel>Name</FieldLabel>
								<Input
									value={editName}
									onChange={(event) => setEditName(event.target.value)}
									placeholder="Full name"
								/>
							</Field>

							<Field>
								<FieldLabel>Email</FieldLabel>
								<Input
									type="email"
									value={editEmail}
									onChange={(event) => setEditEmail(event.target.value)}
									placeholder="name@jmcfi.edu.ph"
								/>
							</Field>

							<Field>
								<FieldLabel>Role</FieldLabel>
								<SelectRole
									className="w-full"
									onValueChange={(value) => {
										setEditRole(value);
										// Scope follows the role — drop stale picks.
										setEditProgramId(undefined);
										setEditDepartmentId(undefined);
									}}
									roles={ALL_ROLES}
									value={editRole}
								/>
							</Field>

							{roleNeedsProgram(editRole) && (
								<Field>
									<FieldLabel>Program</FieldLabel>
									<SelectProgram
										className="w-full"
										onValueChange={setEditProgramId}
										programs={programs}
										value={editProgramId}
									/>
								</Field>
							)}

							{roleNeedsDepartment(editRole) && (
								<Field>
									<FieldLabel>Department</FieldLabel>
									<SelectDepartment
										className="w-full"
										departments={departments}
										onValueChange={setEditDepartmentId}
										value={editDepartmentId}
									/>
								</Field>
							)}

							<Field>
								<FieldLabel>Account active</FieldLabel>
								<div className="flex items-center gap-2">
									<Checkbox
										checked={editActive}
										onCheckedChange={(checked) =>
											setEditActive(Boolean(checked))
										}
										aria-label="Account active"
									/>
									<span className="text-muted-foreground text-sm">
										{editActive ? "Active" : "Inactive"}
									</span>
								</div>
							</Field>
						</div>
					</AlertDialogBody>

					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={editSubmitting}
							onClick={() => void handleUpdateUser()}
						>
							{editSubmitting ? "Saving…" : "Save"}
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
						<AlertDialogTitle>Delete account?</AlertDialogTitle>
						<AlertDialogDescription>
							Permanently remove {deleteTarget?.name ?? "this user"} (
							{deleteTarget?.email}). Their submissions and audit trail are
							kept; this cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => void handleDeleteUser()}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}
