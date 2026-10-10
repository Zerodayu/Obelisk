/**
 * CAR (Course Assessment Report) atoms — holds the generated CarPayload and
 * tracks dirty state for editable parts (1/5/6/7).
 *
 * Fetches via the browser `api` client; mutations go through server actions.
 */

import { atom } from "jotai";

export interface CloPloMappingRow {
	cloCode: string;
	cloDescription?: string;
	ploCode?: string | null;
	ploDescription?: string | null;
	bloomsLevel?: string | null;
	ipdStage?: string | null;
	assessmentTypes?: string[] | null;
	weightInGradePct?: number | null;
}

export interface CarPart1 {
	courseCode: string;
	courseTitle: string;
	schoolYear: string;
	semester: string;
	sectionCode: string;
	programCode: string;
	programName: string;
	term: "Prelim" | "Midterm" | "Finals" | string | null;
	yearLevel: number | null;
	noEnrolled: number;
	noCompleted: number;
	dateSubmitted: string | null;
	facultyName: string | null;
	designation: string | null;
	cloPloMapping: CloPloMappingRow[];
}

export interface AssessmentTypeRow {
	cloCode: string;
	cloDescription: string;
	attainmentPct: number | null;
	belowBenchmark: boolean | null;
}

export interface CarPart2 {
	exams: AssessmentTypeRow[];
	rubric: AssessmentTypeRow[];
	perfTasks: AssessmentTypeRow[];
	portfolio: AssessmentTypeRow[];
}

export interface Part3Row {
	cloCode: string;
	cloDescription: string;
	examPct: number | null;
	atPct: number | null;
	tlaPct: number | null;
	outputPct: number | null;
	weightedAvgPct: number;
	level: "Exceptional" | "Proficient" | "Basic" | "Below Basic" | string;
	status: "MET" | "NOT MET" | string;
}

export interface CohortSummary {
	yearLevel: number | null;
	rows: Part3Row[];
	cohortAvg: {
		weightedAvgPct: number | null;
		level:
			| "Exceptional"
			| "Proficient"
			| "Basic"
			| "Below Basic"
			| string
			| null;
	};
}

export type CarPart3 = CohortSummary[];

export interface AtRiskClo {
	cloCode: string;
	attainmentPct: number;
	assessmentType: string | null;
}

export interface AtRiskRow {
	studentId: string;
	studentName: string;
	studentNumber: string;
	yearLevel: number | null;
	atRiskClos: AtRiskClo[];
	intervention: string | null;
}

export interface CarPart4 {
	count: number;
	dateReportedToProgramChair: string | null;
	rows: AtRiskRow[];
}

export interface CqiEntry {
	cloCode: string;
	cloDescription: string;
	attainmentPct: number;
	rootCauseCategory: string;
	intervention: string;
	owner: string;
	timelineAndKpi: string;
}

export type CarPart5 = CqiEntry[];

export interface StudentExitCrossReference {
	cloPloCode: string;
	studentAvgPerceived: number | null;
	directAttainmentPct?: number | null;
	facultyNote: string | null;
}

export interface CarPart6 {
	studentExitCrossReferences: StudentExitCrossReference[];
	teachingStrategies: string[];
	facultyReflection: string | null;
}

export interface ProgramChairDisposition {
	accepted: boolean | null;
	returnReason: string | null;
	returnByDate: string | null;
	cqiEntriesReviewed: boolean | null;
	escalationRequired: boolean | null;
	atRiskListReceived: boolean | null;
}

export interface CarPart7 {
	facultyCertification: boolean;
	submittedBy: string | null;
	receivedBy: string | null;
	programChairDisposition: ProgramChairDisposition | null;
}

export interface CarPayload {
	classSectionId: string;
	computationRunId: string;
	formSubmissionId: string | null;
	generatedAt: string;
	part1: CarPart1;
	part2: CarPart2;
	part3: CarPart3;
	part4: CarPart4;
	part5: CarPart5;
	part6: CarPart6;
	part7: CarPart7;
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
