import { PLO_MANAGEMENT_ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";

/** Role gate for PLO management: dean only (faculty map, they don't author). */
export default async function PloManagementLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireRole(PLO_MANAGEMENT_ROLES);
  return children;
}
