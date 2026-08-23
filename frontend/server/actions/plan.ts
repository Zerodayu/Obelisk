/**
 * PLAN-phase server actions — curriculum map, assessment calendar,
 * target-setting matrix, and assessment budget.
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
// Curriculum Map
// ---------------------------------------------------------------------------

export async function initCurriculumMap(params: {
  programId: string;
  termId: string;
}): Promise<
  ActionResult<{ draft: { id: string }; payload: Record<string, unknown> }>
> {
  try {
    const data = await actionApi.post<{
      draft: { id: string };
      payload: Record<string, unknown>;
    }>("/plan/curriculum-map/init", params);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to initialize curriculum map. Please try again.",
      ),
    };
  }
}

export async function saveCurriculumMap(
  id: string,
  body: {
    header?: Record<string, unknown>;
    plos: {
      ploCode: string;
      statement: string;
      evidenceSources: string[];
      dStageCourse?: string;
      validationStatus?: string;
    }[];
    courses: {
      yearLevel: number;
      courseCode: string;
      courseTitle: string;
      cells: {
        ploCode: string;
        stage?: string;
        cloCodes?: string;
      }[];
    }[];
  },
): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const data = await actionApi.post<Record<string, unknown>>(
      `/plan/curriculum-map/${id}`,
      body,
    );
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to save curriculum map. Please try again.",
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// Assessment Calendar
// ---------------------------------------------------------------------------

export async function initAssessmentCalendar(params: {
  programId: string;
  termId: string;
}): Promise<
  ActionResult<{ draft: { id: string }; payload: Record<string, unknown> }>
> {
  try {
    const data = await actionApi.post<{
      draft: { id: string };
      payload: Record<string, unknown>;
    }>("/plan/assessment-calendar/init", params);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to initialize assessment calendar. Please try again.",
      ),
    };
  }
}

export async function saveAssessmentCalendar(
  id: string,
  body: {
    header?: Record<string, unknown>;
    events: {
      id?: string;
      section: string;
      templateKey?: string;
      periodWeeks?: string;
      activity?: string;
      cohortYears?: number[];
      responsibleParty?: string;
      outputForms?: string[];
    }[];
    removeEventIds?: string[];
  },
): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const data = await actionApi.post<Record<string, unknown>>(
      `/plan/assessment-calendar/${id}`,
      body,
    );
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to save assessment calendar. Please try again.",
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// Target-Setting Matrix
// ---------------------------------------------------------------------------

export async function initTargetSettingMatrix(params: {
  programId: string;
  termId: string;
}): Promise<
  ActionResult<{ draft: { id: string }; payload: Record<string, unknown> }>
> {
  try {
    const data = await actionApi.post<{
      draft: { id: string };
      payload: Record<string, unknown>;
    }>("/plan/target-setting-matrix/init", params);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to initialize target-setting matrix. Please try again.",
      ),
    };
  }
}

export async function saveTargetSettingMatrix(
  id: string,
  body: {
    header?: Record<string, unknown>;
    ploRows: {
      ploCode: string;
      statement?: string;
      y1TargetPct: number;
      y2TargetPct: number;
      y3TargetPct: number;
      y4TargetPct: number;
      rationale?: string;
    }[];
    courseRows: {
      courseCode: string;
      courseTitle?: string;
      cloCode: string;
      y1TargetPct?: number;
      y2TargetPct?: number;
      y3TargetPct?: number;
      y4TargetPct?: number;
      notes?: string;
    }[];
  },
): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const data = await actionApi.post<Record<string, unknown>>(
      `/plan/target-setting-matrix/${id}`,
      body,
    );
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to save target-setting matrix. Please try again.",
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// Assessment Budget
// ---------------------------------------------------------------------------

export async function initAssessmentBudget(params: {
  programId: string;
  termId: string;
}): Promise<
  ActionResult<{ draft: { id: string }; payload: Record<string, unknown> }>
> {
  try {
    const data = await actionApi.post<{
      draft: { id: string };
      payload: Record<string, unknown>;
    }>("/plan/assessment-budget/init", params);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to initialize assessment budget. Please try again.",
      ),
    };
  }
}

export async function saveAssessmentBudget(
  id: string,
  body: {
    header?: Record<string, unknown>;
    lineItems: {
      id?: string;
      phase?: string;
      name?: string;
      estimatedCost?: number;
      approvedCost?: number | null;
      source?: string | null;
      notes?: string | null;
    }[];
    removeLineItemIds?: string[];
  },
): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const data = await actionApi.post<Record<string, unknown>>(
      `/plan/assessment-budget/${id}`,
      body,
    );
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(
        err,
        "Failed to save assessment budget. Please try again.",
      ),
    };
  }
}
