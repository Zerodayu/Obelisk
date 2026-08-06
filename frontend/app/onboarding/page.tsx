import { CheckCheckIcon, Clock3Icon } from "lucide-react";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ObeliskLogo } from "@/components/branding/obelisk-logo";
import { DEV_ENFORCE_ROLE_ACCESS, isDevMode } from "@/lib/dev-mode";
import { roleLabel } from "@/lib/roles";
import { requireUser } from "@/server/auth";

/**
 * `/onboarding` — post-login role selection. New accounts signed in through the
 * org-restricted Google provider have no role yet; they choose one here and a
 * system_admin approves it. Users already waiting on an approval see their
 * pending request instead of the selector, so they can't file a second one.
 * Denied accounts land back here to re-file. Anyone with a granted role is
 * sent straight to the dashboard. In dev mode the route stays previewable
 * unless `DEV_ENFORCE_ROLE_ACCESS` is enabled (mirrors `requireRole`).
 */
const Onboarding = async () => {
  const user = await requireUser();

  const needsOnboarding = user.role === "user";
  const isWaiting =
    user.role === "user" && user.roleRequestStatus === "pending";
  if ((!isDevMode || DEV_ENFORCE_ROLE_ACCESS) && !needsOnboarding) {
    redirect("/dashboard");
  }

  const pendingRole = isWaiting
    ? roleLabel(user.requestedRole ?? undefined)
    : undefined;

  // The backend bumps `updatedAt` when a role request is filed; it's the
  // closest proxy for the submission date (no dedicated field exists).
  const submittedAt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(user.updatedAt));

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="mx-auto w-full border border-border/70 pb-0 max-sm:border-t-0 sm:max-w-md sm:rounded-xl sm:bg-card sm:p-1 sm:shadow-lg/3">
        <div className="border border-border/70 bg-muted/60 px-10 py-14 max-sm:border-x-0 sm:rounded-lg sm:shadow-sm/2">
          <div className="relative">
            <ObeliskLogo className="mx-auto size-9" />
          </div>
          {isWaiting ? (
            <div className="mt-8 space-y-7 text-center">
              <div className="space-y-3">
                <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-warning/10 text-warning">
                  <Clock3Icon className="size-5" />
                </div>
                <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
                  Pending
                </span>
                <div className="space-y-1">
                  <h1 className="font-medium text-2xl tracking-[-0.015em]">
                    Request pending
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Your application for the{" "}
                    <span className="font-medium text-foreground">
                      {pendingRole}
                    </span>{" "}
                    role is being reviewed by an administrator.
                  </p>
                </div>
              </div>

              <dl className="mx-auto w-full max-w-sm space-y-2.5 rounded-lg border border-border/70 bg-background/60 p-4 text-left text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">Account</dt>
                  <dd className="truncate font-medium">{user.email}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">
                    Requested role
                  </dt>
                  <dd className="flex items-center gap-1.5 font-medium">
                    <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                    {pendingRole}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">Submitted</dt>
                  <dd className="font-medium">{submittedAt}</dd>
                </div>
              </dl>

              <ol className="mx-auto w-full max-w-sm space-y-3 text-left text-sm">
                <li className="flex items-start gap-3">
                  <CheckCheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
                  <div>
                    <p className="font-medium">Request submitted</p>
                    <p className="text-xs text-muted-foreground">
                      You chose the role you are applying for.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Clock3Icon className="mt-0.5 size-4 shrink-0 text-warning" />
                  <div>
                    <p className="font-medium text-warning">Under review</p>
                    <p className="text-xs text-muted-foreground">
                      An administrator is reviewing your request.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 size-3.5 shrink-0 rounded-full border-2 border-muted-foreground/30" />
                  <div>
                    <p className="font-medium text-muted-foreground">
                      Approved
                    </p>
                    <p className="text-xs text-muted-foreground">
                      You will get access to the dashboard once approved.
                    </p>
                  </div>
                </li>
              </ol>

              <SignOutButton />
            </div>
          ) : (
            <>
              <h1 className="mt-3 text-center font-medium text-2xl tracking-[-0.015em]">
                Choose your role
              </h1>
              <p className="mt-1 text-center text-sm text-muted-foreground">
                Signed in as {user.email}. Pick the role you are applying for;
                an administrator will approve it.
              </p>
              <div className="mt-10">
                <OnboardingForm />
              </div>
              <div className="mt-6">
                <SignOutButton />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
