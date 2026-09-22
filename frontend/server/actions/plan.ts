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

// ---------------------------------------------------------------------------
// CLO-PLO Mapping
// ---------------------------------------------------------------------------

export interface CloPloMapDto {
  id: string;
  cloId: string;
  ploId: string;
  weight: number;
  stage: string | null;
  clo: { code: string; description: string; courseId: string };
  plo: { code: string; description: string };
}

export interface CloEntity {
  id: string;
  code: string;
  description: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
}

export interface PloEntity {
  id: string;
  code: string;
  description: string;
}

export async function listCloPloMaps(
  programId: string,
  courseId?: string,
): Promise<ActionResult<CloPloMapDto[]>> {
  try {
    const params = new URLSearchParams({ programId });
    if (courseId) params.set("courseId", courseId);
    const data = await actionApi.get<CloPloMapDto[]>(
      `/plan/clo-plo-map?${params.toString()}`,
    );
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to load CLO-PLO mappings."),
    };
  }
}

export async function listCloPloEntities(
  programId: string,
): Promise<ActionResult<{ clos: CloEntity[]; plos: PloEntity[] }>> {
  try {
    const data = await actionApi.get<{ clos: CloEntity[]; plos: PloEntity[] }>(
      `/plan/clo-plo-map/entities?programId=${programId}`,
    );
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to load CLOs and PLOs."),
    };
  }
}

export async function createCloPloMap(body: {
  cloId: string;
  ploId: string;
  weight?: number;
  stage?: string;
}): Promise<ActionResult<CloPloMapDto>> {
  try {
    const data = await actionApi.post<CloPloMapDto>("/plan/clo-plo-map", body);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to create CLO-PLO mapping."),
    };
  }
}

export async function updateCloPloMap(
  id: string,
  body: { weight?: number; stage?: string },
): Promise<ActionResult<CloPloMapDto>> {
  try {
    const data = await actionApi.put<CloPloMapDto>(
      `/plan/clo-plo-map/${id}`,
      body,
    );
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to update CLO-PLO mapping."),
    };
  }
}

export async function deleteCloPloMap(id: string): Promise<ActionResult<void>> {
  try {
    await actionApi.delete(`/plan/clo-plo-map/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to delete CLO-PLO mapping."),
    };
  }
}

// ---------------------------------------------------------------------------
// PLO Entity CRUD
// ---------------------------------------------------------------------------

export interface PloRecord {
  id: string;
  programId: string;
  code: string;
  description: string;
  targetAttainmentPct: number;
}

export async function listPlos(
  programId: string,
): Promise<ActionResult<PloRecord[]>> {
  try {
    const data = await actionApi.get<PloRecord[]>("/plan/plos", { programId });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Failed to load PLOs.") };
  }
}

export async function createPlo(body: {
  programId: string;
  code: string;
  description: string;
  targetAttainmentPct?: number;
}): Promise<ActionResult<PloRecord>> {
  try {
    const data = await actionApi.post<PloRecord>("/plan/plos", body);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Failed to create PLO.") };
  }
}

export async function updatePlo(
  id: string,
  body: {
    code?: string;
    description?: string;
    targetAttainmentPct?: number;
  },
): Promise<ActionResult<PloRecord>> {
  try {
    const data = await actionApi.put<PloRecord>(`/plan/plos/${id}`, body);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Failed to update PLO.") };
  }
}

export async function deletePlo(id: string): Promise<ActionResult<void>> {
  try {
    await actionApi.delete(`/plan/plos/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Failed to delete PLO.") };
  }
}
