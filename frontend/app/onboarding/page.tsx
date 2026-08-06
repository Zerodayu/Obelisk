import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { Logo } from "@/components/branding/logo";
import { DEV_ENFORCE_ROLE_ACCESS, isDevMode } from "@/lib/dev-mode";
import { requireUser } from "@/server/auth";

/**
 * `/onboarding` — post-login role selection. New accounts signed in through the
 * org-restricted Google provider have no role yet; they choose one here and a
 * system_admin approves it. Users who already have a role or a request on file
 * are sent straight to the dashboard. In dev mode the route stays previewable
 * unless `DEV_ENFORCE_ROLE_ACCESS` is enabled (mirrors `requireRole`).
 */
const Onboarding = async () => {
  const user = await requireUser();

  const needsOnboarding =
    user.role === "user" && user.roleRequestStatus === "none";
  if ((!isDevMode || DEV_ENFORCE_ROLE_ACCESS) && !needsOnboarding) {
    redirect("/dashboard");
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="mx-auto w-full border border-border/70 pb-0 max-sm:border-t-0 sm:max-w-md sm:rounded-xl sm:bg-card sm:p-1 sm:shadow-lg/3">
        <div className="border border-border/70 bg-muted/60 px-10 py-14 max-sm:border-x-0 sm:rounded-lg sm:shadow-sm/2">
          <Logo className="mx-auto size-9" />
          <h1 className="mt-3 text-center font-medium text-2xl tracking-[-0.015em]">
            Choose your role
          </h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            Signed in as {user.email}. Pick the role you are applying for; an
            administrator will approve it.
          </p>

          <div className="mt-10">
            <OnboardingForm />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
