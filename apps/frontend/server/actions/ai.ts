/**
 * AI CQI-recommendation server actions — dashboard AI drawer.
 *
 * Backed by `/api/v1/ai/recommendation/*` (backend `src/v1/ai`), which
 * replays stored ETL snapshots into python-server's
 * `/analytics/institutional-summary`. Generation is role-gated server-side
 * (vpaa/system_admin) — these actions only relay the backend's verdict.
 */

"use server";

import { ApiError } from "@/lib/api-client";
import { actionApi } from "@/server/api-client";

export type ActionResult<TData = void> =
  | { ok: true; data: TData }
  | { ok: false; error: string };

/** One critical CLO row (worst-performing rollup, real computed data). */
export interface WorstPerformingClo {
  groupName: string;
  key: string;
  cloCode: string;
  /** Mean attainment in percent points (0–100), one decimal. */
  meanAttainmentPct: number;
  recordCount: number;
}

/** Client view of an `AiRecommendation` row (mirrors backend compute.ts). */
export interface AiRecommendation {
  id: string;
  generatedAt: string;
  status: "pending_review" | "acknowledged" | "actioned" | "dismissed" | string;
  period: { type: string; label: string } | null;
  term: { schoolYear: string; semester: string } | null;
  /** Markdown text from the LLM (or its debug stub while IS_DEBUG_MODE=True). */
  recommendationText: string;
  worstPerformingClos: WorstPerformingClo[];
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** Latest persisted recommendation, or null when none exists yet. */
export async function getLatestAiRecommendationAction(): Promise<
  ActionResult<AiRecommendation | null>
> {
  try {
    const data = await actionApi.get<{
      recommendation: AiRecommendation | null;
    }>("/ai/recommendation/latest");
    return { ok: true, data: data.recommendation };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to load AI insights. Please try again."),
    };
  }
}

/**
 * Generate + persist a fresh recommendation (vpaa/system_admin only; the
 * backend returns 403 otherwise). Slow by design — it runs an LLM call.
 */
export async function generateAiRecommendationAction(): Promise<
  ActionResult<AiRecommendation>
> {
  try {
    const data = await actionApi.post<{ recommendation: AiRecommendation }>(
      "/ai/recommendation/generate",
    );
    return { ok: true, data: data.recommendation };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to generate AI insights. Please try again.",
      ),
    };
  }
}
