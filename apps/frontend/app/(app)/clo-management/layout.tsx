import { CLO_MANAGEMENT_ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";

/** Role gate for CLO management: faculty + program_chair + system_admin. */
export default async function CloManagementLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	await requireRole(CLO_MANAGEMENT_ROLES);
	return children;
}
