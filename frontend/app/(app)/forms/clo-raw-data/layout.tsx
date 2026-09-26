import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

/** Role gate for the class-record capture (CLO raw data) screen. */
export default async function CloRawDataLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireRole(formRoles("clo_raw_data"));
  return children;
}
