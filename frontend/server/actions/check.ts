/**
 * CHECK-phase server actions — supporting instruments (F08–F19).
 *
 * The CHECK backend returns `{ id }` from init (unlike PLAN which returns
 * `{ draft, payload }`), so the frontend does init → get as a two-step flow.
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
// Form slug mapping (snake_case code → kebab-case URL path segment)
// ---------------------------------------------------------------------------

export const CHECK_FORM_SLUGS = {
  mid_cycle_attainment: "mid-cycle-attainment",
  peer_observation: "peer-observation",
  exhibition_feedback: "exhibition-feedback",
  clo_perception_survey: "clo-perception-survey",
  student_exit_survey: "student-exit-survey",
  portfolio_assessment_record: "portfolio-assessment",
  capstone_panel_evaluation: "capstone-panel",
} as const;

export type CheckFormCode = keyof typeof CHECK_FORM_SLUGS;

// ---------------------------------------------------------------------------
// Generic init / get / save
// ---------------------------------------------------------------------------

export async function initCheckForm(
  formCode: CheckFormCode,
  params: { programId: string; termId: string },
): Promise<ActionResult<{ id: string }>> {
  const slug = CHECK_FORM_SLUGS[formCode];
  try {
    const data = await actionApi.post<{ id: string }>(
      `/check/${slug}/init`,
      params,
    );
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to initialize form. Please try again."),
    };
  }
}

export async function getCheckForm<T>(
  formCode: CheckFormCode,
  id: string,
): Promise<ActionResult<T>> {
  const slug = CHECK_FORM_SLUGS[formCode];
  try {
    const data = await serverApi.get<T>(`/check/${slug}/${id}`);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to load form data. Please try again."),
    };
  }
}

export async function saveCheckForm<T>(
  formCode: CheckFormCode,
  id: string,
  body: Record<string, unknown>,
): Promise<ActionResult<T>> {
  const slug = CHECK_FORM_SLUGS[formCode];
  try {
    const data = await actionApi.put<T>(`/check/${slug}/${id}`, body);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to save. Please try again."),
    };
  }
}
