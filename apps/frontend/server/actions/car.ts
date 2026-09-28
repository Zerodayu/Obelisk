/**
 * CAR (Course Assessment Report) server actions.
 *
 * Generate, fetch, and save the 7-part CAR payload. Read operations use the
 * browser `api` client via atoms; mutations go through `actionApi` here.
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

export async function generateCar(params: {
  classSectionId: string;
  computationRunId?: string;
}): Promise<
  ActionResult<{ draft: { id: string }; payload: Record<string, unknown> }>
> {
  try {
    const data = await actionApi.post<{
      draft: { id: string };
      payload: Record<string, unknown>;
    }>("/car/generate", params);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to generate CAR. Please try again."),
    };
  }
}

export async function saveCar(
  id: string,
  parts: {
    part1?: Record<string, unknown>;
    part5?: Record<string, unknown>[];
    part6?: Record<string, unknown>;
    part7?: Record<string, unknown>;
  },
): Promise<ActionResult<{ id: string; formData: Record<string, unknown> }>> {
  try {
    const data = await actionApi.post<{
      id: string;
      formData: Record<string, unknown>;
    }>(`/car/${id}`, parts);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Failed to save CAR. Please try again."),
    };
  }
}
