"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";

interface RoleRequestProgram {
  id: string;
  name: string;
  code: string;
}

interface RoleRequestDepartment {
  id: string;
  name: string;
  code: string;
}

interface RoleRequestUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  requestedRole: UserRole;
  roleRequestStatus: "none" | "pending" | "approved" | "denied";
  employeeId?: string | null;
  program?: RoleRequestProgram | null;
  department?: RoleRequestDepartment | null;
  isActive: boolean;
  createdAt: string;
}

export function RoleRequestsPanel() {
  const [requests, setRequests] = useState<RoleRequestUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await api.get<RoleRequestUser[]>("/auth/role-requests"));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load role requests.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(userId: string, action: "approve" | "deny") {
    setBusyId(userId);
    setError(null);
    try {
      await api.post(`/auth/role-requests/${userId}/${action}`);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Action failed. Please retry.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Role requests</h3>
          <p className="text-xs text-muted-foreground">
            Approve or deny pending role requests from new accounts.
          </p>
        </div>
        <Button
          disabled={loading}
          onClick={() => void load()}
          size="sm"
          type="button"
          variant="outline"
        >
          Refresh
        </Button>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Loading pending requests…
        </p>
      ) : requests.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No pending role requests.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {requests.map((request) => (
            <li
              key={request.id}
              className="flex flex-wrap items-center gap-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{request.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {request.email}
                </p>
                <p className="mt-1 text-xs">
                  <span className="font-medium">
                    {ROLE_LABELS[request.requestedRole]}
                  </span>
                  {" · "}
                  {[request.program?.name, request.department?.name]
                    .filter(Boolean)
                    .join(" · ") || "No program/department on file"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={busyId === request.id}
                  onClick={() => void decide(request.id, "approve")}
                  size="sm"
                  type="button"
                >
                  Approve
                </Button>
                <Button
                  disabled={busyId === request.id}
                  onClick={() => void decide(request.id, "deny")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Deny
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
