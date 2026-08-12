/**
 * Attainment dataset atoms (CHECK phase roll-ups).
 *
 * Seeded with sample data that mirrors the backend Prisma schema — the
 * backend stays the source of truth and these atoms only render what a
 * rollup endpoint will return. Swap each `atomWithMockData` to
 * `atomWithAsyncData(seed, () => api.get(...))` when the endpoint lands.
 */

import {
  type CloAttainmentDatum,
  type CohortTrendDatum,
  MOCK_CLO_ATTAINMENTS,
  MOCK_COHORT_TRENDS,
  MOCK_PLO_ATTAINMENTS,
  MOCK_SCORE_BANDS,
  type PloAttainmentDatum,
  type ScoreBandDatum,
} from "@/components/charts/obe-sample-data";
import { atomWithMockData } from "@/lib/store/async-atom";

/** Per-CLO attainment rows (`CloAttainment`) for the active computation run. */
export const {
  dataAtom: cloAttainmentsDataAtom,
  refreshAtom: refreshCloAttainmentsAtom,
} = atomWithMockData<CloAttainmentDatum[]>(MOCK_CLO_ATTAINMENTS);

/** Per-PLO attainment vs target (`PloAttainment` + `Plo.targetAttainmentPct`). */
export const {
  dataAtom: ploAttainmentsDataAtom,
  refreshAtom: refreshPloAttainmentsAtom,
} = atomWithMockData<PloAttainmentDatum[]>(MOCK_PLO_ATTAINMENTS);

/** Longitudinal per-cohort composite attainment series (cohort tracking). */
export const {
  dataAtom: cohortTrendsDataAtom,
  refreshAtom: refreshCohortTrendsAtom,
} = atomWithMockData<CohortTrendDatum[]>(MOCK_COHORT_TRENDS);

/** Distribution of students across the 4-tier rubric bands. */
export const {
  dataAtom: scoreBandsDataAtom,
  refreshAtom: refreshScoreBandsAtom,
} = atomWithMockData<ScoreBandDatum[]>(MOCK_SCORE_BANDS);
