import { ARCHIVE_ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";

/** Role gate for archives: aqau/vpaa/dean/system_admin only. */
export default async function ArchivesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireRole(ARCHIVE_ROLES);
  return children;
}
