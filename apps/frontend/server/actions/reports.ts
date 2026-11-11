/**
 * institutional CQI report server actions.
 *
 * The backend assembles the report from stored attainment; python-server only
 * writes the narrative. Nothing here recomputes attainment.
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

export type CqiReportNarrative = {
	id: string;
	status: string;
	generatedAt: string;
	summary: string | null;
	recommendations: {
		problem: string;
		evidence_fact_ids: string[];
		existing_intervention_assessment: string | null;
		proposed_additions: string;
		responsible_role: string;
		timeline: string | null;
		success_indicator: string;
		target: number | null;
		verification_method: string;
	}[];
	pattern: { description: string; evidenceFactIds: string[] } | null;
	dataLimitations: string[];
	missingSections: string[];
	provenance: Record<string, unknown> | null;
};

export type CqiReport = {
	termId: string;
	term: { schoolYear: string; semester: string };
	priorTerm: { id: string; schoolYear: string; semester: string } | null;
	generatedAt: string;
	scope: {
		programs: { code: string; name: string }[];
		sections: number;
		courses: number;
		enrolledCount: number;
		assessedCount: number;
		computationRunIds: string[];
		computationRuns: { id: string; scope: string; runAt: string }[];
		thresholds: {
			floorPct: number;
			targetSource: string;
			targetForm: { id: string; createdAt: string } | null;
		};
	};
	completeness: {
		snapshotRecords: number;
		incompleteRecords: number;
		completenessPct: number | null;
		missingIndirectRecords: number;
		missingTargets: string[];
		missingSections: string[];
	};
	programSummaries: {
		programCode: string;
		programName: string;
		atRiskCount: number;
		assessedCount: number;
		totalStudents: number;
	}[];
	statistics: {
		enrolledCount: number;
		assessedCount: number;
		recordCount: number;
		meetingCount: number;
		belowCount: number;
		atRiskCount: number;
		atRiskRatePct: number | null;
		meanPct: number | null;
		medianPct: number | null;
		attainmentPct: number | null;
		distribution: { band: string; count: number }[];
	};
	outcomes: {
		key: string;
		outcomeType: "CLO" | "PLO" | "PEO";
		code: string;
		description: string;
		programCode: string;
		courseCode: string | null;
		targetPct: number | null;
		effectiveTargetPct: number;
		directPct: number | null;
		indirectPct: number | null;
		compositePct: number | null;
		medianPct: number | null;
		assessedCount: number;
		recordCount: number;
		studentCount: number;
		meetingCount: number;
		belowCount: number;
		targetMetCount: number;
		countBasis: "record" | "mapped_clo" | "none";
		attainmentPct: number | null;
		status: "MET" | "NOT MET" | "NOT AVAILABLE";
		priorCycleCompositePct: number | null;
		deltaPct: number | null;
		isComplete: boolean;
		derived: boolean;
		distribution: { band: string; count: number }[];
	}[];
	alignment: {
		mappings: {
			programCode: string;
			courseCode: string;
			cloCode: string;
			ploCode: string;
			weight: number | null;
			stage: string | null;
		}[];
		unmappedClos: {
			programCode: string;
			courseCode: string;
			cloCode: string;
		}[];
		unmappedPlos: { programCode: string; ploCode: string }[];
	};
	priorComparisons: {
		outcomeKey: string;
		outcomeCode: string;
		outcomeType: "CLO" | "PLO" | "PEO";
		priorPct: number | null;
		currentPct: number | null;
		deltaPct: number | null;
		direction: "up" | "down" | "flat" | "insufficient";
		comparable: boolean;
		reason: string | null;
	}[];
	findings: {
		strengths: ReportFinding[];
		weaknesses: ReportFinding[];
		hypotheses: {
			hypothesis: string;
			rootCauseCategory: string;
			evidenceFactIds: string[];
			status: "pending_program_chair_confirmation";
		}[];
	};
	previousCqi: {
		entryId: string;
		outcomeCode: string;
		programCode: string;
		priorAttainmentPct: number | null;
		currentAttainmentPct: number | null;
		deltaPct: number | null;
		implementationStatus: "yes" | "partial" | "no" | null;
		loopStatus: "CLOSED" | "OPEN_REASSESS" | "OPEN_NOT_IMPLEMENTED" | null;
		intervention: string;
		ownerRole: string;
		rootCauseCategory: string | null;
		timelineAndKpi: string;
		isEscalated: boolean;
		kpiStatus: "not_machine_verifiable";
		outcomeStillNotMet: boolean;
	}[];
	nextCycle: {
		previouslyMetDeclining: string[];
		openLoops: {
			closed: number;
			openReassess: number;
			openNotImplemented: number;
		};
		escalatedOutcomes: string[];
		interventionCompletion: {
			implemented: number;
			partial: number;
			notImplemented: number;
			notRecorded: number;
			ratePct: number | null;
			tracked: number;
			completedEquivalent: number;
		};
		priorities: ReportFinding[];
	};
	narrative: CqiReportNarrative | null;
};

export type ReportFinding = {
	outcomeKey: string;
	outcomeCode: string;
	outcomeType: "CLO" | "PLO" | "PEO";
	programCode: string;
	courseCode: string | null;
	statement: string;
	evidence: string;
	priority: "critical" | "high" | "medium" | "low";
};

export async function getCqiInstitutionalReport(
	termId?: string,
	programId?: string,
): Promise<ActionResult<CqiReport>> {
	try {
		const data = await actionApi.get<CqiReport>("/reports/cqi-institutional", {
			termId,
			programId,
		});
		return { ok: true, data };
	} catch (err) {
		return {
			ok: false,
			error: errorMessage(
				err,
				"Failed to assemble the CQI institutional report.",
			),
		};
	}
}

export async function generateCqiNarrative(
	termId?: string,
	programId?: string,
): Promise<
	ActionResult<{
		status: "ok" | "error" | "narrative_unavailable";
		narrative: CqiReportNarrative | null;
		error: string | null;
		reason: string | null;
	}>
> {
	try {
		const data = await actionApi.post<{
			status: "ok" | "error" | "narrative_unavailable";
			narrative: CqiReportNarrative | null;
			error: string | null;
			reason: string | null;
		}>("/reports/cqi-institutional/narrative", { termId, programId });
		return { ok: true, data };
	} catch (err) {
		return {
			ok: false,
			error: errorMessage(err, "Failed to generate the AI narrative."),
		};
	}
}

export async function reviewCqiNarrative(
	id: string,
	status: "acknowledged" | "dismissed",
): Promise<ActionResult<{ narrative: CqiReportNarrative }>> {
	try {
		const data = await actionApi.patch<{ narrative: CqiReportNarrative }>(
			`/reports/cqi-institutional/narrative/${id}`,
			{ status },
		);
		return { ok: true, data };
	} catch (err) {
		return {
			ok: false,
			error: errorMessage(err, "Failed to save the review decision."),
		};
	}
}
