/**
 * "Latest submission payload" resolver used by the dashboard chart atoms.
 *
 * The backend's rollup / CQI / PLAN read routes are submission-scoped (see
 * `backend/SYSTEM-DESIGN.md` §4 and each `src/v1/<feature>/model.ts`):
 *
 *   GET /<form>        → list of submissions (id, createdAt, status, …)
 *   GET /<form>/:id    → assembled payload (the actual chart data)
 *
 * There is no "latest payload" route, so a dashboard resolves the newest
 * submission itself and then fetches that submission's payload.
 *
 * Returns `null` when nothing has been submitted yet, so callers can seed an
 * honest empty chart (`[]`) instead of fabricated numbers.
 */

import { api } from "@/lib/api-client";

/** Fields the resolver reads off every `*SubmissionListItem`. */
interface SubmissionListItem {
  id: string;
  /** ISO string in JSON — `Date` in the backend type. */
  createdAt: string;
}

/**
 * Fetch the payload of the newest submission in `listPath`.
 *
 * @param listPath   route returning the submission list (e.g. `/rollup/clo-attainment-summary`)
 * @param payloadPath builds the payload route for a submission id
 * @param signal     abort signal forwarded from the atom fetcher
 */
export async function fetchLatestPayload<TPayload>(
  listPath: string,
  payloadPath: (id: string) => string,
  signal?: AbortSignal,
): Promise<TPayload | null> {
  const list = await api.get<SubmissionListItem[]>(listPath, { signal });

  let newest: SubmissionListItem | undefined;
  for (const item of list) {
    if (!newest || Date.parse(item.createdAt) > Date.parse(newest.createdAt)) {
      newest = item;
    }
  }
  if (!newest) return null;

  return api.get<TPayload>(payloadPath(newest.id), { signal });
}

/**
 * Strip the backend's `N-` numeric prefix from a 6-category root-cause value
 * (`1-Curriculum Design` → `Curriculum Design`), falling back to the raw string
 * when it carries no prefix. Mirrors `backend/lib/validators/root-cause.ts`.
 */
export function stripRootCausePrefix(category: string): string {
  return category.replace(/^\d+-/, "");
}
