import { EDITABLE_STATUSES } from "@lib/forms/state-machine";
import { prisma } from "@lib/prisma";
import type { Prisma } from "@prisma/generated/prisma/client";
import { submissionService } from "@v1/forms/service";
import {
	assertPloTargetsValid,
	budgetTotals,
	coverageCheck,
	programPloAverages,
} from "./compute";
import type {
	AssessmentBudgetPayload,
	AssessmentCalendarPayload,
	CurriculumMapPayload,
	PlanSubmissionListItem,
	SaveAssessmentBudget,
	SaveAssessmentCalendar,
	SaveCurriculumMap,
	SaveTargetSettingMatrix,
	TargetSettingMatrixPayload,
} from "./model";

const CURRICULUM_MAP_CODE = "curriculum_map";
const CALENDAR_CODE = "assessment_calendar";
const TARGET_MATRIX_CODE = "target_setting_matrix";
const BUDGET_CODE = "assessment_budget";

const FORM_TYPES = {
	[CURRICULUM_MAP_CODE]: {
		name: "CLO-PLO Curriculum Map",
		sequenceNo: 1,
	},
	[CALENDAR_CODE]: {
		name: "Assessment Calendar with Cohort Tracking Milestones",
		sequenceNo: 3,
	},
	[TARGET_MATRIX_CODE]: {
		name: "Target-Setting Matrix",
		sequenceNo: 4,
	},
	[BUDGET_CODE]: {
		name: "Approved Assessment Budget",
		sequenceNo: 6,
	},
} as const;

// --- Seeded template content ---------------------------------------------------

const SEMESTER1_TEMPLATES: Array<[string, string, string]> = [
	["pac_convening", "June-July", "PAC convening and assessment planning"],
	["syllabi_finalization", "June-July", "OBE syllabi finalization"],
	["orientation", "Weeks 1-2", "Orientation and expectations setting"],
	["formative", "Weeks 3-5", "Formative assessments"],
	["midterm", "Weeks 7-9", "Midterm examinations"],
	["finals", "Weeks 15-18", "Final examinations"],
	["car_submission", "Within 10 days after term", "CAR submission per course"],
	["consolidation", "Within 4 weeks after term", "Attainment consolidation"],
	["cqi_plan", "Before next semester", "CQI action plan drafting"],
];

const ANNUAL_TEMPLATES: Array<[string, string, string]> = [
	["sem2_cycle", "Semester 2", "Semester 2 repeat assessment cycle"],
	["y3_portfolio_review", "Semester 2", "Year 3 Portfolio Review"],
	["y4_exhibition", "Semester 2", "Year 4 Portfolio Exhibition"],
	["apar", "June 30", "Annual Program Assessment Report submission"],
	["ctl", "End of academic year", "Closing-the-Loop report"],
	["institutional_review", "July 15", "Institutional Management Review"],
	[
		"alumni_employer_surveys",
		"Biennial",
		"Alumni tracer / employer survey window",
	],
	["escalation", "30 days after deadline", "Escalation for overdue forms"],
];

const FIXED_BUDGET_ITEMS: Array<{
	name: string;
	phase: "plan" | "do" | "check" | "act";
}> = [
	{ name: "Industry Practitioner Calibration", phase: "plan" },
	{ name: "Stakeholder Consultation", phase: "plan" },
	{ name: "Student Exit Survey admin", phase: "do" },
	{ name: "CLO Perception Survey", phase: "do" },
	{ name: "Portfolio Exhibition", phase: "do" },
	{ name: "Peer Observation support", phase: "do" },
	{ name: "Capstone Panel honoraria", phase: "do" },
	{ name: "Survey tabulation", phase: "check" },
	{ name: "Alumni Tracer", phase: "check" },
	{ name: "Employer Survey", phase: "check" },
	{ name: "CQI planning support", phase: "act" },
	{ name: "Contingency/Miscellaneous", phase: "act" },
];

const MIN_ATTAINMENT_PCT = 70;
const DEFAULT_TARGET = MIN_ATTAINMENT_PCT;

// --- Errors ---------------------------------------------------------------------

export class PlanSubmissionNotFoundError extends Error {
	constructor(id: string) {
		super(`PLAN submission '${id}' not found`);
		this.name = "PlanSubmissionNotFoundError";
	}
}

export class PlanSourceNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PlanSourceNotFoundError";
	}
}

export class PlanInvalidEditError extends Error {
	constructor(form: string) {
		super(
			`${form} content may only be edited while the submission is draft or returned.`,
		);
		this.name = "PlanInvalidEditError";
	}
}

export class PlanTemplateProtectedError extends Error {
	constructor(form: string) {
		super(`${form} template rows cannot be deleted.`);
		this.name = "PlanTemplateProtectedError";
	}
}

// --- Shared helpers ---------------------------------------------------------------

async function ensurePlanFormType(
	code: keyof typeof FORM_TYPES,
): Promise<string> {
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
				pdcaStage: "PLAN",
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

async function planAudit(
	userId: string,
	action: string,
	details: Record<string, unknown>,
): Promise<void> {
	await prisma.auditLog.create({
		data: {
			id: crypto.randomUUID(),
			userId,
			action,
			moduleAffected: "plan",
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
	if (!submission) throw new PlanSubmissionNotFoundError(submissionId);
	if (
		!EDITABLE_STATUSES.includes(
			submission.status as (typeof EDITABLE_STATUSES)[number],
		)
	) {
		throw new PlanInvalidEditError(form);
	}
}

/** Find-or-create the single active draft for a PLAN form + program + term. */
async function ensureDraft(
	code: keyof typeof FORM_TYPES,
	programId: string,
	termId: string,
	userId: string,
): Promise<{ id: string }> {
	const formTypeId = await ensurePlanFormType(code);
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

export async function listPlanSubmissions(
	formTypeCode: keyof typeof FORM_TYPES,
	opts: { programId?: string } = {},
): Promise<PlanSubmissionListItem[]> {
	const formType = await prisma.formType.findUnique({
		where: { code: formTypeCode },
		select: { id: true },
	});
	if (!formType) return [];

	return prisma.formSubmission.findMany({
		where: {
			formTypeId: formType.id,
			...(opts.programId ? { programId: opts.programId } : {}),
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

function toNumber(value: Prisma.Decimal | number | null): number | null {
	if (value === null || value === undefined) return null;
	return Number(value);
}

// --- curriculum_map -----------------------------------------------------------------

export class CurriculumMapService {
	async init(
		programId: string,
		termId: string,
		userId: string,
	): Promise<{ draft: { id: string }; payload: CurriculumMapPayload }> {
		const program = await prisma.program.findUnique({
			where: { id: programId },
			select: { id: true },
		});
		if (!program) {
			throw new PlanSourceNotFoundError(`Program '${programId}' not found`);
		}
		const draft = await ensureDraft(
			CURRICULUM_MAP_CODE,
			programId,
			termId,
			userId,
		);
		await planAudit(userId, "curriculum_map.initialized", {
			targetRecordId: draft.id,
			programId,
			termId,
		});
		const payload = await this.get(draft.id);
		return { draft, payload };
	}

	async get(submissionId: string): Promise<CurriculumMapPayload> {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: {
				id: true,
				formType: { select: { code: true } },
				formData: true,
				directoryRows: { orderBy: { sortOrder: "asc" } },
				courseRows: {
					orderBy: [{ yearLevel: "asc" }, { sortOrder: "asc" }],
					include: { cells: { orderBy: { ploCode: "asc" } } },
				},
			},
		});
		if (!submission || submission.formType.code !== CURRICULUM_MAP_CODE) {
			throw new PlanSubmissionNotFoundError(submissionId);
		}

		return {
			formSubmissionId: submission.id,
			generatedAt: new Date().toISOString(),
			header:
				(((submission.formData ?? {}) as Record<string, unknown>)
					.header as Record<string, unknown>) ?? {},
			directoryRows: submission.directoryRows.map((row) => ({
				id: row.id,
				ploId: row.ploId,
				code: row.code,
				statement: row.statement,
				evidenceSources: row.evidenceSources,
				dStageCourse: row.dStageCourse,
				validationStatus: row.validationStatus,
			})),
			courseRows: submission.courseRows.map((row) => ({
				id: row.id,
				yearLevel: row.yearLevel,
				courseCode: row.courseCode,
				courseTitle: row.courseTitle,
				cells: row.cells.map((cell) => ({
					id: cell.id,
					ploCode: cell.ploCode,
					stage: cell.stage,
					cloCodes: cell.cloCodes,
				})),
			})),
			coverageCheck: coverageCheck(
				submission.courseRows.map((row) => ({ cells: row.cells })),
			),
		};
	}

	async save(
		submissionId: string,
		userId: string,
		body: SaveCurriculumMap,
	): Promise<CurriculumMapPayload> {
		await assertEditable(submissionId, "Curriculum map");

		const ploRows = await prisma.plo.findMany({
			select: { id: true, code: true },
		});
		const ploByCode = new Map(ploRows.map((p) => [p.code, p.id]));

		await prisma.$transaction(async (tx) => {
			await tx.ploDirectoryRow.deleteMany({
				where: { curriculumMapId: submissionId },
			});
			for (const [i, plo] of body.plos.entries()) {
				await tx.ploDirectoryRow.create({
					data: {
						id: crypto.randomUUID(),
						curriculumMapId: submissionId,
						ploId: ploByCode.get(plo.ploCode) ?? null,
						code: plo.ploCode,
						statement: plo.statement,
						evidenceSources: plo.evidenceSources,
						dStageCourse: plo.dStageCourse ?? null,
						validationStatus: plo.validationStatus ?? "pending_review",
						sortOrder: i,
					},
				});
			}

			await tx.curriculumCourseRow.deleteMany({
				where: { curriculumMapId: submissionId },
			});
			let courseOrder = 0;
			for (const course of [...body.courses].sort(
				(a, b) => a.yearLevel - b.yearLevel,
			)) {
				const courseRow = await tx.curriculumCourseRow.create({
					data: {
						id: crypto.randomUUID(),
						curriculumMapId: submissionId,
						yearLevel: course.yearLevel,
						courseCode: course.courseCode,
						courseTitle: course.courseTitle,
						sortOrder: courseOrder++,
					},
				});
				for (const cell of course.cells) {
					await tx.curriculumMapCell.create({
						data: {
							id: crypto.randomUUID(),
							courseRowId: courseRow.id,
							ploCode: cell.ploCode,
							ploId: ploByCode.get(cell.ploCode) ?? null,
							stage: cell.stage ?? null,
							cloCodes: cell.cloCodes ?? null,
						},
					});
				}
			}
		});

		if (body.header) {
			await mergeFormData(submissionId, { header: body.header });
		}
		await planAudit(userId, "curriculum_map.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- assessment_calendar --------------------------------------------------------------

export class AssessmentCalendarService {
	async init(
		programId: string,
		termId: string,
		userId: string,
	): Promise<{ draft: { id: string }; payload: AssessmentCalendarPayload }> {
		const program = await prisma.program.findUnique({
			where: { id: programId },
			select: { id: true },
		});
		if (!program) {
			throw new PlanSourceNotFoundError(`Program '${programId}' not found`);
		}
		const draft = await ensureDraft(CALENDAR_CODE, programId, termId, userId);
		await this.seedTemplates(draft.id);
		await planAudit(userId, "assessment_calendar.initialized", {
			targetRecordId: draft.id,
			programId,
			termId,
		});
		const payload = await this.get(draft.id);
		return { draft, payload };
	}

	private async seedTemplates(submissionId: string): Promise<void> {
		const templateCount = await prisma.calendarEventRow.count({
			where: { assessmentCalendarId: submissionId, isTemplate: true },
		});
		if (templateCount > 0) return;

		let order = 0;
		const templateRow = (
			section: "semester1" | "annual_and_semester2",
			[templateKey, periodWeeks, activity]: [string, string, string],
		) => ({
			id: crypto.randomUUID(),
			assessmentCalendarId: submissionId,
			section,
			templateKey,
			isTemplate: true,
			periodWeeks,
			activity,
			cohortYears: [] as number[],
			responsibleParty: null,
			outputForms: [] as string[],
			sortOrder: order++,
		});
		const rows = [
			...SEMESTER1_TEMPLATES.map((t) => templateRow("semester1", t)),
			...ANNUAL_TEMPLATES.map((t) => templateRow("annual_and_semester2", t)),
		];
		await prisma.calendarEventRow.createMany({ data: rows });
	}

	async get(submissionId: string): Promise<AssessmentCalendarPayload> {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: {
				id: true,
				formType: { select: { code: true } },
				formData: true,
				calendarRows: { orderBy: { sortOrder: "asc" } },
			},
		});
		if (!submission || submission.formType.code !== CALENDAR_CODE) {
			throw new PlanSubmissionNotFoundError(submissionId);
		}

		return {
			formSubmissionId: submission.id,
			generatedAt: new Date().toISOString(),
			header:
				(((submission.formData ?? {}) as Record<string, unknown>)
					.header as Record<string, unknown>) ?? {},
			events: submission.calendarRows.map((row) => ({
				id: row.id,
				section: row.section,
				templateKey: row.templateKey,
				isTemplate: row.isTemplate,
				periodWeeks: row.periodWeeks,
				activity: row.activity,
				cohortYears: row.cohortYears,
				responsibleParty: row.responsibleParty,
				outputForms: row.outputForms,
			})),
		};
	}

	async save(
		submissionId: string,
		userId: string,
		body: SaveAssessmentCalendar,
	): Promise<AssessmentCalendarPayload> {
		await assertEditable(submissionId, "Assessment calendar");

		const existing = await prisma.calendarEventRow.findMany({
			where: { assessmentCalendarId: submissionId },
			select: { id: true, isTemplate: true, sortOrder: true },
		});
		const byId = new Map(existing.map((r) => [r.id, r]));

		for (const removeId of body.removeEventIds ?? []) {
			const row = byId.get(removeId);
			if (!row || row.isTemplate) {
				throw new PlanTemplateProtectedError("Assessment calendar");
			}
		}

		await prisma.$transaction(async (tx) => {
			for (const removeId of body.removeEventIds ?? []) {
				await tx.calendarEventRow.delete({ where: { id: removeId } });
			}

			let nextOrder =
				existing.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1;
			for (const event of body.events) {
				const patch = {
					...(event.section !== undefined ? { section: event.section } : {}),
					...(event.periodWeeks !== undefined
						? { periodWeeks: event.periodWeeks }
						: {}),
					...(event.activity !== undefined ? { activity: event.activity } : {}),
					...(event.cohortYears !== undefined
						? { cohortYears: event.cohortYears }
						: {}),
					...(event.responsibleParty !== undefined
						? { responsibleParty: event.responsibleParty }
						: {}),
					...(event.outputForms !== undefined
						? { outputForms: event.outputForms }
						: {}),
				};
				if (event.id && byId.has(event.id)) {
					await tx.calendarEventRow.update({
						where: { id: event.id },
						data: patch,
					});
				} else if (event.id && !byId.has(event.id)) {
					throw new PlanSubmissionNotFoundError(event.id);
				} else {
					await tx.calendarEventRow.create({
						data: {
							id: crypto.randomUUID(),
							assessmentCalendarId: submissionId,
							isTemplate: false,
							templateKey: null,
							section: event.section,
							periodWeeks: event.periodWeeks ?? null,
							activity: event.activity ?? "",
							cohortYears: event.cohortYears ?? [],
							responsibleParty: event.responsibleParty ?? null,
							outputForms: event.outputForms ?? [],
							sortOrder: nextOrder++,
						},
					});
				}
			}
		});

		if (body.header) {
			await mergeFormData(submissionId, { header: body.header });
		}
		await planAudit(userId, "assessment_calendar.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- target_setting_matrix --------------------------------------------------------------

export class TargetSettingMatrixService {
	async init(
		programId: string,
		termId: string,
		userId: string,
	): Promise<{ draft: { id: string }; payload: TargetSettingMatrixPayload }> {
		const program = await prisma.program.findUnique({
			where: { id: programId },
			select: { id: true, plos: { orderBy: { code: "asc" } } },
		});
		if (!program) {
			throw new PlanSourceNotFoundError(`Program '${programId}' not found`);
		}
		const draft = await ensureDraft(
			TARGET_MATRIX_CODE,
			programId,
			termId,
			userId,
		);
		await this.seedPloRows(draft.id, program.plos);
		await planAudit(userId, "target_setting_matrix.initialized", {
			targetRecordId: draft.id,
			programId,
			termId,
		});
		const payload = await this.get(draft.id);
		return { draft, payload };
	}

	private async seedPloRows(
		submissionId: string,
		plos: { id: string; code: string; description: string }[],
	): Promise<void> {
		const rowCount = await prisma.ploTargetRow.count({
			where: { targetSettingMatrixId: submissionId },
		});
		if (rowCount > 0) return;

		await prisma.ploTargetRow.createMany({
			data: plos.map((plo, i) => ({
				id: crypto.randomUUID(),
				targetSettingMatrixId: submissionId,
				ploId: plo.id,
				ploCode: plo.code,
				statement: plo.description,
				y1TargetPct: DEFAULT_TARGET,
				y2TargetPct: DEFAULT_TARGET,
				y3TargetPct: DEFAULT_TARGET,
				y4TargetPct: DEFAULT_TARGET,
				rationale: null,
				sortOrder: i,
			})),
		});
	}

	async get(submissionId: string): Promise<TargetSettingMatrixPayload> {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: {
				id: true,
				formType: { select: { code: true } },
				formData: true,
				ploTargetRows: { orderBy: { sortOrder: "asc" } },
				cloTargetRows: { orderBy: { sortOrder: "asc" } },
			},
		});
		if (!submission || submission.formType.code !== TARGET_MATRIX_CODE) {
			throw new PlanSubmissionNotFoundError(submissionId);
		}

		const ploRows = submission.ploTargetRows.map((row) => ({
			id: row.id,
			ploId: row.ploId,
			ploCode: row.ploCode,
			statement: row.statement,
			targets: [
				Number(row.y1TargetPct),
				Number(row.y2TargetPct),
				Number(row.y3TargetPct),
				Number(row.y4TargetPct),
			] as [number, number, number, number],
			rationale: row.rationale,
		}));

		return {
			formSubmissionId: submission.id,
			generatedAt: new Date().toISOString(),
			header:
				(((submission.formData ?? {}) as Record<string, unknown>)
					.header as Record<string, unknown>) ?? {},
			ploRows,
			programPloAvg: programPloAverages(
				ploRows.map((row) => ({ ploCode: row.ploCode, targets: row.targets })),
			),
			courseRows: submission.cloTargetRows.map((row) => ({
				id: row.id,
				courseCode: row.courseCode,
				courseTitle: row.courseTitle,
				cloCode: row.cloCode,
				targets: [
					toNumber(row.y1TargetPct),
					toNumber(row.y2TargetPct),
					toNumber(row.y3TargetPct),
					toNumber(row.y4TargetPct),
				],
				notes: row.notes,
			})),
		};
	}

	async save(
		submissionId: string,
		userId: string,
		body: SaveTargetSettingMatrix,
	): Promise<TargetSettingMatrixPayload> {
		await assertEditable(submissionId, "Target-setting matrix");

		for (const row of body.ploRows) {
			assertPloTargetsValid({
				ploCode: row.ploCode,
				targets: [
					row.y1TargetPct,
					row.y2TargetPct,
					row.y3TargetPct,
					row.y4TargetPct,
				],
				rationale: row.rationale,
			});
		}

		const ploRows = await prisma.plo.findMany({
			select: { id: true, code: true },
		});
		const ploByCode = new Map(ploRows.map((p) => [p.code, p.id]));

		await prisma.$transaction(async (tx) => {
			await tx.ploTargetRow.deleteMany({
				where: { targetSettingMatrixId: submissionId },
			});
			for (const [i, row] of body.ploRows.entries()) {
				await tx.ploTargetRow.create({
					data: {
						id: crypto.randomUUID(),
						targetSettingMatrixId: submissionId,
						ploId: ploByCode.get(row.ploCode) ?? null,
						ploCode: row.ploCode,
						statement: row.statement ?? null,
						y1TargetPct: row.y1TargetPct,
						y2TargetPct: row.y2TargetPct,
						y3TargetPct: row.y3TargetPct,
						y4TargetPct: row.y4TargetPct,
						rationale: row.rationale ?? null,
						sortOrder: i,
					},
				});
			}

			await tx.courseCloTargetRow.deleteMany({
				where: { targetSettingMatrixId: submissionId },
			});
			for (const [i, row] of body.courseRows.entries()) {
				await tx.courseCloTargetRow.create({
					data: {
						id: crypto.randomUUID(),
						targetSettingMatrixId: submissionId,
						courseCode: row.courseCode,
						courseTitle: row.courseTitle ?? null,
						cloCode: row.cloCode,
						y1TargetPct: row.y1TargetPct,
						y2TargetPct: row.y2TargetPct,
						y3TargetPct: row.y3TargetPct,
						y4TargetPct: row.y4TargetPct,
						notes: row.notes ?? null,
						sortOrder: i,
					},
				});
			}
		});

		if (body.header) {
			await mergeFormData(submissionId, { header: body.header });
		}
		await planAudit(userId, "target_setting_matrix.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

// --- assessment_budget ---------------------------------------------------------------------

export class AssessmentBudgetService {
	async init(
		programId: string,
		termId: string,
		userId: string,
	): Promise<{ draft: { id: string }; payload: AssessmentBudgetPayload }> {
		const program = await prisma.program.findUnique({
			where: { id: programId },
			select: { id: true },
		});
		if (!program) {
			throw new PlanSourceNotFoundError(`Program '${programId}' not found`);
		}
		const draft = await ensureDraft(BUDGET_CODE, programId, termId, userId);
		await this.seedFixedItems(draft.id);
		await planAudit(userId, "assessment_budget.initialized", {
			targetRecordId: draft.id,
			programId,
			termId,
		});
		const payload = await this.get(draft.id);
		return { draft, payload };
	}

	private async seedFixedItems(submissionId: string): Promise<void> {
		const fixedCount = await prisma.budgetLineItem.count({
			where: { assessmentBudgetId: submissionId, isFixed: true },
		});
		if (fixedCount > 0) return;

		await prisma.budgetLineItem.createMany({
			data: FIXED_BUDGET_ITEMS.map((item) => ({
				id: crypto.randomUUID(),
				assessmentBudgetId: submissionId,
				phase: item.phase,
				name: item.name,
				isFixed: true,
				estimatedCost: 0,
				approvedCost: null,
				source: null,
				notes: null,
			})),
		});
	}

	async get(submissionId: string): Promise<AssessmentBudgetPayload> {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: {
				id: true,
				formType: { select: { code: true } },
				formData: true,
				budgetLines: { orderBy: { id: "asc" } },
			},
		});
		if (!submission || submission.formType.code !== BUDGET_CODE) {
			throw new PlanSubmissionNotFoundError(submissionId);
		}

		const lineItems = submission.budgetLines.map((line) => ({
			id: line.id,
			phase: line.phase,
			name: line.name,
			isFixed: line.isFixed,
			estimatedCost: Number(line.estimatedCost),
			approvedCost: toNumber(line.approvedCost),
			source: line.source,
			notes: line.notes,
		}));

		return {
			formSubmissionId: submission.id,
			generatedAt: new Date().toISOString(),
			header:
				(((submission.formData ?? {}) as Record<string, unknown>)
					.header as Record<string, unknown>) ?? {},
			lineItems,
			totals: budgetTotals(lineItems),
		};
	}

	async save(
		submissionId: string,
		userId: string,
		body: SaveAssessmentBudget,
	): Promise<AssessmentBudgetPayload> {
		await assertEditable(submissionId, "Assessment budget");

		const existing = await prisma.budgetLineItem.findMany({
			where: { assessmentBudgetId: submissionId },
			select: { id: true, isFixed: true },
		});
		const byId = new Map(existing.map((l) => [l.id, l]));

		for (const removeId of body.removeLineItemIds ?? []) {
			const line = byId.get(removeId);
			if (!line || line.isFixed) {
				throw new PlanTemplateProtectedError("Assessment budget");
			}
		}

		await prisma.$transaction(async (tx) => {
			for (const removeId of body.removeLineItemIds ?? []) {
				await tx.budgetLineItem.delete({ where: { id: removeId } });
			}

			for (const item of body.lineItems) {
				const patch = {
					...(item.phase !== undefined ? { phase: item.phase } : {}),
					...(item.name !== undefined ? { name: item.name } : {}),
					...(item.estimatedCost !== undefined
						? { estimatedCost: item.estimatedCost }
						: {}),
					...(item.approvedCost !== undefined
						? { approvedCost: item.approvedCost }
						: {}),
					...(item.source !== undefined ? { source: item.source } : {}),
					...(item.notes !== undefined ? { notes: item.notes } : {}),
				};
				if (item.id && byId.has(item.id)) {
					await tx.budgetLineItem.update({
						where: { id: item.id },
						data: patch,
					});
				} else if (item.id && !byId.has(item.id)) {
					throw new PlanSubmissionNotFoundError(item.id);
				} else {
					await tx.budgetLineItem.create({
						data: {
							id: crypto.randomUUID(),
							assessmentBudgetId: submissionId,
							isFixed: false,
							phase: item.phase ?? "plan",
							name: item.name ?? "Program-specific item",
							estimatedCost: item.estimatedCost ?? 0,
							approvedCost: item.approvedCost ?? null,
							source: item.source ?? null,
							notes: item.notes ?? null,
						},
					});
				}
			}
		});

		if (body.header) {
			await mergeFormData(submissionId, { header: body.header });
		}
		await planAudit(userId, "assessment_budget.saved", {
			targetRecordId: submissionId,
		});
		return this.get(submissionId);
	}
}

export const curriculumMapService = new CurriculumMapService();
export const assessmentCalendarService = new AssessmentCalendarService();
export const targetSettingMatrixService = new TargetSettingMatrixService();
export const assessmentBudgetService = new AssessmentBudgetService();
