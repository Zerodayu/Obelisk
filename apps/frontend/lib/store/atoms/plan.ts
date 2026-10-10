/**
 * PLAN-phase dataset atoms (curriculum map, calendar, budget, targets).
 *
 * Backed by the PLAN routes (`GET /plan/*`): a submission list plus the
 * assembled payload of the newest submission — see
 * `lib/store/latest-payload.ts`. Datasets whose backend endpoint does not
 * exist yet are seeded with `[]` so charts render an empty state instead of
 * fabricated numbers.
 */

import type {
	AssessmentTypeDatum,
	BudgetLineDatum,
	CurriculumCoverageDatum,
	PloToPeoCoverageDatum,
	ScheduleDatum,
	StudentYearLevelDatum,
	TargetSettingDatum,
} from "@/components/charts/obe-sample-data";
import { api } from "@/lib/api-client";
import { atomWithAsyncData, atomWithMockData } from "@/lib/store/async-atom";
import { userAtom } from "@/lib/store/atoms/user";
import { fetchLatestPayload } from "@/lib/store/latest-payload";

const ASSESSMENT_BUDGET = "/plan/assessment-budget";
const TARGET_SETTING_MATRIX = "/plan/target-setting-matrix";

/** Payload subset of `GET /plan/assessment-budget/:id` (`plan/model.ts`). */
interface AssessmentBudgetPayload {
	lineItems: {
		phase: string;
		name: string;
		estimatedCost: number;
		approvedCost: number | null;
	}[];
}

/** Payload subset of `GET /plan/target-setting-matrix/:id` (`plan/model.ts`). */
interface TargetSettingMatrixPayload {
	ploRows: {
		targets: [number, number, number, number];
	}[];
	/** Program-wide mean target per year level (Y1–Y4), derived from `ploRows`. */
	programPloAvg: number[];
}

/** `CloToPloMapDto` from `GET /plan/clo-plo-map`. */
interface CloToPloMapDto {
	weight: number;
	clo: { code: string };
	plo: { code: string };
}

const YEAR_LEVELS = ["Y1", "Y2", "Y3", "Y4"] as const;

/**
 * Approved assessment budget line items for the newest budget submission.
 *
 * TODO(spent): `BudgetLineItem` tracks estimated vs approved cost only — there
 * is no actual-spend field on the backend, so the chart plots the planned
 * series alone until one lands.
 */
export const {
	dataAtom: budgetLinesDataAtom,
	refreshAtom: refreshBudgetLinesAtom,
} = atomWithAsyncData<BudgetLineDatum[]>([], (_get, signal) =>
	fetchLatestPayload<AssessmentBudgetPayload>(
		ASSESSMENT_BUDGET,
		(id) => `${ASSESSMENT_BUDGET}/${id}`,
		signal,
	).then((payload) =>
		(payload?.lineItems ?? []).map((item) => ({
			lineItem: item.name,
			phase: item.phase.toUpperCase() as BudgetLineDatum["phase"],
			planned: item.approvedCost ?? item.estimatedCost,
		})),
	),
);

/**
 * CLO→PLO coverage matrix for one program — every mapping row.
 *
 * `/plan/clo-plo-map` is program-scoped (`programId` is a required query param,
 * the route 422s without it), so it uses the signed-in user's program.
 * NOTE: no "first program the backend knows" fallback anymore — `/academic/
 * programs` is unit-scoped on the backend (`lib/unit-scope.ts`), and picking
 * an arbitrary first row would render another unit's (or a random program's)
 * matrix as if it were the caller's.
 * TODO(program-scope): there is no program selector in the UI — a dean/AQAU
 * (institution-wide) view needs per-program fan-out (or a `programId=any`
 * route) instead of one program's map; until then it renders empty.
 */
export const {
	dataAtom: curriculumCoverageDataAtom,
	refreshAtom: refreshCurriculumCoverageAtom,
} = atomWithAsyncData<CurriculumCoverageDatum[]>([], async (get, signal) => {
	const programId = get(userAtom)?.programId;
	if (!programId) return [];

	const maps = await api.get<CloToPloMapDto[]>("/plan/clo-plo-map", {
		signal,
		query: { programId },
	});
	return maps.map((map) => ({
		cloCode: map.clo.code,
		ploCode: map.plo.code,
		weight: map.weight,
	}));
});

/**
 * Target-setting matrix — the program mean target per year level for the
 * newest submission.
 *
 * TODO(current): the payload carries targets only; current attainment is
 * reported by the rollup chain and is not joined here, so the chart plots the
 * target series alone.
 */
export const {
	dataAtom: targetSettingsDataAtom,
	refreshAtom: refreshTargetSettingsAtom,
} = atomWithAsyncData<TargetSettingDatum[]>([], (_get, signal) =>
	fetchLatestPayload<TargetSettingMatrixPayload>(
		TARGET_SETTING_MATRIX,
		(id) => `${TARGET_SETTING_MATRIX}/${id}`,
		signal,
	).then((payload) =>
		(payload?.programPloAvg ?? []).map((targetAttainmentPct, index) => ({
			yearLevel: YEAR_LEVELS[index] ?? `Y${index + 1}`,
			targetAttainmentPct,
		})),
	),
);

/**
 * Assessment calendar load per month — the calendar payload stores milestone
 * rows (period/week, activity, cohort years), not per-month direct/indirect
 * assessment counts, so no endpoint feeds this chart yet.
 */
export const { dataAtom: scheduleDataAtom, refreshAtom: refreshScheduleAtom } =
	atomWithMockData<ScheduleDatum[]>([]);

/**
 * PLO→PEO coverage (`PloToPeoMap`) for the signed-in user's program.
 *
 * Mirrors `curriculumCoverageDataAtom`: the route is program-scoped and
 * `lib/unit-scope.ts` refuses a foreign `programId`, so an institution-wide
 * role with no program of its own has nothing to chart (same TODO applies).
 */
export const {
	dataAtom: ploToPeoCoverageDataAtom,
	refreshAtom: refreshPloToPeoCoverageAtom,
} = atomWithAsyncData<PloToPeoCoverageDatum[]>([], async (get, signal) => {
	const programId = get(userAtom)?.programId;
	if (!programId) return [];

	const maps = await api.get<{ ploCode: string; peoCode: string }[]>(
		"/plan/plo-to-peo-map",
		{ signal, query: { programId } },
	);
	return maps.map((map) => ({
		ploCode: map.ploCode,
		peoCode: map.peoCode,
		mapped: true,
	}));
});

/** Assessment items per type (`GET /academic/assessment-types`). */
export const {
	dataAtom: assessmentTypesDataAtom,
	refreshAtom: refreshAssessmentTypesAtom,
} = atomWithAsyncData<AssessmentTypeDatum[]>([], (_get, signal) =>
	api
		.get<{ type: "direct" | "indirect"; itemCount: number }[]>(
			"/academic/assessment-types",
			{ signal },
		)
		.then((rows) => rows.map((r) => ({ ...r }))),
);

/** Students per year level (`GET /academic/students/year-levels`). */
export const {
	dataAtom: studentYearLevelsDataAtom,
	refreshAtom: refreshStudentYearLevelsAtom,
} = atomWithAsyncData<StudentYearLevelDatum[]>([], (_get, signal) =>
	api
		.get<{ yearLevel: number | null; studentCount: number }[]>(
			"/academic/students/year-levels",
			{ signal },
		)
		// A student with no year level on file is not one of Y1–Y4 and the chart's
		// union type has no slot for it, so it is dropped rather than coerced.
		.then((rows) =>
			rows
				.filter(
					(r): r is { yearLevel: number; studentCount: number } =>
						r.yearLevel !== null,
				)
				.map((r) => ({
					yearLevel: r.yearLevel as StudentYearLevelDatum["yearLevel"],
					studentCount: r.studentCount,
				})),
		),
);
