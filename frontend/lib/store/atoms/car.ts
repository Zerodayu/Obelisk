/**
 * CAR (Course Assessment Report) atoms — holds the generated CarPayload and
 * tracks dirty state for editable parts (1/5/6/7).
 *
 * Fetches via the browser `api` client; mutations go through server actions.
 */

import { atom } from "jotai";

import { api } from "@/lib/api-client";

export interface CarPayload {
  classSectionId: string;
  computationRunId: string;
  formSubmissionId: string | null;
  generatedAt: string;
  part1: {
    term: string;
    yearLevel: number;
    dateSubmitted: string;
    facultyName: string;
    designation: string;
    course: { code: string; title: string };
    sectionCode: string;
    program: { code: string; name: string };
    cloPloMapping: {
      cloCode: string;
      bloomsLevel: string;
      ipdStage: string;
      assessmentTypes: string[];
      weightInGradePct: number;
    }[];
  };
  part2: {
    assessmentType: string;
    cloAttainments: {
      cloCode: string;
      scorePct: number;
      level: string;
      status: string;
    }[];
  }[];
  part3: {
    yearLevel: number;
    cohortSize: number;
    weightedAvgPct: number | null;
    level: string | null;
    status: string;
  }[];
  part4: {
    studentId: string;
    studentName: string;
    studentNumber: string;
    cloCode: string;
    scorePct: number;
    reason: string;
  }[];
  part5: {
    cloCode: string;
    rootCauseCategory: string;
    intervention: string;
    owner: string;
    timelineAndKpi: string;
  }[];
  part6: {
    studentExitCrossReferences: {
      cloPloCode: string;
      studentAvgPerceived: number;
      facultyNote: string;
    }[];
    teachingStrategies: string[];
    facultyReflection: string;
  };
  part7: {
    certification: {
      facultyName: string;
      dateSubmitted: string;
    };
    programChairDisposition: {
      accepted: boolean | null;
      returnReason: string;
      returnByDate: string;
      cqiEntriesReviewed: boolean;
      escalationRequired: boolean;
      atRiskListReceived: boolean;
    };
  };
}

/** Currently loaded CAR payload (null = not yet generated). */
export const carPayloadAtom = atom<CarPayload | null>(null);

/** Whether any editable part has unsaved changes. */
export const carDirtyAtom = atom(false);

/** Reset CAR state (e.g. when switching class sections). */
export const resetCarAtom = atom(null, (_get, set) => {
  set(carPayloadAtom, null);
  set(carDirtyAtom, false);
});
