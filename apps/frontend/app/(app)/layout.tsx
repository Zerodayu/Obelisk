import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { SessionInitializer } from "@/lib/store/session-initializer";
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

  return (
    <>
      <SessionInitializer user={user} />
      <AppShell user={user}>{children}</AppShell>
    </>
  );
}
