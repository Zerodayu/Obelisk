/**
 * Rollup server actions — CLO attainment summary, PLO attainment summary,
 * and cohort tracking generation + annotation saves.
 */

"use server";

import { ApiError } from "@/lib/api-client";
import { actionApi } from "@/server/api-client";

export type ActionResult<TData = void> =
  | { ok: true; data: TData }
  | { ok: false; error: string };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// ---------------------------------------------------------------------------
// CLO Attainment Summary
// ---------------------------------------------------------------------------

export async function generateCloSummary(params: {
  classSectionId: string;
  computationRunId?: string;
}): Promise<
  ActionResult<{ draft: { id: string }; payload: Record<string, unknown> }>
> {
  try {
    const data = await actionApi.post<{
      draft: { id: string };
      payload: Record<string, unknown>;
    }>("/rollup/clo-attainment-summary/generate", params);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to generate CLO summary. Please try again.",
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// PLO Attainment Summary
// ---------------------------------------------------------------------------

export async function generatePloSummary(params: {
  programId: string;
  termId: string;
}): Promise<
  ActionResult<{ draft: { id: string }; payload: Record<string, unknown> }>
> {
  try {
    const data = await actionApi.post<{
      draft: { id: string };
      payload: Record<string, unknown>;
    }>("/rollup/plo-attainment-summary/generate", params);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to generate PLO summary. Please try again.",
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// Cohort Tracking
// ---------------------------------------------------------------------------

export async function generateCohortTracking(params: {
  programId: string;
  termId?: string;
}): Promise<
  ActionResult<{ draft: { id: string }; payload: Record<string, unknown> }>
> {
  try {
    const data = await actionApi.post<{
      draft: { id: string };
      payload: Record<string, unknown>;
    }>("/rollup/cohort-tracking/generate", params);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to generate cohort tracking. Please try again.",
      ),
    };
  }
}

export async function saveCohortAnnotations(
  id: string,
  annotations: {
    yearLevel: number | null;
    termId: string;
    cloCode: string;
    cqiFlag?: boolean;
    followUp: string;
  }[],
): Promise<
  ActionResult<{ id: string; annotations: Record<string, unknown>[] }>
> {
  try {
    const data = await actionApi.post<{
      id: string;
      annotations: Record<string, unknown>[];
    }>(`/rollup/cohort-tracking/${id}`, { annotations });
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to save annotations. Please try again.",
      ),
    };
  }
}
