import { ACADEMIC_ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";

/** Role gate for the academic-authored CLO raw data screen. */
export default async function CloRawDataLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireRole(ACADEMIC_ROLES);
  return children;
}
