"use client";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

/**
 * Create-account entry point. New accounts are created exclusively through the
 * org-restricted Google provider (only organization email addresses are
 * allowed). Roles are selected afterwards on `/onboarding`, not here.
 */
export const RegisterForm = () => {
  return (
    <div className="space-y-6">
      <GoogleSignInButton
        callbackURL="/onboarding"
        errorCallbackURL="/register"
      />
      <p className="text-center text-xs text-muted-foreground">
        Only accounts from your organization&apos;s email domain can sign up.
      </p>
    </div>
  );
};
