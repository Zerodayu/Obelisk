/**
 * CQI / ACT Loop server actions — gap analysis, action plan, closing-the-loop,
 * and annual program assessment report (APAR).
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
// PLO Gap Analysis
// ---------------------------------------------------------------------------

export async function generatePloGapAnalysis(params: {
  programId: string;
  termId: string;
}): Promise<
  ActionResult<{ draft: { id: string }; payload: Record<string, unknown> }>
> {
  try {
    const data = await actionApi.post<{
      draft: { id: string };
      payload: Record<string, unknown>;
    }>("/cqi/plo-gap-analysis/generate", params);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to generate gap analysis. Please try again.",
      ),
    };
  }
}

export async function savePloGapAnalysis(
  id: string,
  body: {
    gapRows: {
      id: string;
      rootCauseCategory?: string;
      rootCauseAnalysis?: string;
      namedOwner?: string;
    }[];
    programChairSummary?: string;
  },
): Promise<
  ActionResult<{ id: string; gapRows: Record<string, unknown>[] }>
> {
  try {
    const data = await actionApi.post<{
      id: string;
      gapRows: Record<string, unknown>[];
    }>(`/cqi/plo-gap-analysis/${id}`, body);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to save gap analysis. Please try again."),
    };
  }
}

// ---------------------------------------------------------------------------
// CQI Action Plan
// ---------------------------------------------------------------------------

export async function generateCqiActionPlan(params: {
  programId: string;
  termId: string;
}): Promise<
  ActionResult<{ draft: { id: string }; payload: Record<string, unknown> }>
> {
  try {
    const data = await actionApi.post<{
      draft: { id: string };
      payload: Record<string, unknown>;
    }>("/cqi/cqi-action-plan/generate", params);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to generate CQI action plan. Please try again.",
      ),
    };
  }
}

export async function saveCqiActionPlan(
  id: string,
  entries: {
    id: string;
    evidenceSource?: string;
    rootCauseCategory?: string;
    intervention?: string;
    owner?: string;
    ownerRole?: string;
    timelineAndKpi?: string;
  }[],
): Promise<ActionResult<{ id: string; entries: Record<string, unknown>[] }>> {
  try {
    const data = await actionApi.post<{
      id: string;
      entries: Record<string, unknown>[];
    }>(`/cqi/cqi-action-plan/${id}`, { entries });
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to save CQI action plan. Please try again.",
      ),
    };
  }
}

export async function trackCqiEntries(
  id: string,
  entries: {
    id: string;
    interventionImplemented: "yes" | "partial" | "no";
    currentAttainmentPct?: number;
  }[],
): Promise<ActionResult<{ id: string; updated: number }>> {
  try {
    const data = await actionApi.post<{ id: string; updated: number }>(
      `/cqi/cqi-action-plan/${id}/track`,
      { entries },
    );
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to track entries. Please try again."),
    };
  }
}

// ---------------------------------------------------------------------------
// Closing-the-Loop (CTL)
// ---------------------------------------------------------------------------

export async function generateCtl(params: {
  programId: string;
  termId: string;
}): Promise<
  ActionResult<{ draft: { id: string }; payload: Record<string, unknown> }>
> {
  try {
    const data = await actionApi.post<{
      draft: { id: string };
      payload: Record<string, unknown>;
    }>("/cqi/closing-the-loop/generate", params);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to generate Closing-the-Loop report. Please try again.",
      ),
    };
  }
}

export async function saveCtl(
  id: string,
  body: {
    rows: {
      id: string;
      gapFindingAndEvidence?: string;
      interventionImplementedText?: string;
      priorAttainmentPct?: number;
      currentAttainmentPct?: number;
      conditions12Met?: boolean;
      condition3Met?: boolean;
      condition4Met?: boolean;
      condition5Met?: boolean;
    }[];
    identify?: {
      c1PriorCycleKpisAchieved?: string;
      c2PreviouslyMetDeclining?: string;
      c3ExternalShifts?: string;
      c4ProactiveImprovements?: string;
    };
  },
): Promise<ActionResult<{ id: string; rows: number }>> {
  try {
    const data = await actionApi.post<{ id: string; rows: number }>(
      `/cqi/closing-the-loop/${id}`,
      body,
    );
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to save CTL report. Please try again."),
    };
  }
}

// ---------------------------------------------------------------------------
// Annual Program Assessment Report (APAR)
// ---------------------------------------------------------------------------

export async function generateApar(params: {
  programId: string;
  termId?: string;
}): Promise<
  ActionResult<{ draft: { id: string }; payload: Record<string, unknown> }>
> {
  try {
    const data = await actionApi.post<{
      draft: { id: string };
      payload: Record<string, unknown>;
    }>("/cqi/annual-program-report/generate", params);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to generate APAR. Please try again."),
    };
  }
}

export async function saveApar(
  id: string,
  body: {
    attachments?: Record<string, boolean>;
    narratives?: Record<string, string>;
    dashboard?: { kpiCode: string; value?: number }[];
  },
): Promise<ActionResult<{ id: string }>> {
  try {
    const data = await actionApi.post<{ id: string }>(
      `/cqi/annual-program-report/${id}`,
      body,
    );
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to save APAR. Please try again."),
    };
  }
}
