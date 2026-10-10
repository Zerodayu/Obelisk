import { AuditWaterfall } from "@/components/audit/audit-waterfall";
import { requireUser } from "@/server/auth";

/**
 * `/audit-logs` — role-hierarchy audit waterfall (`GET /audit/logs`).
 *
 * Open to every authenticated role: the backend scopes the rows (own only
 * below vpaa/system_admin), the waterfall renders whichever tiers the caller
 * is entitled to. Backend still enforces the boundary.
 */
export default async function AuditLogsPage() {
	await requireUser();
	return (
		<div className="space-y-6 px-4 lg:px-6">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">Audit Logs</h2>
				<p className="text-muted-foreground text-sm">
					Who did what, in role-hierarchy order. You see your own activity; the
					VPAA and system admin see every role&apos;s trail.
				</p>
			</div>
			<AuditWaterfall />
		</div>
	);
}
