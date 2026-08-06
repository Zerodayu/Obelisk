import { RoleDashboard } from "@/app/(app)/dashboard/role-dashboard";
import { requireUser } from "@/server/auth";

/**
 * `/dashboard` — single adaptive home. Resolves the authenticated user
 * server-side and renders the role's scoped dashboard via the registry in
 * `role-dashboard.tsx`.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  return <RoleDashboard user={user} />;
}
