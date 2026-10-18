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
	RefreshCwIcon,
	ShieldCheckIcon,
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import {
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
import { createUser } from "@/server/actions/auth";

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
		</section>
	);
}
