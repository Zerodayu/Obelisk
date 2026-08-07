"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SelectRole } from "@/components/auth/select-role";
import { Button } from "@/components/ui/button";
import { fileRoleRequest } from "@/server/actions/auth";

/**
 * Post-login role selection. New Google accounts sign in without a role; they
 * pick one here and a system_admin approves it before it is granted.
 */
export const OnboardingForm = () => {
  const router = useRouter();
  const [requestedRole, setRequestedRole] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (!requestedRole) {
      setError("Select the role you are applying for.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await fileRoleRequest(requestedRole);
    if (!result.ok) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setSubmitting(false);
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
