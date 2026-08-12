/**
 * PLAN-phase dataset atoms (curriculum map, calendar, budget, targets).
 *
 * Mock-seeded until the corresponding backend endpoints land; swap each
 * `atomWithMockData` to `atomWithAsyncData(seed, () => api.get(...))` when
 * they do.
 */

import {
  type AssessmentTypeDatum,
  type BudgetLineDatum,
  type CurriculumCoverageDatum,
  MOCK_ASSESSMENT_TYPES,
  MOCK_BUDGET_LINES,
  MOCK_CURRICULUM_COVERAGE,
  MOCK_PLO_TO_PEO_COVERAGE,
  MOCK_SCHEDULE,
  MOCK_STUDENT_YEAR_LEVELS,
  MOCK_TARGET_SETTINGS,
  type PloToPeoCoverageDatum,
  type ScheduleDatum,
  type StudentYearLevelDatum,
  type TargetSettingDatum,
} from "@/components/charts/obe-sample-data";
import { atomWithMockData } from "@/lib/store/async-atom";

/** Approved assessment budget line items (`AssessmentBudget`). */
export const {
  dataAtom: budgetLinesDataAtom,
  refreshAtom: refreshBudgetLinesAtom,
} = atomWithMockData<BudgetLineDatum[]>(MOCK_BUDGET_LINES);

/** CLO-PLO coverage matrix (`CloToPloMap`). */
export const {
  dataAtom: curriculumCoverageDataAtom,
  refreshAtom: refreshCurriculumCoverageAtom,
} = atomWithMockData<CurriculumCoverageDatum[]>(MOCK_CURRICULUM_COVERAGE);

/** Assessment calendar — scheduled items per month. */
export const { dataAtom: scheduleDataAtom, refreshAtom: refreshScheduleAtom } =
  atomWithMockData<ScheduleDatum[]>(MOCK_SCHEDULE);

/** Target-setting matrix — target vs current attainment per year level. */
export const {
  dataAtom: targetSettingsDataAtom,
  refreshAtom: refreshTargetSettingsAtom,
} = atomWithMockData<TargetSettingDatum[]>(MOCK_TARGET_SETTINGS);

/** PLO→PEO coverage matrix (`PloToPeoMap`). */
export const {
  dataAtom: ploToPeoCoverageDataAtom,
  refreshAtom: refreshPloToPeoCoverageAtom,
} = atomWithMockData<PloToPeoCoverageDatum[]>(MOCK_PLO_TO_PEO_COVERAGE);

/** Assessment items by type (`AssessmentItem.type`). */
export const {
  dataAtom: assessmentTypesDataAtom,
  refreshAtom: refreshAssessmentTypesAtom,
} = atomWithMockData<AssessmentTypeDatum[]>(MOCK_ASSESSMENT_TYPES);

/** Students by year level (`Student.yearLevel`). */
export const {
  dataAtom: studentYearLevelsDataAtom,
  refreshAtom: refreshStudentYearLevelsAtom,
} = atomWithMockData<StudentYearLevelDatum[]>(MOCK_STUDENT_YEAR_LEVELS);
