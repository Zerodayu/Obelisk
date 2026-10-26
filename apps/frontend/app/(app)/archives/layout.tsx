import { ARCHIVE_VIEW_ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";

/** Role gate for archives: aqau/vpaa/system_admin only. */
export default async function ArchivesLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	await requireRole(ARCHIVE_VIEW_ROLES);
	return children;
}
