/**
 * At-risk / action-taken server actions (test 9.9).
 *
 * `GET /atrisk/flags` feeds the watchlist picker; `POST /at-risk/action/init`
 * opens (or reuses) the action-taken draft for a class section — term and
 * program are resolved server-side, so the client only picks the section.
 * Workflow decisions (submit/approve/return) reuse the generic actions in
 * `server/actions/forms.ts` — the approval chain and the flag-clearing side
 * effect are derived server-side from the form's stable code.
 */

"use server";

import { ApiError } from "@/lib/api-client";
import { actionApi, serverApi } from "@/server/api-client";

export type ActionResult<TData = void> =
  | { ok: true; data: TData }
  | { ok: false; error: string };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// ---------------------------------------------------------------------------
// DTOs (mirror `apps/backend/src/v1/atrisk`)
// ---------------------------------------------------------------------------

/** One `AtRiskFlag` row with its student + the CLO/section it points at. */
export interface AtRiskFlagRow {
  id: string;
  studentId: string;
  reason: string;
  flaggedAt: string;
  student: {
    id: string;
    studentNumber: string;
    firstName: string;
    lastName: string;
  };
  cloAttainment: {
    classSectionId: string | null;
    clo: { code: string };
  } | null;
}

/** The action-taken payload stored in `FormSubmission.formData`. */
export interface ActionTakenData {
  studentIds: string[];
  actionTaken: string;
}

// ---------------------------------------------------------------------------
// At-risk watchlist
// ---------------------------------------------------------------------------

/** List at-risk flags, optionally scoped to one class section. */
export async function listAtRiskFlags(
  classSectionId?: string,
): Promise<ActionResult<AtRiskFlagRow[]>> {
  try {
    const qs = classSectionId
      ? `?classSectionId=${encodeURIComponent(classSectionId)}`
      : "";
    const data = await serverApi.get<AtRiskFlagRow[]>(`/atrisk/flags${qs}`);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to load at-risk students. Please try again.",
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// Action-taken form (init / get / save)
// ---------------------------------------------------------------------------

/** Open (or reuse) the action-taken draft for a class section. */
export async function initActionTaken(
  classSectionId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const data = await actionApi.post<{ id: string }>("/atrisk/action/init", {
      classSectionId,
    });
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to open the form. Please try again."),
    };
  }
}

/** Load the full action-taken submission (status + steps + formData). */
export async function getActionTaken<T>(id: string): Promise<ActionResult<T>> {
  try {
    const data = await serverApi.get<T>(`/atrisk/action/${id}`);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to load the form. Please try again."),
    };
  }
}

/** Save the student selection + intervention note (draft/returned only). */
export async function saveActionTaken<T>(
  id: string,
  body: ActionTakenData,
): Promise<ActionResult<T>> {
  try {
    const data = await actionApi.put<T>(`/atrisk/action/${id}`, body);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to save. Please try again."),
    };
  }
}
