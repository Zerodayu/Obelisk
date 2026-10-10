import { ARCHIVE_ROLES } from "@/lib/roles";
import { serverApi } from "@/server/api-client";
import { requireRole } from "@/server/auth";

/** The `GET /archives/:clusterId` payload (`apps/backend/src/v1/archive`). */
interface ClusterDetail {
	id: string;
	label: string;
	status: "open" | "compiling" | "archived";
	studentCount: number;
	confirmedAt: string | null;
	compiledAt: string | null;
	archivedAt: string | null;
	program: { id: string; code: string; name: string };
	graduationTerm: { id: string; schoolYear: string; semester: string };
	entries: {
		id: string;
		anonymizedId: string;
		studentStatusAtArchive: string;
		isGraduationEntry: boolean;
		graduatedAt: string | null;
		detailArtifactUrl: string | null;
	}[];
}

const STATUS_LABELS: Record<string, string> = {
	open: "Open",
	compiling: "Compiling",
	archived: "Archived",
};

function formatDate(value: string | null): string {
	if (!value) return "—";
	return new Date(value).toLocaleDateString();
}

/**
 * `/archives/[clusterId]` — one graduation cluster's compiled per-student
 * entries. Read-only: there are no edit/delete affordances anywhere on this
 * page, matching the permanent-retention class of the record.
 *
 * An `open` cluster has no entries yet (nothing has been compiled), so the
 * page says so rather than rendering an empty grid — and an `archived`
 * cluster's entries are what survives the source-row purge.
 */
export default async function ClusterDetailPage({
	params,
}: {
	params: Promise<{ clusterId: string }>;
}) {
	await requireRole(ARCHIVE_ROLES);
	const { clusterId } = await params;

	// NOTE: `serverFetch` throws on a non-2xx, so an unknown or out-of-unit
	// cluster surfaces as an error rather than a fake empty state.
	const cluster = await serverApi.get<ClusterDetail>(`/archives/${clusterId}`);

	const compiled = cluster.status !== "open" && cluster.entries.length > 0;

	return (
		<div className="space-y-6 px-4 lg:px-6">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">
					{cluster.label}
				</h2>
				<p className="text-muted-foreground text-sm">
					{cluster.program.name} · {cluster.graduationTerm.schoolYear}{" "}
					{cluster.graduationTerm.semester} ·{" "}
					{STATUS_LABELS[cluster.status] ?? cluster.status}
				</p>
				<p className="text-muted-foreground text-sm">
					Permanent, read-only snapshot. No data here can be modified.
				</p>
			</div>

			<dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
				{[
					["Students", cluster.studentCount],
					["Confirmed", formatDate(cluster.confirmedAt)],
					["Compiled", formatDate(cluster.compiledAt)],
					["Archived", formatDate(cluster.archivedAt)],
				].map(([label, value]) => (
					<div
						className="border-border rounded-lg border px-4 py-3"
						key={String(label)}
					>
						<dt className="text-muted-foreground text-xs uppercase">{label}</dt>
						<dd className="mt-1 text-lg font-semibold">{value}</dd>
					</div>
				))}
			</dl>

			{compiled ? (
				<div className="border-border rounded-lg border">
					<table className="w-full text-sm">
						<thead className="border-border bg-muted/50 border-b">
							<tr>
								<th className="px-4 py-2 text-left font-medium">
									Anonymized student
								</th>
								<th className="px-4 py-2 text-left font-medium">
									Status at archive
								</th>
								<th className="px-4 py-2 text-left font-medium">
									Graduation entry
								</th>
								<th className="px-4 py-2 text-left font-medium">Graduated</th>
								<th className="px-4 py-2 text-left font-medium">
									Detail artifact
								</th>
							</tr>
						</thead>
						<tbody>
							{cluster.entries.map((entry) => (
								<tr
									className="border-border border-b last:border-0"
									key={entry.id}
								>
									<td className="px-4 py-2 font-mono text-xs">
										{entry.anonymizedId}
									</td>
									<td className="px-4 py-2">{entry.studentStatusAtArchive}</td>
									<td className="px-4 py-2">
										{entry.isGraduationEntry ? "Yes" : "No"}
									</td>
									<td className="px-4 py-2">{formatDate(entry.graduatedAt)}</td>
									<td className="px-4 py-2">
										{entry.detailArtifactUrl ? (
											<a
												className="hover:underline"
												href={entry.detailArtifactUrl}
											>
												Open
											</a>
										) : (
											"—"
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className="text-muted-foreground text-sm">
					This cluster is not compiled yet — no student entries have been
					snapshotted. Entries appear once the term's departures are confirmed
					and compiled.
				</p>
			)}
		</div>
	);
}
