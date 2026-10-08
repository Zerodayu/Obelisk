"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SelectDepartment } from "@/components/auth/select-department";
import { SelectProgram } from "@/components/auth/select-program";
import { SelectRole } from "@/components/auth/select-role";
import { Button } from "@/components/ui/button";
import { toast, toastError } from "@/components/ui/toast";
import { roleNeedsDepartment, roleNeedsProgram } from "@/lib/roles";
import type {
  AcademicDepartment,
  AcademicProgram,
} from "@/lib/store/atoms/academic";
import { listDepartments, listPrograms } from "@/server/actions/academic";
import { fileRoleRequest } from "@/server/actions/auth";

/**
 * Post-login role selection. New Google accounts sign in without a role; they
 * pick one here and a system_admin approves it before it is granted.
 *
 * Each program-scoped role names its scope (`REQUESTED_SCOPE` in
 * `lib/roles.ts`, enforced server-side in
 * `apps/backend/src/v1/auth/model.ts`): faculty/program_chair pick the program
 * they teach in, a dean picks the department that covers its programs, and the
 * institution-wide roles (aqau/vpaa) pick neither. The block only renders for
 * the selected role and resets whenever the role changes.
 */
export const OnboardingForm = () => {
  const router = useRouter();
  const [requestedRole, setRequestedRole] = useState<string>();
  const [programId, setProgramId] = useState<string>();
  const [departmentId, setDepartmentId] = useState<string>();
  const [programs, setPrograms] = useState<AcademicProgram[]>([]);
  const [departments, setDepartments] = useState<AcademicDepartment[]>([]);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reference data for the selects — fetched once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [programsResult, departmentsResult] = await Promise.all([
        listPrograms(),
        listDepartments(),
      ]);
      if (cancelled) return;
      if (programsResult.ok) setPrograms(programsResult.data);
      else setReferenceError(programsResult.error);
      if (departmentsResult.ok) setDepartments(departmentsResult.data);
      else setReferenceError((current) => current ?? departmentsResult.error);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const needsProgram = roleNeedsProgram(requestedRole);
  const needsDepartment = roleNeedsDepartment(requestedRole);

  async function onSubmit() {
    if (!requestedRole) {
      const message = "Select the role you are applying for.";
      setError(message);
      toastError({
        scope: "onboarding",
        title: "Role required",
        description: message,
      });
      return;
    }
    if (needsProgram && !programId) {
      const message = "Select the program you belong to.";
      setError(message);
      toastError({
        scope: "onboarding",
        title: "Program required",
        description: message,
      });
      return;
    }
    if (needsDepartment && !departmentId) {
      const message = "Select your department.";
      setError(message);
      toastError({
        scope: "onboarding",
        title: "Department required",
        description: message,
      });
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await fileRoleRequest(requestedRole, {
      programId,
      departmentId,
    });
    if (!result.ok) {
      setError(result.error);
      toastError({
        scope: "onboarding",
        title: "Request failed",
        description: result.error,
      });
    } else {
      toast.success({ title: "Role request submitted" });
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
            // Scope follows the role — drop stale picks so a hidden selection
            // can never ride along with the request.
            setProgramId(undefined);
            setDepartmentId(undefined);
            setError(null);
          }}
          value={requestedRole}
        />
        <p className="text-xs text-muted-foreground">
          An administrator must approve your request before you gain access to
          this role.
        </p>
      </div>

      {needsProgram && (
        <div className="space-y-2">
          <span className="text-sm font-medium">Program</span>
          <SelectProgram
            className="w-full"
            disabled={programs.length === 0}
            onValueChange={(value) => {
              setProgramId(value);
              setError(null);
            }}
            placeholder={
              programs.length === 0
                ? referenceError
                  ? "Programs unavailable"
                  : "Loading programs…"
                : "Select a program"
            }
            programs={programs}
            value={programId}
          />
          <p className="text-xs text-muted-foreground">
            The program you teach in or handle (e.g. BSIT, BSMC).
          </p>
        </div>
      )}

      {needsDepartment && (
        <div className="space-y-2">
          <span className="text-sm font-medium">Department</span>
          <SelectDepartment
            className="w-full"
            departments={departments}
            disabled={departments.length === 0}
            onValueChange={(value) => {
              setDepartmentId(value);
              setError(null);
            }}
            placeholder={
              departments.length === 0
                ? referenceError
                  ? "Departments unavailable"
                  : "Loading departments…"
                : "Select a department"
            }
            value={departmentId}
          />
          <p className="text-xs text-muted-foreground">
            Every program under this department falls under your review as Dean.
          </p>
        </div>
      )}

      {referenceError && (
        <p className="text-xs text-destructive">{referenceError}</p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        className="w-full hover:cursor-pointer"
        disabled={
          submitting ||
          !requestedRole ||
          (needsProgram && !programId) ||
          (needsDepartment && !departmentId)
        }
        onClick={() => void onSubmit()}
        type="button"
      >
        {submitting ? "Submitting…" : "Request role"}
      </Button>
    </div>
  );
};
