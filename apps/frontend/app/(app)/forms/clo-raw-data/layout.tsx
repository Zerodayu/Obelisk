import { CLASS_RECORD_SCREEN_ROLES } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

/** Role gate for the class-record capture (CLO raw data) upload screen. */
export default async function CloRawDataLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	await requireRole(CLASS_RECORD_SCREEN_ROLES);
	return children;
}
