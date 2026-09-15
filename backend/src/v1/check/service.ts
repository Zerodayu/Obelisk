import { EDITABLE_STATUSES } from "@lib/forms/state-machine";
import { registerSubmitGate, SubmitGateError } from "@lib/forms/submit-gates";
import { prisma } from "@lib/prisma";
import type { MidCycleStatus, Prisma } from "@prisma/generated/prisma/client";
import { submissionService } from "@v1/forms/service";
import type {
	SaveCapstonePanelEvaluation,
	SaveCloPerceptionSurvey,
	SaveExhibitionFeedback,
	SaveMidCycleAttainment,
	SavePeerObservation,
	SavePortfolioAssessment,
	SaveStudentExitSurvey,
} from "./model";

// --- Form type codes -----------------------------------------------------------

const MID_CYCLE_CODE = "mid_cycle_attainment";
const PEER_OBS_CODE = "peer_observation";
const EXHIBITION_CODE = "exhibition_feedback";
const CLO_SURVEY_CODE = "clo_perception_survey";
const EXIT_SURVEY_CODE = "student_exit_survey";
const PORTFOLIO_ASSESS_CODE = "portfolio_assessment_record";
const CAPSTONE_PANEL_CODE = "capstone_panel_evaluation";

const FORM_TYPES = {
	[MID_CYCLE_CODE]: {
		name: "Mid-Cycle CLO Attainment Summary",
		sequenceNo: 21,
	},
	[PEER_OBS_CODE]: { name: "Peer Observation Record", sequenceNo: 22 },
	[EXHIBITION_CODE]: {
		name: "Portfolio Exhibition Industry Feedback Record",
		sequenceNo: 23,
	},
	[CLO_SURVEY_CODE]: {
		name: "CLO Achievement Perception Survey Tabulation",
		sequenceNo: 24,
	},
	[EXIT_SURVEY_CODE]: {
		name: "Student Exit Survey Tabulation",
		sequenceNo: 25,
	},
	[PORTFOLIO_ASSESS_CODE]: {
		name: "Portfolio Assessment Record with CLO Evidence",
		sequenceNo: 26,
	},
	[CAPSTONE_PANEL_CODE]: {
		name: "Capstone/Culminating Panel Evaluation Sheet",
		sequenceNo: 27,
	},
} as const;

type CheckFormCode = keyof typeof FORM_TYPES;

// --- Errors --------------------------------------------------------------------

export class CheckSubmissionNotFoundError extends Error {
	constructor(id: string) {
		super(`CHECK submission '${id}' not found`);
		this.name = "CheckSubmissionNotFoundError";
	}
}

export class CheckInvalidEditError extends Error {
	constructor(form: string) {
		super(
			`${form} content may only be edited while the submission is draft or returned.`,
		);
		this.name = "CheckInvalidEditError";
	}
}

// --- Shared helpers ------------------------------------------------------------

async function ensureCheckFormType(code: CheckFormCode): Promise<string> {
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
				pdcaStage: "CHECK",
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

async function checkAudit(
	userId: string,
	action: string,
	details: Record<string, unknown>,
): Promise<void> {
	await prisma.auditLog.create({
		data: {
			id: crypto.randomUUID(),
			userId,
			action,
			moduleAffected: "check",
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
	if (!submission) throw new CheckSubmissionNotFoundError(submissionId);
	if (
		!EDITABLE_STATUSES.includes(
			submission.status as (typeof EDITABLE_STATUSES)[number],
		)
	) {
		throw new CheckInvalidEditError(form);
	}
}

async function ensureCheckDraft(
	code: CheckFormCode,
	programId: string,
	termId: string,
	userId: string,
): Promise<{ id: string }> {
	const formTypeId = await ensureCheckFormType(code);
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

export async function listCheckSubmissions(
	formTypeCode: CheckFormCode,
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

// --- F08 mid_cycle_attainment -------------------------------------------------

export class MidCycleAttainmentService {
	async init(programId: string, termId: string, userId: string) {
		const draft = await ensureCheckDraft(
			MID_CYCLE_CODE,
			programId,
			termId,
			userId,
		);
		await checkAudit(userId, "mid_cycle_attainment.initialized", {
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
				midCycleCohortRows: {
					orderBy: [{ yearLevel: "asc" }, { cloCode: "asc" }],
				},
			},
		});
		if (!submission) throw new CheckSubmissionNotFoundError(submissionId);
		return {
			id: submission.id,
			status: submission.status,
			header: (submission.formData as Record<string, unknown>)?.header ?? {},
			cohortRows: submission.midCycleCohortRows,
		};
	}

	async save(
		submissionId: string,
		userId: string,
		body: SaveMidCycleAttainment,
	) {
		await assertEditable(submissionId, "Mid-Cycle Attainment");

		if (body.header) {
			await mergeFormData(submissionId, { header: body.header });
		}

		await prisma.midCycleCohortRow.deleteMany({
			where: { midCycleAttainmentId: submissionId },
		});
		if (body.cohortRows.length > 0) {
			await prisma.midCycleCohortRow.createMany({
				data: body.cohortRows.map((row) => ({
					id: crypto.randomUUID(),
					midCycleAttainmentId: submissionId,
					yearLevel: row.yearLevel,
					cloCode: row.cloCode,
					cloDescription: row.cloDescription ?? null,
					attainmentPct: row.attainmentPct,
					benchmarkPct: row.benchmarkPct ?? 70,
					status: (row.status ?? "pending") as MidCycleStatus,
					studentCount: row.studentCount ?? 0,
					belowTargetCount: row.belowTargetCount ?? 0,
				})),
			});
		}

		await checkAudit(userId, "mid_cycle_attainment.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- F10 peer_observation -----------------------------------------------------

export class PeerObservationService {
	async init(programId: string, termId: string, userId: string) {
		const draft = await ensureCheckDraft(
			PEER_OBS_CODE,
			programId,
			termId,
			userId,
		);
		await checkAudit(userId, "peer_observation.initialized", {
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
		if (!submission) throw new CheckSubmissionNotFoundError(submissionId);
		const data = (submission.formData ?? {}) as Record<string, unknown>;
		return {
			id: submission.id,
			status: submission.status,
			header: data.header ?? {},
			criteria: data.criteria ?? {},
			strengths: data.strengths ?? null,
			areasForImprovement: data.areasForImprovement ?? null,
			cqiImplications: data.cqiImplications ?? null,
		};
	}

	async save(submissionId: string, userId: string, body: SavePeerObservation) {
		await assertEditable(submissionId, "Peer Observation");

		const patch: Record<string, unknown> = {};
		if (body.header) patch.header = body.header;
		if (body.criteria) patch.criteria = body.criteria;
		if (body.strengths !== undefined) patch.strengths = body.strengths;
		if (body.areasForImprovement !== undefined)
			patch.areasForImprovement = body.areasForImprovement;
		if (body.cqiImplications !== undefined)
			patch.cqiImplications = body.cqiImplications;

		await mergeFormData(submissionId, patch);
		await checkAudit(userId, "peer_observation.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- F11 exhibition_feedback --------------------------------------------------

export class ExhibitionFeedbackService {
	async init(programId: string, termId: string, userId: string) {
		const draft = await ensureCheckDraft(
			EXHIBITION_CODE,
			programId,
			termId,
			userId,
		);
		await checkAudit(userId, "exhibition_feedback.initialized", {
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
				exhibitionGuestRows: { orderBy: { guestName: "asc" } },
			},
		});
		if (!submission) throw new CheckSubmissionNotFoundError(submissionId);
		return {
			id: submission.id,
			status: submission.status,
			header: (submission.formData as Record<string, unknown>)?.header ?? {},
			guests: submission.exhibitionGuestRows,
			qualitativeFeedback:
				(submission.formData as Record<string, unknown>)?.qualitativeFeedback ??
				null,
		};
	}

	async save(
		submissionId: string,
		userId: string,
		body: SaveExhibitionFeedback,
	) {
		await assertEditable(submissionId, "Exhibition Feedback");

		if (body.header) {
			await mergeFormData(submissionId, {
				header: body.header,
				qualitativeFeedback: body.qualitativeFeedback ?? null,
			});
		} else if (body.qualitativeFeedback !== undefined) {
			await mergeFormData(submissionId, {
				qualitativeFeedback: body.qualitativeFeedback,
			});
		}

		await prisma.exhibitionGuestRow.deleteMany({
			where: { exhibitionFeedbackId: submissionId },
		});
		if (body.guests.length > 0) {
			await prisma.exhibitionGuestRow.createMany({
				data: body.guests.map((row) => ({
					id: crypto.randomUUID(),
					exhibitionFeedbackId: submissionId,
					guestName: row.guestName,
					guestAffiliation: row.guestAffiliation ?? null,
					ploRatings: row.ploRatings as Prisma.InputJsonValue,
					overallComments: row.overallComments ?? null,
				})),
			});
		}

		await checkAudit(userId, "exhibition_feedback.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- F12 clo_perception_survey ------------------------------------------------

export class CloPerceptionSurveyService {
	async init(programId: string, termId: string, userId: string) {
		const draft = await ensureCheckDraft(
			CLO_SURVEY_CODE,
			programId,
			termId,
			userId,
		);
		await checkAudit(userId, "clo_perception_survey.initialized", {
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
		if (!submission) throw new CheckSubmissionNotFoundError(submissionId);
		const data = (submission.formData ?? {}) as Record<string, unknown>;
		return {
			id: submission.id,
			status: submission.status,
			header: data.header ?? {},
			cloRows: data.cloRows ?? [],
			divergenceNotes: data.divergenceNotes ?? null,
		};
	}

	async save(
		submissionId: string,
		userId: string,
		body: SaveCloPerceptionSurvey,
	) {
		await assertEditable(submissionId, "CLO Perception Survey");

		const patch: Record<string, unknown> = {};
		if (body.header) patch.header = body.header;
		if (body.cloRows) patch.cloRows = body.cloRows;
		if (body.divergenceNotes !== undefined)
			patch.divergenceNotes = body.divergenceNotes;

		await mergeFormData(submissionId, patch);
		await checkAudit(userId, "clo_perception_survey.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- F17 student_exit_survey --------------------------------------------------

export class StudentExitSurveyService {
	async init(programId: string, termId: string, userId: string) {
		const draft = await ensureCheckDraft(
			EXIT_SURVEY_CODE,
			programId,
			termId,
			userId,
		);
		await checkAudit(userId, "student_exit_survey.initialized", {
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
		if (!submission) throw new CheckSubmissionNotFoundError(submissionId);
		const data = (submission.formData ?? {}) as Record<string, unknown>;
		return {
			id: submission.id,
			status: submission.status,
			header: data.header ?? {},
			ploRows: data.ploRows ?? [],
			divergenceInvestigationNotes: data.divergenceInvestigationNotes ?? null,
			qualitativeThemes: data.qualitativeThemes ?? null,
		};
	}

	async save(
		submissionId: string,
		userId: string,
		body: SaveStudentExitSurvey,
	) {
		await assertEditable(submissionId, "Student Exit Survey");

		const patch: Record<string, unknown> = {};
		if (body.header) patch.header = body.header;
		if (body.ploRows) patch.ploRows = body.ploRows;
		if (body.divergenceInvestigationNotes !== undefined)
			patch.divergenceInvestigationNotes = body.divergenceInvestigationNotes;
		if (body.qualitativeThemes !== undefined)
			patch.qualitativeThemes = body.qualitativeThemes;

		await mergeFormData(submissionId, patch);
		await checkAudit(userId, "student_exit_survey.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- F18 portfolio_assessment_record -----------------------------------------

export class PortfolioAssessmentService {
	async init(programId: string, termId: string, userId: string) {
		const draft = await ensureCheckDraft(
			PORTFOLIO_ASSESS_CODE,
			programId,
			termId,
			userId,
		);
		await checkAudit(userId, "portfolio_assessment_record.initialized", {
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
				portfolioCriterionRows: { orderBy: { cloCode: "asc" } },
			},
		});
		if (!submission) throw new CheckSubmissionNotFoundError(submissionId);
		return {
			id: submission.id,
			status: submission.status,
			header: (submission.formData as Record<string, unknown>)?.header ?? {},
			criteriaRows: submission.portfolioCriterionRows,
		};
	}

	async save(
		submissionId: string,
		userId: string,
		body: SavePortfolioAssessment,
	) {
		await assertEditable(submissionId, "Portfolio Assessment Record");

		if (body.header) {
			await mergeFormData(submissionId, { header: body.header });
		}

		await prisma.portfolioCriterionRow.deleteMany({
			where: { portfolioAssessmentId: submissionId },
		});
		if (body.criteriaRows.length > 0) {
			await prisma.portfolioCriterionRow.createMany({
				data: body.criteriaRows.map((row) => ({
					id: crypto.randomUUID(),
					portfolioAssessmentId: submissionId,
					cloCode: row.cloCode,
					cloDescription: row.cloDescription ?? null,
					criterionName: row.criterionName,
					maxScore: row.maxScore ?? 5,
					assessor1Score: row.assessor1Score ?? null,
					assessor2Score: row.assessor2Score ?? null,
					industryScore: row.industryScore ?? null,
					consensusScore: row.consensusScore ?? null,
					attainmentPct: null,
					evidenceNotes: row.evidenceNotes ?? null,
				})),
			});
		}

		await checkAudit(userId, "portfolio_assessment_record.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- F19 capstone_panel_evaluation -------------------------------------------

export class CapstonePanelEvaluationService {
	async init(programId: string, termId: string, userId: string) {
		const draft = await ensureCheckDraft(
			CAPSTONE_PANEL_CODE,
			programId,
			termId,
			userId,
		);
		await checkAudit(userId, "capstone_panel_evaluation.initialized", {
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
				capstonePanelistRows: { orderBy: { panelistName: "asc" } },
			},
		});
		if (!submission) throw new CheckSubmissionNotFoundError(submissionId);
		const data = (submission.formData ?? {}) as Record<string, unknown>;
		return {
			id: submission.id,
			status: submission.status,
			header: data.header ?? {},
			panelistRows: submission.capstonePanelistRows,
			programReadinessDeclaration: data.programReadinessDeclaration ?? null,
			cqiActionRequired: data.cqiActionRequired ?? null,
		};
	}

	async save(
		submissionId: string,
		userId: string,
		body: SaveCapstonePanelEvaluation,
	) {
		await assertEditable(submissionId, "Capstone Panel Evaluation");

		const patch: Record<string, unknown> = {};
		if (body.header) patch.header = body.header;
		if (body.programReadinessDeclaration !== undefined)
			patch.programReadinessDeclaration = body.programReadinessDeclaration;
		if (body.cqiActionRequired !== undefined)
			patch.cqiActionRequired = body.cqiActionRequired;

		await mergeFormData(submissionId, patch);

		await prisma.capstonePanelistRow.deleteMany({
			where: { capstonePanelEvalId: submissionId },
		});
		if (body.panelistRows.length > 0) {
			await prisma.capstonePanelistRow.createMany({
				data: body.panelistRows.map((row) => ({
					id: crypto.randomUUID(),
					capstonePanelEvalId: submissionId,
					panelistName: row.panelistName,
					panelistRole: row.panelistRole,
					ploRatings: row.ploRatings as Prisma.InputJsonValue,
					overallComments: row.overallComments ?? null,
				})),
			});
		}

		await checkAudit(userId, "capstone_panel_evaluation.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- Submit gates --------------------------------------------------------------

// F11: Exhibition Feedback requires ≥3 industry guests
registerSubmitGate(EXHIBITION_CODE, async (submission) => {
	const guestCount = await prisma.exhibitionGuestRow.count({
		where: { exhibitionFeedbackId: submission.id },
	});
	if (guestCount < 3) {
		throw new SubmitGateError(
			EXHIBITION_CODE,
			`Exhibition Feedback blocked: requires at least 3 industry guests (found ${guestCount}).`,
		);
	}
});

// F19: Capstone Panel requires ≥2 faculty + ≥1 industry panelists
registerSubmitGate(CAPSTONE_PANEL_CODE, async (submission) => {
	const panelists = await prisma.capstonePanelistRow.findMany({
		where: { capstonePanelEvalId: submission.id },
		select: { panelistRole: true },
	});
	const facultyCount = panelists.filter(
		(p) => p.panelistRole === "faculty",
	).length;
	const industryCount = panelists.filter(
		(p) => p.panelistRole === "industry",
	).length;
	if (facultyCount < 2 || industryCount < 1) {
		throw new SubmitGateError(
			CAPSTONE_PANEL_CODE,
			`Capstone Panel blocked: requires at least 2 faculty + 1 industry panelist (found ${facultyCount} faculty, ${industryCount} industry).`,
		);
	}
});

// --- Singleton exports --------------------------------------------------------

export const midCycleAttainmentService = new MidCycleAttainmentService();
export const peerObservationService = new PeerObservationService();
export const exhibitionFeedbackService = new ExhibitionFeedbackService();
export const cloPerceptionSurveyService = new CloPerceptionSurveyService();
export const studentExitSurveyService = new StudentExitSurveyService();
export const portfolioAssessmentService = new PortfolioAssessmentService();
export const capstonePanelEvaluationService =
	new CapstonePanelEvaluationService();
