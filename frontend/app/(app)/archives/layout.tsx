import { requireRole } from "@/server/auth";
import { ARCHIVE_ROLES } from "@/lib/roles";

/** Role gate for archives: aqau/vpaa/dean/system_admin only. */
export default async function ArchivesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireRole(ARCHIVE_ROLES);
  return children;
}
