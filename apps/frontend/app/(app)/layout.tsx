import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { SessionInitializer } from "@/lib/store/session-initializer";
import { listDepartments } from "@/server/actions/academic";
import { requireUser } from "@/server/auth";

/**
 * Authenticated app shell. Runs on every page under `(app)/`:
 * resolves the session server-side and redirects to `/login` when there is no
 * valid session. Precise role gating for nested route groups happens in their
 * own layouts via `requireRole`. Accounts without an institutional role are
 * sent to `/onboarding` (role picker, or pending/denied status) — they never
 * see the app shell or dashboards.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  if (user.role === "user") {
    redirect("/onboarding");
  }

  // Department prefix for the sidebar line ("— CITE: Dean"): resolved here,
  // server-side, so it renders on first paint instead of after a client fetch.
  // Accounts without a department (aqau/vpaa/system_admin) skip the lookup.
  let departmentLabel: string | undefined;
  const departmentId = user.departmentId;
  if (departmentId) {
    const departments = await listDepartments();
    if (departments.ok) {
      const department = departments.data.find(
        (entry) => entry.id === departmentId,
      );
      departmentLabel = department?.name || department?.code;
    }
  }

  return (
    <>
      <SessionInitializer user={user} />
      <AppShell user={user} departmentLabel={departmentLabel}>
        {children}
      </AppShell>
    </>
  );
}
