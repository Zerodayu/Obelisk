import { ClusterCompositionDonut } from "@/components/charts/governance-charts";
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
 * `/archives` — graduation-cluster archive list (program, batch, status,
 * student count, archivedAt). Read-only; gated to aqau/vpaa/dean/system_admin.
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
							Archived student statuses across compiled clusters. Empty until
							the archival pipeline compiles a cluster.
						</FrameDescription>
					</FrameHeader>
					<FramePanel>
						<div className="h-72">
							<ClusterCompositionDonut />
						</div>
					</FramePanel>
				</Frame>
			</div>
		</div>
	);
}
