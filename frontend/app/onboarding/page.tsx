import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/onboarding-form";
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

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="mx-auto w-full border border-border/70 pb-0 max-sm:border-t-0 sm:max-w-md sm:rounded-xl sm:bg-card sm:p-1 sm:shadow-lg/3">
        <div className="border border-border/70 bg-muted/60 px-10 py-14 max-sm:border-x-0 sm:rounded-lg sm:shadow-sm/2">
          <ObeliskLogo className="mx-auto size-9" />
          {isWaiting ? (
            <div className="mt-8 flex flex-col items-center gap-5 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                ⏳
              </div>
              <div className="space-y-1">
                <h1 className="font-medium text-2xl tracking-[-0.015em]">
                  Request pending
                </h1>
                <p className="text-sm text-muted-foreground">
                  Your application for the{" "}
                  <span className="font-medium text-foreground">
                    {pendingRole}
                  </span>{" "}
                  role is being reviewed by an administrator. You will get
                  access once it is approved.
                </p>
              </div>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
