"use client";

import {
	type ColumnDef,
	type PaginationState,
	type SortingState,
	useTable,
} from "@tanstack/react-table";
import Avatar from "boring-avatars";
import {
	FunnelXIcon,
	LayersIcon,
	ListFilterIcon,
	ShieldCheckIcon,
	UserIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { Button } from "@/components/ui/button";
import { toast, toastError } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api-client";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";
import { decideRoleRequest } from "@/server/actions/auth";

/**
 * Role-requests panel — the System Admin's approval inbox.
 *
 * Renders as one filterable table (same pattern as `CohortTrackingGrid` and
 * `AuditLogGrid`): the backend scopes who sees what, filtering/sorting run
 * client-side over the pending rows it served.
 */

interface RoleRequestProgram {
	id: string;
	name: string;
	code: string;
}

interface RoleRequestDepartment {
	id: string;
	name: string;
	code: string;
}

interface RoleRequestUser {
	id: string;
	name: string;
	email: string;
	role: UserRole;
	requestedRole: UserRole;
	roleRequestStatus: "none" | "pending" | "approved" | "denied";
	employeeId?: string | null;
	program?: RoleRequestProgram | null;
	department?: RoleRequestDepartment | null;
	isActive: boolean;
	createdAt: string;
}

interface RoleRequestRow {
	id: string;
	name: string;
	email: string;
	requestedRole: string;
	roleLabel: string;
	scopeLabel: string;
	createdAt: string;
}

function matchesFilter(row: RoleRequestRow, filter: Filter): boolean {
	const { field, operator, values } = filter;

	// "Applicant" matches name OR email — one filter over both.
	if (field === "applicant") {
		const haystack = `${row.name} ${row.email}`.toLowerCase();
		switch (operator) {
			case "contains":
				return values.some((v) => haystack.includes(String(v).toLowerCase()));
			case "is":
				return (
					values.length === 0 || haystack === String(values[0]).toLowerCase()
				);
			default:
				return true;
		}
	}

	const value = row[field as keyof RoleRequestRow];
	if (typeof value !== "string") return true;

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

function applyFilters(
	rows: RoleRequestRow[],
	filters: Filter[],
): RoleRequestRow[] {
	if (filters.length === 0) return rows;
	return rows.filter((row) => filters.every((f) => matchesFilter(row, f)));
}

export function RoleRequestsPanel() {
	const [requests, setRequests] = useState<RoleRequestUser[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);

	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "createdAt", desc: true },
	]);
	const [filters, setFilters] = useState<Filter[]>([]);

	// Tracks the first load only, so a post-decision refresh does not flash the
	// "loading" placeholder over rows that are already on screen.
	const loadedRef = useRef(false);

	const load = useCallback(async () => {
		setError(null);
		if (!loadedRef.current) setLoading(true);
		try {
			setRequests(await api.get<RoleRequestUser[]>("/auth/role-requests"));
			loadedRef.current = true;
		} catch (err) {
			const message =
				err instanceof ApiError ? err.message : "Could not load role requests.";
			setError(message);
			toastError({
				status: err instanceof ApiError ? err.status : undefined,
				scope: "role-requests",
				title: "Could not load role requests",
				description: message,
			});
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function decide(userId: string, action: "approve" | "deny") {
		setBusyId(userId);
		setError(null);
		const result = await decideRoleRequest(userId, action);
		if (!result.ok) {
			setError(result.error);
			toastError({
				scope: "role-requests:decide",
				title: "Request failed",
				description: result.error,
			});
		} else {
			toast.success({
				title:
					action === "approve"
						? "Role request approved"
						: "Role request denied",
			});
			await load();
		}
		setBusyId(null);
	}

	const rows = useMemo<RoleRequestRow[]>(
		() =>
			requests.map((request) => ({
				id: request.id,
				name: request.name,
				email: request.email,
				requestedRole: request.requestedRole,
				roleLabel: ROLE_LABELS[request.requestedRole] ?? request.requestedRole,
				scopeLabel: [request.program?.name, request.department?.name]
					.filter(Boolean)
					.join(" · "),
				createdAt: request.createdAt,
			})),
		[requests],
	);

	const filteredData = useMemo(
		() => applyFilters(rows, filters),
		[rows, filters],
	);

	const handleFiltersChange = useCallback((next: Filter[]) => {
		setFilters(next);
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, []);

	const fields: FilterFieldConfig[] = useMemo(() => {
		const roles = [...new Set(requests.map((r) => r.requestedRole))].sort();
		return [
			{
				group: "Request",
				fields: [
					{
						key: "requestedRole",
						label: "Requested role",
						icon: <ShieldCheckIcon />,
						type: "multiselect",
						className: "w-[180px]",
						defaultOperator: "is_any_of",
						options: roles.map((role) => ({
							value: role,
							label: ROLE_LABELS[role as UserRole] ?? role,
						})),
					},
					{
						key: "applicant",
						label: "Applicant",
						icon: <UserIcon />,
						type: "text",
						className: "w-[200px]",
						defaultOperator: "contains",
					},
					{
						key: "scopeLabel",
						label: "Scope",
						icon: <LayersIcon />,
						type: "text",
						className: "w-[200px]",
						defaultOperator: "contains",
					},
				],
			},
		];
	}, [requests]);

	const columns = useMemo<ColumnDef<DataGridFeatures, RoleRequestRow>[]>(
		() => [
			{
				accessorKey: "name",
				id: "applicant",
				header: "Applicant",
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
				accessorKey: "requestedRole",
				id: "requestedRole",
				header: "Requested role",
				cell: ({ row }) => (
					<Badge variant="outline">{row.original.roleLabel}</Badge>
				),
				size: 150,
				enableSorting: true,
				enableHiding: false,
			},
			{
				accessorKey: "scopeLabel",
				id: "scopeLabel",
				header: "Scope",
				cell: ({ row }) =>
					row.original.scopeLabel ? (
						<Badge variant="secondary">{row.original.scopeLabel}</Badge>
					) : (
						<span className="text-muted-foreground text-xs">
							No program/department on file
						</span>
					),
				size: 220,
				enableSorting: true,
				enableHiding: true,
			},
			{
				accessorKey: "createdAt",
				id: "createdAt",
				header: "Requested at",
				cell: ({ row }) => (
					<span className="text-muted-foreground font-mono text-xs tabular-nums">
						{new Date(row.original.createdAt).toLocaleString()}
					</span>
				),
				size: 170,
				enableSorting: true,
				enableHiding: false,
			},
			{
				id: "actions",
				header: "Actions",
				cell: ({ row }) => (
					<div className="flex gap-2">
						<Button
							disabled={busyId === row.original.id}
							onClick={() => void decide(row.original.id, "approve")}
							type="button"
						>
							Approve
						</Button>
						<Button
							disabled={busyId === row.original.id}
							onClick={() => void decide(row.original.id, "deny")}
							type="button"
							variant="outline"
						>
							Deny
						</Button>
					</div>
				),
				size: 180,
				enableSorting: false,
				enableHiding: false,
			},
		],
		// NOTE: `busyId` is read in the Actions cell's disabled state.
		[busyId],
	);

	const table = useTable({
		features: dataGridFeatures,
		columns,
		data: filteredData,
		pageCount: Math.ceil((filteredData?.length || 0) / pagination.pageSize),
		getRowId: (row: RoleRequestRow) => row.id,
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
					<h3 className="text-base font-semibold">Role requests</h3>
					<p className="text-muted-foreground text-xs">
						Approve or deny pending role requests from new accounts.
					</p>
				</div>
				<Button
					disabled={loading}
					onClick={() => void load()}
					type="button"
					variant="outline"
				>
					Refresh
				</Button>
			</div>

			{error ? <p className="text-destructive mt-4 text-sm">{error}</p> : null}

			{loading ? (
				<p className="text-muted-foreground mt-6 text-sm">
					Loading pending requests…
				</p>
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
						emptyMessage="No pending role requests."
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
