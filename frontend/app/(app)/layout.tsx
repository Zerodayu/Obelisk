import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/server/auth";

/**
 * Authenticated app shell. Runs on every page under `(app)/`:
 * resolves the session server-side and redirects to `/login` when there is no
 * valid session. Precise role gating for nested route groups happens in their
 * own layouts via `requireRole`.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  return <AppShell user={user}>{children}</AppShell>;
}
