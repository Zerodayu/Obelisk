/**
 * CQI/ACT-phase dataset atoms (gap analysis, action plans, closing-the-loop).
 *
 * Backed by the CQI routes (`GET /cqi/*`): a submission list plus the assembled
 * payload of the newest submission — see `lib/store/latest-payload.ts`.
 * Datasets with no backend endpoint are seeded with `[]` so charts render an
 * empty state instead of fabricated numbers.
 */

import { atom } from "jotai";

import type {
  CqiActionDatum,
  LoopStatusDatum,
  PloGapDatum,
  RootCauseDatum,
} from "@/components/charts/obe-sample-data";
import { api } from "@/lib/api-client";
import { atomWithAsyncData } from "@/lib/store/async-atom";
import {
  fetchLatestPayload,
  stripRootCausePrefix,
} from "@/lib/store/latest-payload";

const PLO_GAP_ANALYSIS = "/cqi/plo-gap-analysis";
const CQI_ACTION_PLAN = "/cqi/cqi-action-plan";
const CLOSING_THE_LOOP = "/cqi/closing-the-loop";

/** Payload subset of `GET /cqi/plo-gap-analysis/:id` (`cqi/model.ts`). */
interface PloGapPayload {
  /** Program the gap analysis was run for — also the `/plan/plos` scope. */
  programId: string;
  plos: {
    ploCode: string;
    programAvgPct: number | null;
  }[];
  gapRows: {
    rootCauseCategory: string | null;
  }[];
}

/** Payload subset of `GET /cqi/cqi-action-plan/:id` (`cqi/model.ts`). */
interface CqiPlanPayload {
  entries: {
    rootCauseCategory: string;
    status: "planned" | "tracked";
  }[];
}

/** Payload subset of `GET /cqi/closing-the-loop/:id` (`cqi/model.ts`). */
interface CtlPayload {
  rows: {
    loopStatus: "closed" | "open_reassess" | "open_not_implemented";
  }[];
}

/** `PloEntityDto` from `GET /plan/plos` — the ≥70% target the gap is measured against. */
interface PloEntity {
  code: string;
  targetAttainmentPct: number;
}

/** Canonical 6-category order (backend `lib/validators/root-cause.ts`). */
const ROOT_CAUSE_ORDER: RootCauseDatum["category"][] = [
  "Curriculum Design",
  "Instruction & Pedagogy",
  "Assessment Design",
  "Student Factors",
  "Resources & Tools",
  "Industry & Field Alignment",
];

/** Count a root-cause value into the canonical 6-category distribution. */
function countRootCauses(categories: (string | null)[]): RootCauseDatum[] {
  const counts = new Map<RootCauseDatum["category"], number>();
  for (const category of categories) {
    if (!category) continue;
    const label = stripRootCausePrefix(category) as RootCauseDatum["category"];
    if (!ROOT_CAUSE_ORDER.includes(label)) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return ROOT_CAUSE_ORDER.filter(
    (category) => (counts.get(category) ?? 0) > 0,
  ).map((category) => ({ category, count: counts.get(category) ?? 0 }));
}

interface GapBundle {
  ploGaps: PloGapDatum[];
  rootCauses: RootCauseDatum[];
}

/**
 * One fetch feeds both gap charts: the newest gap-analysis payload (attained
 * per PLO + the root-cause field on each gap row) plus the PLO directory, which
 * is where the ≥70% target comes from.
 *
 * TODO(cohort-gap): the backend also reports per-cohort attainment; the chart
 * currently plots the program average against the program target only.
 */
const gapBundleAtoms = atomWithAsyncData<GapBundle>(
  { ploGaps: [], rootCauses: [] },
  async (_get, signal) => {
    const payload = await fetchLatestPayload<PloGapPayload>(
      PLO_GAP_ANALYSIS,
      (id) => `${PLO_GAP_ANALYSIS}/${id}`,
      signal,
    );
    if (!payload) return { ploGaps: [], rootCauses: [] };

    // `/plan/plos` is program-scoped (`programId` is required) — use the
    // program the gap analysis itself was run for so the target matches.
    const plos = await api.get<PloEntity[]>("/plan/plos", {
      signal,
      query: { programId: payload.programId },
    });

    const targets = new Map(
      plos.map((plo) => [plo.code, plo.targetAttainmentPct]),
    );
    const ploGaps: PloGapDatum[] = [];
    for (const plo of payload.plos) {
      if (plo.programAvgPct === null) continue;
      const targetAttainmentPct = targets.get(plo.ploCode);
      if (targetAttainmentPct === undefined) continue;
      ploGaps.push({
        ploCode: plo.ploCode,
        targetAttainmentPct,
        attainedPct: plo.programAvgPct,
        gap: targetAttainmentPct - plo.programAvgPct,
      });
    }

    return {
      ploGaps,
      rootCauses: countRootCauses(
        payload.gapRows.map((row) => row.rootCauseCategory),
      ),
    };
  },
);

/** PLO gap-analysis rows (attained vs target). */
export const ploGapsDataAtom = atom<PloGapDatum[]>(
  (get) => get(gapBundleAtoms.dataAtom).ploGaps,
);
export const refreshPloGapsAtom = gapBundleAtoms.refreshAtom;

/** 6-category root-cause distribution, counted from the gap rows. */
export const rootCausesDataAtom = atom<RootCauseDatum[]>(
  (get) => get(gapBundleAtoms.dataAtom).rootCauses,
);
export const refreshRootCausesAtom = gapBundleAtoms.refreshAtom;

/** CQI action plans — planned vs completed per root-cause category. */
export const {
  dataAtom: cqiActionsDataAtom,
  refreshAtom: refreshCqiActionsAtom,
} = atomWithAsyncData<CqiActionDatum[]>([], (_get, signal) =>
  fetchLatestPayload<CqiPlanPayload>(
    CQI_ACTION_PLAN,
    (id) => `${CQI_ACTION_PLAN}/${id}`,
    signal,
  ).then((payload) => {
    const byCategory = new Map<
      string,
      { planned: number; completed: number }
    >();
    for (const entry of payload?.entries ?? []) {
      const category = stripRootCausePrefix(entry.rootCauseCategory);
      const bucket = byCategory.get(category) ?? { planned: 0, completed: 0 };
      if (entry.status === "planned") bucket.planned += 1;
      else bucket.completed += 1;
      byCategory.set(category, bucket);
    }
    return [...byCategory].map(([rootCause, counts]) => ({
      rootCause,
      ...counts,
    }));
  }),
);

/**
 * Closing-the-Loop status distribution — the status is computed server-side
 * from the five documented conditions and never accepted from the client.
 */
export const {
  dataAtom: loopStatusesDataAtom,
  refreshAtom: refreshLoopStatusesAtom,
} = atomWithAsyncData<LoopStatusDatum[]>([], (_get, signal) =>
  fetchLatestPayload<CtlPayload>(
    CLOSING_THE_LOOP,
    (id) => `${CLOSING_THE_LOOP}/${id}`,
    signal,
  ).then((payload) => {
    const labels: Record<
      CtlPayload["rows"][number]["loopStatus"],
      LoopStatusDatum["status"]
    > = {
      closed: "CLOSED",
      open_reassess: "OPEN — Re-assess",
      open_not_implemented: "OPEN — Not Implemented",
    };
    const counts = new Map<LoopStatusDatum["status"], number>();
    for (const row of payload?.rows ?? []) {
      const label = labels[row.loopStatus];
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts]
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({ status, count }));
  }),
);
