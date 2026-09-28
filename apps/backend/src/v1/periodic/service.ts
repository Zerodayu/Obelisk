import { EDITABLE_STATUSES } from "@lib/forms/state-machine";
import { registerSubmitGate, SubmitGateError } from "@lib/forms/submit-gates";
import { prisma } from "@lib/prisma";
import type {
	AcquisitionStatus,
	CqiImplementationStatus,
	PdcaPhase,
	Prisma,
} from "@prisma/generated/prisma/client";
import { submissionService } from "@v1/forms/service";
import type {
	SaveAlumniTracer,
	SaveCapaPlan,
	SaveEmployerSurvey,
	SaveInstitutionalReview,
	SavePortfolioRoadmap,
	SaveResourceMonitoring,
	SaveSystemicGapReport,
} from "./model";

// --- Form type codes -----------------------------------------------------------

const RESOURCE_MONITOR_CODE = "resource_monitoring";
const ALUMNI_TRACER_CODE = "alumni_tracer";
const EMPLOYER_SURVEY_CODE = "employer_satisfaction_survey";
const SYSTEMIC_GAP_CODE = "systemic_gap_report";
const CAPA_PLAN_CODE = "capa_plan";
const INSTITUTIONAL_REVIEW_CODE = "institutional_review";
const PORTFOLIO_ROADMAP_CODE = "portfolio_roadmap";

const FORM_TYPES = {
	[RESOURCE_MONITOR_CODE]: {
		name: "Resource Acquisition and Implementation Monitoring",
		sequenceNo: 28,
	},
	[ALUMNI_TRACER_CODE]: { name: "Alumni Tracer Study Report", sequenceNo: 29 },
	[EMPLOYER_SURVEY_CODE]: {
		name: "Employer Satisfaction Survey Report",
		sequenceNo: 30,
	},
	[SYSTEMIC_GAP_CODE]: {
		name: "Systemic Gap Report",
		sequenceNo: 31,
	},
	[CAPA_PLAN_CODE]: {
		name: "Corrective and Preventive Action (CAPA) Plan",
		sequenceNo: 32,
	},
	[INSTITUTIONAL_REVIEW_CODE]: {
		name: "Institutional Management Review Records",
		sequenceNo: 33,
	},
	[PORTFOLIO_ROADMAP_CODE]: {
		name: "Portfolio Roadmap and Rubric Standards",
		sequenceNo: 34,
	},
} as const;

type PeriodicFormCode = keyof typeof FORM_TYPES;

// --- Errors --------------------------------------------------------------------

export class PeriodicSubmissionNotFoundError extends Error {
	constructor(id: string) {
		super(`Periodic submission '${id}' not found`);
		this.name = "PeriodicSubmissionNotFoundError";
	}
}

export class PeriodicInvalidEditError extends Error {
	constructor(form: string) {
		super(
			`${form} content may only be edited while the submission is draft or returned.`,
		);
		this.name = "PeriodicInvalidEditError";
	}
}

export class PeriodicValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PeriodicValidationError";
	}
}

// --- Shared helpers ------------------------------------------------------------

async function ensurePeriodicFormType(code: PeriodicFormCode): Promise<string> {
	const existing = await prisma.formType.findUnique({
		where: { code },
		select: { id: true },
	});
	if (existing) return existing.id;

	const meta = FORM_TYPES[code];
	try {
		const created = await prisma.formType.create({
			data: {
				id: crypto.randomUUID(),
				code,
				name: meta.name,
				pdcaStage: "ACT",
				sequenceNo: meta.sequenceNo,
			},
			select: { id: true },
		});
		return created.id;
	} catch {
		const retried = await prisma.formType.findUnique({
			where: { code },
			select: { id: true },
		});
		if (retried) return retried.id;
		throw new Error(`Failed to ensure the ${code} form type`);
	}
}

async function periodicAudit(
	userId: string,
	action: string,
	details: Record<string, unknown>,
): Promise<void> {
	await prisma.auditLog.create({
		data: {
			id: crypto.randomUUID(),
			userId,
			action,
			moduleAffected: "periodic",
			targetRecordId:
				typeof details.targetRecordId === "string"
					? details.targetRecordId
					: null,
			details: details as Prisma.InputJsonValue,
		},
	});
}

async function mergeFormData(
	submissionId: string,
	patch: Record<string, unknown>,
): Promise<void> {
	const existing = await prisma.formSubmission.findUnique({
		where: { id: submissionId },
		select: { formData: true },
	});
	await prisma.formSubmission.update({
		where: { id: submissionId },
		data: {
			formData: {
				...((existing?.formData ?? {}) as Record<string, unknown>),
				...patch,
			} as Prisma.InputJsonValue,
		},
		select: { id: true },
	});
}

async function assertEditable(
	submissionId: string,
	form: string,
): Promise<void> {
	const submission = await prisma.formSubmission.findUnique({
		where: { id: submissionId },
		select: { status: true },
	});
	if (!submission) throw new PeriodicSubmissionNotFoundError(submissionId);
	if (
		!EDITABLE_STATUSES.includes(
			submission.status as (typeof EDITABLE_STATUSES)[number],
		)
	) {
		throw new PeriodicInvalidEditError(form);
	}
}

async function ensurePeriodicDraft(
	code: PeriodicFormCode,
	programId: string,
	termId: string,
	userId: string,
): Promise<{ id: string }> {
	const formTypeId = await ensurePeriodicFormType(code);
	const existing = await prisma.formSubmission.findFirst({
		where: {
			formTypeId,
			programId,
			termId,
			status: { in: [...EDITABLE_STATUSES, "submitted", "approved"] },
		},
		orderBy: { createdAt: "desc" },
		select: { id: true },
	});
	if (existing) return existing;

	const created = await submissionService.create(
		{ formTypeId, programId, termId, formData: {} },
		userId,
	);
	return { id: created.id };
}

export async function listPeriodicSubmissions(
	formTypeCode: PeriodicFormCode,
	opts: { programId?: string; termId?: string } = {},
): Promise<
	Array<{
		id: string;
		status: string;
		currentApproverRole: string | null;
		createdAt: Date;
		updatedAt: Date;
		program: { code: string; name: string } | null;
	}>
> {
	const formType = await prisma.formType.findUnique({
		where: { code: formTypeCode },
		select: { id: true },
	});
	if (!formType) return [];

	return prisma.formSubmission.findMany({
		where: {
			formTypeId: formType.id,
			...(opts.programId ? { programId: opts.programId } : {}),
			...(opts.termId ? { termId: opts.termId } : {}),
		},
		orderBy: { createdAt: "desc" },
		select: {
			id: true,
			status: true,
			currentApproverRole: true,
			createdAt: true,
			updatedAt: true,
			program: { select: { code: true, name: true } },
		},
	});
}

// --- F09 resource_monitoring --------------------------------------------------

export class ResourceMonitoringService {
	async init(programId: string, termId: string, userId: string) {
		const draft = await ensurePeriodicDraft(
			RESOURCE_MONITOR_CODE,
			programId,
			termId,
			userId,
		);
		await periodicAudit(userId, "resource_monitoring.initialized", {
			targetRecordId: draft.id,
			programId,
			termId,
		});
		return draft;
	}

	async get(submissionId: string) {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: {
				id: true,
				formData: true,
				status: true,
				resourceItems: { orderBy: { name: "asc" } },
				cqiImplementRows: { orderBy: { interventionDescription: "asc" } },
			},
		});
		if (!submission) throw new PeriodicSubmissionNotFoundError(submissionId);
		return {
			id: submission.id,
			status: submission.status,
			header: (submission.formData as Record<string, unknown>)?.header ?? {},
			resourceItems: submission.resourceItems,
			cqiImplementRows: submission.cqiImplementRows,
		};
	}

	async save(
		submissionId: string,
		userId: string,
		body: SaveResourceMonitoring,
	) {
		await assertEditable(submissionId, "Resource Monitoring");

		if (body.header) {
			await mergeFormData(submissionId, { header: body.header });
		}

		await prisma.resourceItemRow.deleteMany({
			where: { resourceMonitorId: submissionId },
		});
		if (body.resourceItems.length > 0) {
			await prisma.resourceItemRow.createMany({
				data: body.resourceItems.map((row) => ({
					id: crypto.randomUUID(),
					resourceMonitorId: submissionId,
					budgetLineItemId: row.budgetLineItemId ?? null,
					name: row.name,
					phase: (row.phase ?? "do") as PdcaPhase,
					acquisitionStatus: (row.acquisitionStatus ??
						"pending") as AcquisitionStatus,
					notes: row.remarks ?? null,
				})),
			});
		}

		await prisma.cqiImplementRow.deleteMany({
			where: { resourceMonitorId: submissionId },
		});
		if (body.cqiImplementRows.length > 0) {
			await prisma.cqiImplementRow.createMany({
				data: body.cqiImplementRows.map((row) => ({
					id: crypto.randomUUID(),
					resourceMonitorId: submissionId,
					cqiEntryId: row.cqiEntryId ?? null,
					interventionDescription: row.interventionDescription,
					implementationStatus: (row.implementationStatus ??
						"not_yet") as CqiImplementationStatus,
					evidenceNotes: row.evidenceNotes ?? null,
				})),
			});
		}

		await periodicAudit(userId, "resource_monitoring.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- F20 alumni_tracer --------------------------------------------------------

export class AlumniTracerService {
	async init(programId: string, termId: string, userId: string) {
		const draft = await ensurePeriodicDraft(
			ALUMNI_TRACER_CODE,
			programId,
			termId,
			userId,
		);
		await periodicAudit(userId, "alumni_tracer.initialized", {
			targetRecordId: draft.id,
			programId,
			termId,
		});
		return draft;
	}

	async get(submissionId: string) {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: {
				id: true,
				formData: true,
				status: true,
			},
		});
		if (!submission) throw new PeriodicSubmissionNotFoundError(submissionId);
		const data = (submission.formData ?? {}) as Record<string, unknown>;
		return {
			id: submission.id,
			status: submission.status,
			header: data.header ?? {},
			ploRows: data.ploRows ?? [],
			employmentIndicators: data.employmentIndicators ?? [],
		};
	}

	async save(submissionId: string, userId: string, body: SaveAlumniTracer) {
		await assertEditable(submissionId, "Alumni Tracer");

		const patch: Record<string, unknown> = {};
		if (body.header) patch.header = body.header;
		if (body.ploRows) patch.ploRows = body.ploRows;
		if (body.employmentIndicators)
			patch.employmentIndicators = body.employmentIndicators;

		await mergeFormData(submissionId, patch);
		await periodicAudit(userId, "alumni_tracer.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- F21 employer_satisfaction_survey -----------------------------------------

export class EmployerSurveyService {
	async init(programId: string, termId: string, userId: string) {
		const draft = await ensurePeriodicDraft(
			EMPLOYER_SURVEY_CODE,
			programId,
			termId,
			userId,
		);
		await periodicAudit(userId, "employer_satisfaction_survey.initialized", {
			targetRecordId: draft.id,
			programId,
			termId,
		});
		return draft;
	}

	async get(submissionId: string) {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: {
				id: true,
				formData: true,
				status: true,
			},
		});
		if (!submission) throw new PeriodicSubmissionNotFoundError(submissionId);
		const data = (submission.formData ?? {}) as Record<string, unknown>;
		return {
			id: submission.id,
			status: submission.status,
			header: data.header ?? {},
			employerProfiles: data.employerProfiles ?? [],
			ploRows: data.ploRows ?? [],
		};
	}

	async save(submissionId: string, userId: string, body: SaveEmployerSurvey) {
		await assertEditable(submissionId, "Employer Satisfaction Survey");

		const patch: Record<string, unknown> = {};
		if (body.header) patch.header = body.header;
		if (body.employerProfiles) patch.employerProfiles = body.employerProfiles;
		if (body.ploRows) patch.ploRows = body.ploRows;

		await mergeFormData(submissionId, patch);
		await periodicAudit(userId, "employer_satisfaction_survey.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- F26 systemic_gap_report --------------------------------------------------

export class SystemicGapReportService {
	async init(programId: string, termId: string, userId: string) {
		const draft = await ensurePeriodicDraft(
			SYSTEMIC_GAP_CODE,
			programId,
			termId,
			userId,
		);
		await periodicAudit(userId, "systemic_gap_report.initialized", {
			targetRecordId: draft.id,
			programId,
			termId,
		});
		return draft;
	}

	async get(submissionId: string) {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: {
				id: true,
				formData: true,
				status: true,
			},
		});
		if (!submission) throw new PeriodicSubmissionNotFoundError(submissionId);
		const data = (submission.formData ?? {}) as Record<string, unknown>;
		return {
			id: submission.id,
			status: submission.status,
			header: data.header ?? {},
			cycleRows: data.cycleRows ?? [],
			evidenceNarrative: data.evidenceNarrative ?? null,
			rootCauseCategory: data.rootCauseCategory ?? null,
			rootCauseAnalysis: data.rootCauseAnalysis ?? null,
			recommendedStructuralResponse: data.recommendedStructuralResponse ?? null,
			capaPlanOutline: data.capaPlanOutline ?? null,
			signatures: data.signatures ?? {},
		};
	}

	async save(
		submissionId: string,
		userId: string,
		body: SaveSystemicGapReport,
	) {
		await assertEditable(submissionId, "Systemic Gap Report");

		const patch: Record<string, unknown> = {};
		if (body.header) patch.header = body.header;
		if (body.cycleRows) patch.cycleRows = body.cycleRows;
		if (body.evidenceNarrative !== undefined)
			patch.evidenceNarrative = body.evidenceNarrative;
		if (body.rootCauseCategory !== undefined)
			patch.rootCauseCategory = body.rootCauseCategory;
		if (body.rootCauseAnalysis !== undefined)
			patch.rootCauseAnalysis = body.rootCauseAnalysis;
		if (body.recommendedStructuralResponse !== undefined)
			patch.recommendedStructuralResponse = body.recommendedStructuralResponse;
		if (body.capaPlanOutline !== undefined)
			patch.capaPlanOutline = body.capaPlanOutline;
		if (body.signatures) patch.signatures = body.signatures;

		await mergeFormData(submissionId, patch);
		await periodicAudit(userId, "systemic_gap_report.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- F27 capa_plan -----------------------------------------------------------

export class CapaPlanService {
	async init(programId: string, termId: string, userId: string) {
		const draft = await ensurePeriodicDraft(
			CAPA_PLAN_CODE,
			programId,
			termId,
			userId,
		);
		await periodicAudit(userId, "capa_plan.initialized", {
			targetRecordId: draft.id,
			programId,
			termId,
		});
		return draft;
	}

	async get(submissionId: string) {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: {
				id: true,
				formData: true,
				status: true,
			},
		});
		if (!submission) throw new PeriodicSubmissionNotFoundError(submissionId);
		const data = (submission.formData ?? {}) as Record<string, unknown>;
		return {
			id: submission.id,
			status: submission.status,
			header: data.header ?? {},
			actions: data.actions ?? [],
			progressReviews: data.progressReviews ?? [],
			closureDeclaration: data.closureDeclaration ?? null,
			benchmarkSustainedCycles: data.benchmarkSustainedCycles ?? 0,
		};
	}

	async save(submissionId: string, userId: string, body: SaveCapaPlan) {
		await assertEditable(submissionId, "CAPA Plan");

		if (body.actions.length > 8) {
			throw new PeriodicValidationError(
				"CAPA Plan allows a maximum of 8 actions.",
			);
		}

		const patch: Record<string, unknown> = {};
		if (body.header) patch.header = body.header;
		if (body.actions) patch.actions = body.actions;
		if (body.progressReviews) patch.progressReviews = body.progressReviews;
		if (body.closureDeclaration !== undefined)
			patch.closureDeclaration = body.closureDeclaration;
		if (body.benchmarkSustainedCycles !== undefined)
			patch.benchmarkSustainedCycles = body.benchmarkSustainedCycles;

		await mergeFormData(submissionId, patch);
		await periodicAudit(userId, "capa_plan.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- F28 institutional_review ------------------------------------------------

export class InstitutionalReviewService {
	async init(programId: string, termId: string, userId: string) {
		const draft = await ensurePeriodicDraft(
			INSTITUTIONAL_REVIEW_CODE,
			programId,
			termId,
			userId,
		);
		await periodicAudit(userId, "institutional_review.initialized", {
			targetRecordId: draft.id,
			programId,
			termId,
		});
		return draft;
	}

	async get(submissionId: string) {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: {
				id: true,
				formData: true,
				status: true,
			},
		});
		if (!submission) throw new PeriodicSubmissionNotFoundError(submissionId);
		const data = (submission.formData ?? {}) as Record<string, unknown>;
		return {
			id: submission.id,
			status: submission.status,
			header: data.header ?? {},
			programReviews: data.programReviews ?? [],
			cqiCompletions: data.cqiCompletions ?? [],
			decisions: data.decisions ?? {},
			signatures: data.signatures ?? {},
		};
	}

	async save(
		submissionId: string,
		userId: string,
		body: SaveInstitutionalReview,
	) {
		await assertEditable(submissionId, "Institutional Review");

		const patch: Record<string, unknown> = {};
		if (body.header) patch.header = body.header;
		if (body.programReviews) patch.programReviews = body.programReviews;
		if (body.cqiCompletions) patch.cqiCompletions = body.cqiCompletions;
		if (body.decisions) patch.decisions = body.decisions;
		if (body.signatures) patch.signatures = body.signatures;

		await mergeFormData(submissionId, patch);
		await periodicAudit(userId, "institutional_review.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- F02 portfolio_roadmap ----------------------------------------------------

export class PortfolioRoadmapService {
	async init(programId: string, termId: string, userId: string) {
		const draft = await ensurePeriodicDraft(
			PORTFOLIO_ROADMAP_CODE,
			programId,
			termId,
			userId,
		);
		await periodicAudit(userId, "portfolio_roadmap.initialized", {
			targetRecordId: draft.id,
			programId,
			termId,
		});
		return draft;
	}

	async get(submissionId: string) {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: {
				id: true,
				formData: true,
				status: true,
				portfolioRoadmapRows: { orderBy: { sortOrder: "asc" } },
				portfolioRubricRows: { orderBy: { sortOrder: "asc" } },
			},
		});
		if (!submission) throw new PeriodicSubmissionNotFoundError(submissionId);
		const data = (submission.formData ?? {}) as Record<string, unknown>;
		return {
			id: submission.id,
			status: submission.status,
			header: data.header ?? {},
			roadmapRows: submission.portfolioRoadmapRows,
			rubricRows: submission.portfolioRubricRows,
			complianceChecklist: data.complianceChecklist ?? [],
		};
	}

	async save(submissionId: string, userId: string, body: SavePortfolioRoadmap) {
		await assertEditable(submissionId, "Portfolio Roadmap");

		if (body.header) {
			await mergeFormData(submissionId, {
				header: body.header,
				complianceChecklist: body.complianceChecklist ?? [],
			});
		} else if (body.complianceChecklist !== undefined) {
			await mergeFormData(submissionId, {
				complianceChecklist: body.complianceChecklist,
			});
		}

		await prisma.portfolioRoadmapRow.deleteMany({
			where: { portfolioRoadmapId: submissionId },
		});
		if (body.roadmapRows.length > 0) {
			await prisma.portfolioRoadmapRow.createMany({
				data: body.roadmapRows.map((row, idx) => ({
					id: crypto.randomUUID(),
					portfolioRoadmapId: submissionId,
					yearLevel: row.yearLevel,
					milestone: row.milestone,
					description: row.description,
					ploAlignment: row.ploAlignment ?? null,
					sortOrder: row.sortOrder ?? idx,
				})),
			});
		}

		await prisma.portfolioRubricRow.deleteMany({
			where: { portfolioRoadmapId: submissionId },
		});
		if (body.rubricRows.length > 0) {
			await prisma.portfolioRubricRow.createMany({
				data: body.rubricRows.map((row, idx) => ({
					id: crypto.randomUUID(),
					portfolioRoadmapId: submissionId,
					criterionName: row.criterionName,
					description: row.description,
					weightPct: row.weightPct,
					rubricLevels: row.rubricLevels as Prisma.InputJsonValue,
					sortOrder: row.sortOrder ?? idx,
				})),
			});
		}

		await periodicAudit(userId, "portfolio_roadmap.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- Submit gates --------------------------------------------------------------

// F20/F21: Biennial gate — no approved submission within 18 months
const BIENNIAL_BLOCK_MONTHS = 18;

async function assertBiennialGate(
	formTypeCode: string,
	submission: { id: string; programId: string | null },
): Promise<void> {
	if (!submission.programId) return;
	const formType = await prisma.formType.findUnique({
		where: { code: formTypeCode },
		select: { id: true },
	});
	if (!formType) return;

	const cutoff = new Date();
	cutoff.setMonth(cutoff.getMonth() - BIENNIAL_BLOCK_MONTHS);

	const recentApproved = await prisma.formSubmission.findFirst({
		where: {
			formTypeId: formType.id,
			programId: submission.programId,
			status: "approved",
			updatedAt: { gte: cutoff },
			id: { not: submission.id },
		},
		select: { id: true, updatedAt: true },
	});

	if (recentApproved) {
		throw new SubmitGateError(
			formTypeCode,
			`${formTypeCode} blocked: an approved submission exists from ${recentApproved.updatedAt.toISOString().slice(0, 10)} (within 18-month biennial window).`,
		);
	}
}

registerSubmitGate(ALUMNI_TRACER_CODE, (s) =>
	assertBiennialGate(ALUMNI_TRACER_CODE, s),
);
registerSubmitGate(EMPLOYER_SURVEY_CODE, (s) =>
	assertBiennialGate(EMPLOYER_SURVEY_CODE, s),
);

// F26: Systemic Gap Report — blocked unless 3+ consecutive NOT-MET cycles
registerSubmitGate(SYSTEMIC_GAP_CODE, async (submission) => {
	if (!submission.programId) {
		throw new SubmitGateError(
			SYSTEMIC_GAP_CODE,
			"Systemic Gap Report must be attached to a program.",
		);
	}
	const cohortType = await prisma.formType.findUnique({
		where: { code: "cohort_tracking" },
		select: { id: true },
	});
	if (!cohortType) {
		throw new SubmitGateError(
			SYSTEMIC_GAP_CODE,
			"No Cohort Tracking form type found — cannot verify trigger condition.",
		);
	}
	const recentCohort = await prisma.formSubmission.findFirst({
		where: {
			formTypeId: cohortType.id,
			programId: submission.programId,
			status: "approved",
		},
		orderBy: { updatedAt: "desc" },
		select: { formData: true },
	});
	if (!recentCohort) {
		throw new SubmitGateError(
			SYSTEMIC_GAP_CODE,
			"No approved Cohort Tracking Sheet found for this program.",
		);
	}
	const cohortData = (recentCohort.formData ?? {}) as {
		ploSummaries?: Array<{ status?: string }>;
	};
	const ploSummaries = cohortData.ploSummaries ?? [];
	const notMetCount = ploSummaries.filter((p) => p.status === "NOT_MET").length;
	if (notMetCount < 3) {
		throw new SubmitGateError(
			SYSTEMIC_GAP_CODE,
			`Systemic Gap Report blocked: requires 3+ consecutive NOT-MET PLOs (found ${notMetCount}).`,
		);
	}
});

// F27: CAPA Plan — blocked unless referenced systemic gap report is approved
registerSubmitGate(CAPA_PLAN_CODE, async (submission) => {
	const header = (submission.formData ?? {}) as {
		header?: { systemicGapReportId?: string };
	};
	const systemicGapReportId = header.header?.systemicGapReportId;
	if (!systemicGapReportId) {
		throw new SubmitGateError(
			CAPA_PLAN_CODE,
			"CAPA Plan blocked: must reference a Systemic Gap Report.",
		);
	}
	const gapReport = await prisma.formSubmission.findUnique({
		where: { id: systemicGapReportId },
		select: { status: true },
	});
	if (gapReport?.status !== "approved") {
		throw new SubmitGateError(
			CAPA_PLAN_CODE,
			"CAPA Plan blocked: referenced Systemic Gap Report is not approved.",
		);
	}
});

// --- Singleton exports --------------------------------------------------------

export const resourceMonitoringService = new ResourceMonitoringService();
export const alumniTracerService = new AlumniTracerService();
export const employerSurveyService = new EmployerSurveyService();
export const systemicGapReportService = new SystemicGapReportService();
export const capaPlanService = new CapaPlanService();
export const institutionalReviewService = new InstitutionalReviewService();
export const portfolioRoadmapService = new PortfolioRoadmapService();
