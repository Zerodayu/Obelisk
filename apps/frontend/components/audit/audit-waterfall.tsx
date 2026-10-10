"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { useMemo } from "react";

import { AuditLogGrid } from "@/components/audit/audit-log-grid";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { roleLabel, type UserRole } from "@/lib/roles";
import {
	type AuditLogEntry,
	auditLogsStateAtom,
	refreshAuditActivityAtom,
} from "@/lib/store/atoms/governance";

/**
 * Role-hierarchy audit waterfall — VPAA at the top, cascading down through
 * system_admin → AQAU → Dean → Program Chair → Faculty. Each tier renders its
 * own cohort-style DataGrid.
 *
 * Scope comes from the server (`viewer.scope`): `all` shows every tier,
 * `self` shows only the caller's own tier — tiers they cannot read are never
 * rendered (not even as empty shells, so no existence leaks).
 */

/** Cascade order: institutional top first; `unknown` = deleted-user rows. */
const TIER_ORDER = [
	"vpaa",
	"system_admin",
	"aqau",
	"dean",
	"program_chair",
	"faculty",
	"user",
	"unknown",
] as const;

interface Tier {
	key: string;
	label: string;
	entries: AuditLogEntry[];
}

function tierLabel(key: string): string {
	if (key === "unknown") return "Unknown / deleted user";
	return roleLabel(key as UserRole);
}

function groupIntoTiers(entries: AuditLogEntry[]): Tier[] {
	const groups = new Map<string, AuditLogEntry[]>();
	for (const entry of entries) {
		// NOTE: rows with no surviving actor only ever appear in the full view
		const key = entry.actor?.role ?? "unknown";
		const bucket = groups.get(key);
		if (bucket) bucket.push(entry);
		else groups.set(key, [entry]);
	}
	return TIER_ORDER.flatMap((key) => {
		const rows = groups.get(key);
		if (!rows || rows.length === 0) return [];
		return [{ key, label: tierLabel(key), entries: rows }];
	});
}

export function AuditWaterfall() {
	const { status, data } = useAtomValue(auditLogsStateAtom);
	const refresh = useSetAtom(refreshAuditActivityAtom);

	const tiers = useMemo(() => groupIntoTiers(data.entries), [data.entries]);
	const scope = data.viewer.scope;
	const loading = status === "loading" && data.entries.length === 0;

	if (status === "error" && data.entries.length === 0) {
		return (
			<div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-3 rounded-lg border p-4">
				<div className="flex items-center gap-2 text-sm">
					<AlertTriangleIcon className="text-destructive size-4" />
					<span>Could not load the audit trail. Try again.</span>
				</div>
				<Button variant="outline" size="sm" onClick={() => refresh()}>
					<RefreshCwIcon />
					Retry
				</Button>
			</div>
		);
	}

	if (loading) {
		return (
			<div className="text-muted-foreground animate-pulse text-sm">
				Loading audit trail…
			</div>
		);
	}

	if (tiers.length === 0) {
		return (
			<div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
				No audit activity recorded for your role yet.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{scope === "self" && (
				<p className="text-muted-foreground text-sm">
					You are seeing your own activity only — the full role waterfall is
					visible to the VPAA (and system admin).
				</p>
			)}

			<div>
				{tiers.map((tier, index) => (
					<div
						key={tier.key}
						className="relative pl-6"
						style={{ marginLeft: `${index * 12}px` }}
					>
						{/* NOTE: cascade connector — line drops from the tier above into this header */}
						{index > 0 && (
							<>
								<span
									aria-hidden
									className="bg-border absolute top-0 left-0 h-6 w-px"
								/>
								<span
									aria-hidden
									className="bg-border absolute top-6 left-0 h-px w-4"
								/>
							</>
						)}
						<div className="flex items-center gap-2 pb-2">
							<h3 className="text-sm font-semibold tracking-tight">
								{tier.label}
							</h3>
							<Badge variant="secondary">{tier.entries.length}</Badge>
							{index === 0 && (
								<span className="text-muted-foreground text-xs">
									top of chain
								</span>
							)}
						</div>
						<AuditLogGrid entries={tier.entries} showActor={scope === "all"} />
					</div>
				))}
			</div>
		</div>
	);
}
