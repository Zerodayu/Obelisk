"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SelectRole } from "@/components/auth/select-role";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api-client";

/**
 * Post-login role selection. New Google accounts sign in without a role; they
 * pick one here and a system_admin approves it before it is granted.
 */
export const OnboardingForm = () => {
  const router = useRouter();
  const [requestedRole, setRequestedRole] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit() {
    if (!requestedRole) {
      setError("Select the role you are applying for.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/auth/role-request", { requestedRole });
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          ✓
        </div>
        <div className="space-y-1">
          <p className="font-medium text-base">Request submitted</p>
          <p className="text-sm text-muted-foreground">
            An administrator must approve your request before you gain access to
            this role.
          </p>
        </div>
        <Button
          className="w-full hover:cursor-pointer"
          onClick={() => router.push("/dashboard")}
          size="lg"
          type="button"
        >
          Go to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <span className="text-sm font-medium">Requested role</span>
        <SelectRole
          className="w-full"
          onValueChange={(value) => {
            setRequestedRole(value);
            setError(null);
          }}
          value={requestedRole}
        />
        <p className="text-xs text-muted-foreground">
          An administrator must approve your request before you gain access to
          this role.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        className="w-full hover:cursor-pointer"
        disabled={submitting || !requestedRole}
        onClick={() => void onSubmit()}
        size="lg"
        type="button"
      >
        {submitting ? "Submitting…" : "Request role"}
      </Button>
    </div>
  );
};
