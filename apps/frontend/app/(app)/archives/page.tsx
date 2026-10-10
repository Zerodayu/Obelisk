import {
	ClusterCompositionDonut,
	ClusterStatusDonut,
} from "@/components/charts/governance-charts";
import { ClusterListTable } from "@/components/governance/cluster-list-table";
import {
	Frame,
	FrameDescription,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { ARCHIVE_ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";

/**
 * `/archives` — graduation-cluster archive list (label, program, graduation
 * term, status, live student count, confirm/archive timestamps) plus the
 * composition and lifecycle distributions. Read-only; gated to the archive
 * roles (`vpaa`/`system_admin`).
 */
export default async function ArchivesIndexPage() {
	await requireRole(ARCHIVE_ROLES);
	return (
		<div className="space-y-6 px-4 lg:px-6">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">Archives</h2>
				<p className="text-muted-foreground text-sm">
					Compiled graduation clusters. Data here is permanent and read-only.
				</p>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<Frame className="w-full">
					<FrameHeader>
						<FrameTitle>Cluster composition</FrameTitle>
						<FrameDescription>
							Archived student statuses across compiled clusters — read from the
							`GraduationClusterEntry` rows a compile writes, which is the
							record that survives the source-row purge.
						</FrameDescription>
					</FrameHeader>
					<FramePanel>
						<div className="h-72">
							<ClusterCompositionDonut />
						</div>
					</FramePanel>
				</Frame>
				<Frame className="w-full">
					<FrameHeader>
						<FrameTitle>Cluster lifecycle</FrameTitle>
						<FrameDescription>
							Open, compiling, and archived clusters in your unit.
						</FrameDescription>
					</FrameHeader>
					<FramePanel>
						<div className="h-72">
							<ClusterStatusDonut />
						</div>
					</FramePanel>
				</Frame>
			</div>
			<ClusterListTable />
		</div>
	);
}
