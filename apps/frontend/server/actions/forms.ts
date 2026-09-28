/**
 * Approval-workflow server actions — submit, approve, return, archive.
 *
 * These are the only places the client mutates a submission's workflow state.
 * The backend derives the approval chain from the form's registered route
 * (`backend/lib/forms/approval-routes.ts`) and enforces ownership + role
 * matches; the actions only forward the browser session.
 */

"use server";

import { ApiError } from "@/lib/api-client";
import { actionApi } from "@/server/api-client";

/** Approver roles accepted by the workflow endpoints (`ApproverRole` enum). */
export type ApproverRoleValue = "program_chair" | "dean" | "aqau" | "vpaa";

export type WorkflowActionResult<TData = void> =
  | { ok: true; data: TData }
  | { ok: false; error: string; status?: number };

function workflowFailure(
  err: unknown,
  fallback: string,
): {
  ok: false;
  error: string;
  status?: number;
} {
  return {
    ok: false,
    error: err instanceof ApiError ? err.message : fallback,
    status: err instanceof ApiError ? err.status : undefined,
  };
}

/** Submit a draft/returned submission → derives the server-side approval chain. */
export async function submitFormAction(
  id: string,
): Promise<WorkflowActionResult> {
  try {
    await actionApi.post<unknown>(`/forms/${id}/submit`, {});
    return { ok: true, data: undefined };
  } catch (err) {
    return workflowFailure(err, "Failed to submit for approval.");
  }
}

/** Approve the pending step for `role` (must match the caller's role). */
export async function approveFormAction(
  id: string,
  role: ApproverRoleValue,
  comment?: string,
): Promise<WorkflowActionResult> {
  try {
    await actionApi.post<unknown>(`/forms/${id}/approve/${role}`, {
      comment: comment || undefined,
    });
    return { ok: true, data: undefined };
  } catch (err) {
    return workflowFailure(err, "Failed to approve this step.");
  }
}

/** Return the pending step for `role` with a required reviewer comment. */
export async function returnFormAction(
  id: string,
  role: ApproverRoleValue,
  comment: string,
): Promise<WorkflowActionResult> {
  try {
    await actionApi.post<unknown>(`/forms/${id}/return`, { role, comment });
    return { ok: true, data: undefined };
  } catch (err) {
    return workflowFailure(err, "Failed to return this submission.");
  }
}

/** Archive an approved submission (aqau/vpaa/system_admin only). */
export async function archiveFormAction(
  id: string,
): Promise<WorkflowActionResult> {
  try {
    await actionApi.post<unknown>(`/forms/${id}/archive`, {});
    return { ok: true, data: undefined };
  } catch (err) {
    return workflowFailure(err, "Failed to archive this submission.");
  }
}
