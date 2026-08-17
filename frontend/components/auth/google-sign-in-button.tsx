"use client";

import { useState } from "react";
import { GoogleLogo } from "@/components/branding/icons";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";

interface GoogleSignInButtonProps {
  /** Frontend path better-auth redirects the browser to after the OAuth exchange. */
  callbackURL: string;
  /** Frontend path the browser lands on when the OAuth exchange fails. */
  errorCallbackURL?: string;
  className?: string;
}

/**
 * Single "Continue with Google" entry point for login/register. Starts the
 * better-auth social flow through the client: POSTs `/api/v1/auth/sign-in/social`
 * (proxied to the backend), then navigates to the returned Google authorize URL.
 */
export const GoogleSignInButton = ({
  callbackURL,
  errorCallbackURL,
  className,
}: GoogleSignInButtonProps) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setSubmitting(true);
    setError(null);
    const { data, error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: new URL(callbackURL, window.location.origin).toString(),
      errorCallbackURL: errorCallbackURL
        ? new URL(errorCallbackURL, window.location.origin).toString()
        : undefined,
    });
    if (error) {
      setSubmitting(false);
      const message =
        error.message ?? "Could not start Google sign-in. Please try again.";
      setError(message);
      toastError({
        scope: "auth:google",
        title: "Google sign-in failed",
        description: message,
      });
      return;
    }
    if (data?.url && !data.redirect) {
      window.location.assign(data.url);
    }
  }

  return (
    <div className={className}>
      <Button
        className="w-full hover:cursor-pointer"
        disabled={submitting}
        onClick={() => void signIn()}
        size="lg"
        type="button"
      >
        <GoogleLogo className="mr-2 size-4" />
        {submitting ? "Redirecting…" : "Continue with Google"}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
};
