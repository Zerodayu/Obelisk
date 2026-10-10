"use client";

import {
	type ColumnDef,
	type PaginationState,
	type SortingState,
	useTable,
} from "@tanstack/react-table";
import Avatar from "boring-avatars";
import {
	BracesIcon,
	FunnelXIcon,
	HashIcon,
	LayersIcon,
	ListFilterIcon,
	UserIcon,
	ZapIcon,
} from "lucide-react";
import Link from "next/link";
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
	type Filter,
	type FilterFieldConfig,
	Filters,
} from "@/components/reui/filters";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
} from "@/components/ui/dialog";
import { roleLabel, type UserRole } from "@/lib/roles";
import type { AuditLogEntry } from "@/lib/store/atoms/governance";
import { cn } from "@/lib/utils";

/**
 * Audit-log table — the cohort-tracking grid pattern (DataGrid + client-side
 * Filters/sort/pagination) applied to one role tier's `AuditLog` rows.
 *
 * Filtering runs entirely client-side over the rows the caller was served
 * (same feel as `CohortTrackingGrid`); the backend scopes who sees what.
 */

/** Flattened row — filters address plain strings, like the cohort matcher. */
interface AuditRow extends AuditLogEntry {
	targetRecordId: string;
	actorName: string;
	actorRoleLabel: string;
}

/** Success for accepted outcomes, warning for sends-back/destructive. */
const VERB_OK = new Set(["approved", "archived", "generated"]);
const VERB_WARN = new Set(["returned", "deleted", "rejected"]);

function verbVariant(
	verb: string,
): "success-outline" | "warning-outline" | "secondary" {
	if (VERB_OK.has(verb)) return "success-outline";
	if (VERB_WARN.has(verb)) return "warning-outline";
	return "secondary";
}

/** Split `form_submission.approved` → prefix + verb for the two-line cell. */
function splitAction(action: string): { prefix: string; verb: string } {
	const dot = action.lastIndexOf(".");
	if (dot <= 0) return { prefix: "", verb: action };
	return { prefix: action.slice(0, dot), verb: action.slice(dot + 1) };
}

function matchesFilter(row: AuditRow, filter: Filter): boolean {
	const value = row[filter.field as keyof AuditRow];
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

function applyFilters(rows: AuditRow[], filters: Filter[]): AuditRow[] {
	if (filters.length === 0) return rows;
	return rows.filter((row) => filters.every((f) => matchesFilter(row, f)));
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort();
}

export function AuditLogGrid({
	entries,
	showActor,
}: {
	entries: AuditLogEntry[];
	/**
	 * Full-view tiers only — the actor is the caller in self scope, so the
	 * column and its filter would be constant noise there.
	 */
	showActor: boolean;
}) {
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "createdAt", desc: true },
	]);
	const [filters, setFilters] = useState<Filter[]>([]);
	const [detail, setDetail] = useState<AuditRow | null>(null);

	const rows = useMemo<AuditRow[]>(
		() =>
			entries.map((entry) => ({
				...entry,
				// NOTE: normalize null → "" so the text filter addresses every row
				targetRecordId: entry.targetRecordId ?? "",
				actorName: entry.actor?.name ?? "Deleted user",
				actorRoleLabel: entry.actor?.role
					? roleLabel(entry.actor.role as UserRole)
					: "—",
			})),
		[entries],
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
		const eventFields: FilterFieldConfig[] = [
			{
				key: "moduleAffected",
				label: "Module",
				icon: <LayersIcon />,
				type: "multiselect",
				className: "w-[180px]",
				defaultOperator: "is_any_of",
				options: uniqueSorted(entries.map((e) => e.moduleAffected)).map(
					(module) => ({ value: module, label: module }),
				),
			},
			{
				key: "action",
				label: "Action",
				icon: <ZapIcon />,
				type: "multiselect",
				searchable: true,
				className: "w-[260px]",
				defaultOperator: "is_any_of",
				options: uniqueSorted(entries.map((e) => e.action)).map((action) => ({
					value: action,
					label: action,
				})),
			},
		];
		const recordFields: FilterFieldConfig[] = [
			{
				key: "targetRecordId",
				label: "Record ID",
				icon: <HashIcon />,
				type: "text",
				className: "w-[220px]",
				defaultOperator: "contains",
			},
		];
		if (showActor) {
			recordFields.push({
				key: "actorName",
				label: "Actor",
				icon: <UserIcon />,
				type: "text",
				className: "w-[220px]",
				defaultOperator: "contains",
			});
		}
		return [
			{ group: "Event", fields: eventFields },
			{ group: "Record", fields: recordFields },
		];
	}, [entries, showActor]);

	const columns = useMemo<ColumnDef<DataGridFeatures, AuditRow>[]>(() => {
		// NOTE: actor column only in full-view tiers — in self scope every row's
		// actor is the caller, so the column and its filter would be constant.
		const actorColumn: ColumnDef<DataGridFeatures, AuditRow> = {
			accessorKey: "actorName",
			id: "actor",
			header: "Actor",
			cell: ({ row }) => (
				<div className="flex items-center gap-3">
					<Avatar name={row.original.actorName} variant="beam" size={28} />
					<div className="space-y-px">
						<div className="text-foreground font-medium">
							{row.original.actorName}
						</div>
						<div className="text-muted-foreground text-xs">
							{row.original.actorRoleLabel}
						</div>
					</div>
				</div>
			),
			size: 220,
			enableSorting: true,
			enableHiding: false,
		};

		return [
			{
				accessorKey: "createdAt",
				id: "createdAt",
				header: "Time",
				cell: ({ row }) => (
					<span className="text-muted-foreground font-mono text-xs tabular-nums">
						{new Date(row.original.createdAt).toLocaleString()}
					</span>
				),
				size: 170,
				enableSorting: true,
				enableHiding: false,
			},
			...(showActor ? [actorColumn] : []),
			{
				accessorKey: "action",
				id: "action",
				header: "Event",
				cell: ({ row }) => {
					const { prefix, verb } = splitAction(row.original.action);
					return (
						<div className="flex flex-col gap-0.5">
							<div>
								<Badge variant={verbVariant(verb)}>{verb}</Badge>
							</div>
							{prefix && (
								<span className="text-muted-foreground font-mono text-xs">
									{prefix}
								</span>
							)}
						</div>
					);
				},
				size: 190,
				enableSorting: true,
				enableHiding: false,
			},
			{
				accessorKey: "moduleAffected",
				id: "moduleAffected",
				header: "Module",
				cell: ({ row }) => (
					<Badge variant="secondary">{row.original.moduleAffected}</Badge>
				),
				size: 120,
				enableSorting: true,
				enableHiding: false,
			},
			{
				accessorKey: "targetRecordId",
				id: "targetRecordId",
				header: "Record",
				cell: ({ row }) => {
					if (!row.original.targetRecordId) {
						return <span className="text-muted-foreground text-xs">—</span>;
					}
					// NOTE: only `forms` rows are guaranteed to target a FormSubmission —
					// other modules reuse the column for PLOs/sections, so render raw
					const text = (
						<span className="text-muted-foreground font-mono text-xs">
							{row.original.targetRecordId}
						</span>
					);
					return row.original.moduleAffected === "forms" ? (
						<Link
							className="hover:text-foreground underline-offset-4 hover:underline"
							href={`/submissions/${row.original.targetRecordId}`}
						>
							{text}
						</Link>
					) : (
						text
					);
				},
				size: 190,
				enableSorting: true,
				enableHiding: true,
			},
			{
				id: "details",
				header: "Details",
				cell: ({ row }) => (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setDetail(row.original)}
					>
						<BracesIcon />
						View
					</Button>
				),
				size: 100,
				enableSorting: false,
				enableHiding: false,
			},
		];
	}, [showActor]);

	const table = useTable({
		features: dataGridFeatures,
		columns,
		data: filteredData,
		pageCount: Math.ceil((filteredData?.length || 0) / pagination.pageSize),
		getRowId: (row: AuditRow) => row.id,
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

			<Dialog
				onOpenChange={(details) => {
					if (!details.open) setDetail(null);
				}}
				open={detail !== null}
			>
				<DialogContent>
					<DialogHeader
						title={detail ? splitAction(detail.action).verb : "Details"}
						description={
							detail
								? `${detail.action} · ${detail.moduleAffected} · ${new Date(
										detail.createdAt,
									).toLocaleString()}`
								: undefined
						}
					/>
					<DialogBody className="my-2 space-y-3">
						{detail && showActor && (
							<div className="flex items-center gap-2 text-sm">
								<span className="text-muted-foreground">Actor:</span>
								<span className="font-medium">{detail.actorName}</span>
								<Badge variant="outline">{detail.actorRoleLabel}</Badge>
							</div>
						)}
						{detail?.targetRecordId && (
							<div className="flex items-center gap-2 text-sm">
								<span className="text-muted-foreground">Record:</span>
								<span className="font-mono text-xs">
									{detail.targetRecordId}
								</span>
							</div>
						)}
						<pre
							className={cn(
								"bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs",
								Object.keys((detail?.details as object) ?? {}).length === 0 &&
									"text-muted-foreground",
							)}
						>
							{JSON.stringify(detail?.details ?? {}, null, 2)}
						</pre>
					</DialogBody>
				</DialogContent>
			</Dialog>
		</div>
	);
}
