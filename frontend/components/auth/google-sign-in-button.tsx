"use client";

import { useState } from "react";
import { GoogleLogo } from "@/components/branding/icons";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api-client";

interface GoogleSignInButtonProps {
  /** Frontend path better-auth redirects the browser to after the OAuth exchange. */
  callbackURL: string;
  /** Frontend path the browser lands on when the OAuth exchange fails. */
  errorCallbackURL?: string;
  className?: string;
}

/**
 * Single "Continue with Google" entry point for login/register. Starts the
 * better-auth social flow: POSTs `/auth/sign-in/social` (returns the Google
 * authorize URL), then navigates the top-level window to it.
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
    try {
      const { url } = await api.post<{ url: string }>("/auth/sign-in/social", {
        provider: "google",
        callbackURL: new URL(callbackURL, window.location.origin).toString(),
        errorCallbackURL: errorCallbackURL
          ? new URL(errorCallbackURL, window.location.origin).toString()
          : undefined,
      });
      window.location.assign(url);
    } catch (err) {
      setSubmitting(false);
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not start Google sign-in. Please try again.",
      );
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
