/**
 * CQI/ACT-phase dataset atoms (gap analysis, action plans, closing-the-loop).
 *
 * Mock-seeded until the corresponding backend endpoints land; swap each
 * `atomWithMockData` to `atomWithAsyncData(seed, () => api.get(...))` when
 * they do.
 */

import {
  type CqiActionDatum,
  type LoopStatusDatum,
  MOCK_CQI_ACTIONS,
  MOCK_LOOP_STATUSES,
  MOCK_PLO_GAPS,
  MOCK_ROOT_CAUSES,
  type PloGapDatum,
  type RootCauseDatum,
} from "@/components/charts/obe-sample-data";
import { atomWithMockData } from "@/lib/store/async-atom";

/** PLO gap-analysis rows (attained vs target). */
export const { dataAtom: ploGapsDataAtom, refreshAtom: refreshPloGapsAtom } =
  atomWithMockData<PloGapDatum[]>(MOCK_PLO_GAPS);

/** 6-category root-cause distribution. */
export const {
  dataAtom: rootCausesDataAtom,
  refreshAtom: refreshRootCausesAtom,
} = atomWithMockData<RootCauseDatum[]>(MOCK_ROOT_CAUSES);

/** CQI action plans — planned vs completed per root-cause category. */
export const {
  dataAtom: cqiActionsDataAtom,
  refreshAtom: refreshCqiActionsAtom,
} = atomWithMockData<CqiActionDatum[]>(MOCK_CQI_ACTIONS);

/** Closing-the-Loop status distribution (computed server-side). */
export const {
  dataAtom: loopStatusesDataAtom,
  refreshAtom: refreshLoopStatusesAtom,
} = atomWithMockData<LoopStatusDatum[]>(MOCK_LOOP_STATUSES);
