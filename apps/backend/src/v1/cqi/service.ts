import { EDITABLE_STATUSES } from "@lib/forms/state-machine";
import { registerSubmitGate, SubmitGateError } from "@lib/forms/submit-gates";
import { prisma } from "@lib/prisma";
import { isRootCauseCategory } from "@lib/validators/root-cause";
import type { Prisma } from "@prisma/generated/prisma/client";
import { meanPct } from "@v1/car/compute";
import { submissionService } from "@v1/forms/service";
import {
	type CohortAttainmentInput,
	computeCohortAttainment,
	computeDashboardStatus,
	computeGapCandidates,
	computeLoopStatus,
} from "./compute";
import type {
	AparPayload,
	CqiPlanPayload,
	CqiSubmissionListItem,
	CtlPayload,
	GapRowDto,
	PloGapPayload,
	SaveApar,
	SaveCqiPlan,
	SaveCtl,
	TrackCqiEntries,
} from "./model";

const GAP_ANALYSIS_CODE = "plo_gap_analysis";
const CQI_PLAN_CODE = "cqi_action_plan";
const ANNUAL_REPORT_CODE = "annual_program_report";
const CTL_CODE = "closing_the_loop";
const MIN_ATTAINMENT_PCT = 70;

export class CqiSourceNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CqiSourceNotFoundError";
	}
}

export class CqiSubmissionNotFoundError extends Error {
	constructor(id: string) {
		super(`CQI submission '${id}' not found`);
		this.name = "CqiSubmissionNotFoundError";
	}
}

export class CqiInvalidEditError extends Error {
	constructor(form: string) {
		super(
			`${form} content may only be edited while the submission is draft or returned.`,
		);
		this.name = "CqiInvalidEditError";
	}
}

type GapRowRow = Prisma.GapRowGetPayload<{
	include: { plo: { select: { code: true; description: true } } };
}>;

type CqiEntryRow = Prisma.CqiEntryGetPayload<{
	include: { plo: { select: { code: true; description: true } } };
}>;

type CtlRowRow = Prisma.CtlRowGetPayload<{
	include: {
		cqiEntry: {
			select: {
				plo: { select: { code: true; description: true } };
				cohortYearLevel: true;
				interventionImplemented: true;
			};
		};
	};
}>;

// --- PloGapAnalysisService --------------------------------------------------
// F22 `plo_gap_analysis`: derives per-PLO per-cohort attainment from stored CLO
// attainment and maintains the gap matrix — one row per NOT-MET combo.

export class PloGapAnalysisService {
	async ensureFormType(): Promise<string> {
		return ensureCqiFormType(
			GAP_ANALYSIS_CODE,
			"PLO Attainment Report with Gap Analysis Matrix",
			17,
		);
	}

	async ensureDraft(
		programId: string,
		termId: string,
		userId: string,
	): Promise<{ id: string }> {
		const formTypeId = await this.ensureFormType();
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

	async generate(
		programId: string,
		termId: string,
		userId?: string,
	): Promise<PloGapPayload> {
		const [program, term] = await Promise.all([
			prisma.program.findUnique({
				where: { id: programId },
				select: { code: true, name: true, plos: { select: { id: true } } },
			}),
			prisma.academicTerm.findUnique({
				where: { id: termId },
				select: { schoolYear: true, semester: true },
			}),
		]);
		if (!program || !term) {
			throw new CqiSourceNotFoundError(
				`Program '${programId}' or term '${termId}' not found`,
			);
		}

		const sections = await prisma.classSection.findMany({
			where: { course: { programId }, termId },
			select: { id: true },
		});
		const rows = await this.loadAttainmentRows(sections.map((s) => s.id));
		const summaries = computeCohortAttainment(rows);
		const candidates = computeGapCandidates(rows);

		const submission = await this.findProgramTermSubmission(programId, termId);
		if (submission && userId) {
			await this.reconcileGapRows(submission.id, candidates);
			await snapshotFormData(submission.id, "computed", {
				generatedAt: new Date().toISOString(),
				plos: summaries,
				gaps: candidates,
			});
			await cqiAudit(userId, "plo_gap_analysis.generated", {
				targetRecordId: submission.id,
				programId,
				termId,
			});
		}

		const gapRows = await this.loadGapRows(programId, termId);
		const fromData =
			(
				submission?.formData as {
					annotations?: { programChairSummary?: string };
				}
			)?.annotations?.programChairSummary ?? null;

		return {
			programId,
			termId,
			formSubmissionId: submission?.id ?? null,
			generatedAt: new Date().toISOString(),
			program: { code: program.code, name: program.name },
			term: { schoolYear: term.schoolYear, semester: term.semester },
			plos: summaries,
			gapRows,
			programChairSummary: fromData,
		};
	}

	async generateFromSubmission(
		submissionId: string,
		userId?: string,
	): Promise<PloGapPayload> {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: { programId: true, termId: true },
		});
		if (!submission) throw new CqiSubmissionNotFoundError(submissionId);
		if (!submission.programId) {
			throw new CqiSourceNotFoundError(
				`Gap analysis '${submissionId}' has no attached program.`,
			);
		}
		return this.generate(submission.programId, submission.termId, userId);
	}

	async save(
		submissionId: string,
		userId: string,
		body: {
			gapRows?: {
				id: string;
				rootCauseCategory?: string;
				rootCauseAnalysis?: string;
				namedOwner?: string;
			}[];
			programChairSummary?: string;
		},
	): Promise<{ id: string; gapRows: GapRowDto[] }> {
		const existing = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: { id: true, status: true, formData: true },
		});
		if (!existing) throw new CqiSubmissionNotFoundError(submissionId);
		if (
			!EDITABLE_STATUSES.includes(
				existing.status as (typeof EDITABLE_STATUSES)[number],
			)
		) {
			throw new CqiInvalidEditError("Gap analysis");
		}

		for (const edit of body.gapRows ?? []) {
			if (edit.rootCauseCategory !== undefined) {
				if (!isRootCauseCategory(edit.rootCauseCategory)) {
					throw new CqiSourceNotFoundError(
						`Invalid root cause category '${edit.rootCauseCategory}'. Must be one of the six canonical categories.`,
					);
				}
			}
			await prisma.gapRow.update({
				where: { id: edit.id },
				data: {
					...(edit.rootCauseCategory !== undefined
						? { rootCauseCategory: edit.rootCauseCategory }
						: {}),
					...(edit.rootCauseAnalysis !== undefined
						? { rootCauseAnalysis: edit.rootCauseAnalysis }
						: {}),
					...(edit.namedOwner !== undefined
						? { namedOwner: edit.namedOwner }
						: {}),
				},
			});
		}

		const formData = (existing.formData ?? {}) as Record<string, unknown>;
		const annotations = (formData.annotations ?? {}) as Record<string, unknown>;
		await prisma.formSubmission.update({
			where: { id: submissionId },
			data: {
				formData: {
					...formData,
					annotations: {
						...annotations,
						...(body.programChairSummary !== undefined
							? { programChairSummary: body.programChairSummary }
							: {}),
					},
				} as Prisma.InputJsonValue,
			},
		});
		await cqiAudit(userId, "plo_gap_analysis.gaps_saved", {
			targetRecordId: submissionId,
			gapRows: (body.gapRows ?? []).length,
		});

		const gapRows = await this.loadUnlinkedGapRows(submissionId);
		return {
			id: submissionId,
			gapRows,
		};
	}

	private async loadAttainmentRows(
		sectionIds: string[],
	): Promise<CohortAttainmentInput[]> {
		if (sectionIds.length === 0) return [];
		const attainments = await prisma.cloAttainment.findMany({
			where: { classSectionId: { in: sectionIds } },
			include: {
				clo: {
					select: {
						cloToPloMaps: {
							select: {
								plo: { select: { id: true, code: true, description: true } },
							},
						},
					},
				},
				student: { select: { yearLevel: true } },
			},
		});

		const rows: CohortAttainmentInput[] = [];
		for (const attainment of attainments) {
			const composite = toNumber(attainment.compositeScorePct);
			if (composite === null) continue;
			for (const mapped of attainment.clo.cloToPloMaps) {
				rows.push({
					ploId: mapped.plo.id,
					ploCode: mapped.plo.code,
					ploDescription: mapped.plo.description,
					yearLevel: attainment.student.yearLevel ?? null,
					compositeScorePct: composite,
				});
			}
		}
		return rows;
	}

	/** Keeps the gap matrix in sync with the freshly computed candidates. */
	private async reconcileGapRows(
		submissionId: string,
		candidates: {
			ploId: string;
			cohortYearLevel: number | null;
			attainmentPct: number;
		}[],
	): Promise<void> {
		const existing = await prisma.gapRow.findMany({
			where: { ploGapAnalysisId: submissionId },
			select: {
				id: true,
				ploId: true,
				cohortYearLevel: true,
				cqiActionPlanEntryId: true,
			},
		});
		const kept = new Map<string, { id: string; changed: boolean }>();
		for (const row of existing) {
			const key = gapKey(row.ploId, row.cohortYearLevel);
			const candidate = candidates.find(
				(c) =>
					c.ploId === row.ploId && c.cohortYearLevel === row.cohortYearLevel,
			);
			if (!candidate && !row.cqiActionPlanEntryId) {
				await prisma.gapRow.delete({ where: { id: row.id } });
			} else if (candidate && !row.cqiActionPlanEntryId) {
				kept.set(key, { id: row.id, changed: false });
			} else if (candidate && row.cqiActionPlanEntryId) {
				kept.set(key, { id: row.id, changed: false });
			}
		}
		const toCreate = candidates.filter(
			(c) =>
				!existing.some(
					(r) => r.ploId === c.ploId && r.cohortYearLevel === c.cohortYearLevel,
				),
		);
		if (toCreate.length > 0) {
			await prisma.gapRow.createMany({
				data: toCreate.map((c) => ({
					id: crypto.randomUUID(),
					ploGapAnalysisId: submissionId,
					ploId: c.ploId,
					cohortYearLevel: c.cohortYearLevel ?? 0,
					attainmentPct: c.attainmentPct,
				})),
			});
		}
	}

	private async findProgramTermSubmission(programId: string, termId: string) {
		const formTypeId = await this.ensureFormType();
		return prisma.formSubmission.findFirst({
			where: { formTypeId, programId, termId },
			orderBy: { createdAt: "desc" },
			select: { id: true, formData: true },
		});
	}

	private async loadGapRows(
		programId: string,
		termId: string,
	): Promise<GapRowDto[]> {
		const rows = await prisma.gapRow.findMany({
			where: {
				ploGapAnalysis: { programId, termId },
			},
			include: { plo: { select: { code: true, description: true } } },
			orderBy: [{ plo: { code: "asc" } }, { cohortYearLevel: "asc" }],
		});
		return rows.map(toGapRowDto);
	}

	private async loadUnlinkedGapRows(
		submissionId: string,
	): Promise<GapRowDto[]> {
		const rows = await prisma.gapRow.findMany({
			where: { ploGapAnalysisId: submissionId },
			include: { plo: { select: { code: true, description: true } } },
			orderBy: [{ plo: { code: "asc" } }, { cohortYearLevel: "asc" }],
		});
		return rows.map(toGapRowDto);
	}
}

// --- CqiActionPlanService ----------------------------------------------------
// F23 `cqi_action_plan`: the stateful two-phase living document. One entry per
// gap, planned in this cycle, tracked-to-completion in the next.

export class CqiActionPlanService {
	async ensureFormType(): Promise<string> {
		return ensureCqiFormType(CQI_PLAN_CODE, "CQI Action Plan", 18);
	}

	async ensureDraft(
		programId: string,
		termId: string,
		userId: string,
	): Promise<{ id: string }> {
		const formTypeId = await this.ensureFormType();
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

	async generate(
		programId: string,
		termId: string,
		userId?: string,
	): Promise<CqiPlanPayload> {
		const [program, term] = await Promise.all([
			prisma.program.findUnique({
				where: { id: programId },
				select: { code: true, name: true },
			}),
			prisma.academicTerm.findUnique({
				where: { id: termId },
				select: { schoolYear: true, semester: true },
			}),
		]);
		if (!program || !term) {
			throw new CqiSourceNotFoundError(
				`Program '${programId}' or term '${termId}' not found`,
			);
		}

		// Open gaps (from the F22 gap matrix) not yet turned into a plan entry.
		const openGaps = await prisma.gapRow.findMany({
			where: {
				cqiActionPlanEntryId: null,
				ploGapAnalysis: { programId, termId },
			},
			include: { plo: { select: { code: true, description: true } } },
		});

		const submission = await this.findProgramTermSubmission(programId, termId);
		if (submission && openGaps.length > 0) {
			for (const gap of openGaps) {
				const entryId = crypto.randomUUID();
				await prisma.cqiEntry.create({
					data: {
						id: entryId,
						cqiActionPlanId: submission.id,
						ploId: gap.ploId,
						cohortYearLevel: gap.cohortYearLevel,
						evidenceSource: "F22 Gap Analysis Matrix",
						priorAttainmentPct: Number(gap.attainmentPct),
						rootCauseCategory: gap.rootCauseCategory ?? "1-Curriculum Design",
						intervention: "",
						owner: "",
						ownerRole: "",
						timelineAndKpi: "",
						status: "planned",
					},
				});
				await prisma.gapRow.update({
					where: { id: gap.id },
					data: { cqiActionPlanEntryId: entryId },
				});
			}
		}

		if (submission && userId) {
			await snapshotFormData(submission.id, "computed", {
				generatedAt: new Date().toISOString(),
				createdEntries: openGaps.length,
			});
			await cqiAudit(userId, "cqi_action_plan.generated", {
				targetRecordId: submission.id,
				programId,
				termId,
				createdEntries: openGaps.length,
			});
		}

		const entries = await this.loadEntries(programId, termId);

		return {
			programId,
			termId,
			formSubmissionId: submission?.id ?? null,
			generatedAt: new Date().toISOString(),
			program: { code: program.code, name: program.name },
			term: { schoolYear: term.schoolYear, semester: term.semester },
			entries,
		};
	}

	async generateFromSubmission(
		submissionId: string,
		userId?: string,
	): Promise<CqiPlanPayload> {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: { programId: true, termId: true },
		});
		if (!submission) throw new CqiSubmissionNotFoundError(submissionId);
		if (!submission.programId) {
			throw new CqiSourceNotFoundError(
				`CQI action plan '${submissionId}' has no attached program.`,
			);
		}
		return this.generate(submission.programId, submission.termId, userId);
	}

	async save(
		submissionId: string,
		userId: string,
		body: SaveCqiPlan,
	): Promise<{ id: string; entries: typeof body.entries }> {
		const existing = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: { id: true, status: true, formData: true },
		});
		if (!existing) throw new CqiSubmissionNotFoundError(submissionId);
		if (
			!EDITABLE_STATUSES.includes(
				existing.status as (typeof EDITABLE_STATUSES)[number],
			)
		) {
			throw new CqiInvalidEditError("CQI action plan");
		}

		for (const edit of body.entries) {
			if (edit.rootCauseCategory !== undefined) {
				if (!isRootCauseCategory(edit.rootCauseCategory)) {
					throw new CqiSourceNotFoundError(
						`Invalid root cause category '${edit.rootCauseCategory}'. Must be one of the six canonical categories.`,
					);
				}
			}
			await prisma.cqiEntry.update({
				where: { id: edit.id },
				data: {
					...(edit.evidenceSource !== undefined
						? { evidenceSource: edit.evidenceSource }
						: {}),
					...(edit.rootCauseCategory !== undefined
						? { rootCauseCategory: edit.rootCauseCategory }
						: {}),
					...(edit.intervention !== undefined
						? { intervention: edit.intervention }
						: {}),
					...(edit.owner !== undefined ? { owner: edit.owner } : {}),
					...(edit.ownerRole !== undefined
						? { ownerRole: edit.ownerRole }
						: {}),
					...(edit.timelineAndKpi !== undefined
						? { timelineAndKpi: edit.timelineAndKpi }
						: {}),
				},
			});
		}

		await cqiAudit(userId, "cqi_action_plan.entries_saved", {
			targetRecordId: submissionId,
			entries: body.entries.length,
		});
		return { id: submissionId, entries: body.entries };
	}

	/** Flips planned entries into the tracked-to-completion phase. */
	async track(
		submissionId: string,
		userId: string,
		body: TrackCqiEntries,
	): Promise<{ id: string; updated: number }> {
		const existing = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: { id: true, status: true },
		});
		if (!existing) throw new CqiSubmissionNotFoundError(submissionId);
		if (
			!EDITABLE_STATUSES.includes(
				existing.status as (typeof EDITABLE_STATUSES)[number],
			)
		) {
			throw new CqiInvalidEditError("CQI action plan");
		}

		for (const entry of body.entries) {
			await prisma.cqiEntry.update({
				where: { id: entry.id },
				data: {
					status: "tracked",
					interventionImplemented: entry.interventionImplemented,
					...(entry.currentAttainmentPct !== undefined
						? { currentAttainmentPct: entry.currentAttainmentPct }
						: {}),
				},
			});
		}

		await cqiAudit(userId, "cqi_action_plan.tracked", {
			targetRecordId: submissionId,
			entries: body.entries.length,
		});
		return { id: submissionId, updated: body.entries.length };
	}

	private async findProgramTermSubmission(programId: string, termId: string) {
		const formTypeId = await this.ensureFormType();
		return prisma.formSubmission.findFirst({
			where: { formTypeId, programId, termId },
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
	}

	private async loadEntries(
		programId: string,
		termId: string,
	): Promise<ReturnType<typeof toCqiEntryDto>[]> {
		const entries = await prisma.cqiEntry.findMany({
			where: { cqiActionPlan: { programId, termId } },
			include: { plo: { select: { code: true, description: true } } },
			orderBy: [{ plo: { code: "asc" } }, { cohortYearLevel: "asc" }],
		});
		return entries.map(toCqiEntryDto);
	}
}

// --- ClosingTheLoopService ---------------------------------------------------
// F25 `closing_the_loop`: hard-computes loop status. The DB stores only the five
// condition flags; `closed` is derived and never persisted as a free value.

export class ClosingTheLoopService {
	async ensureFormType(): Promise<string> {
		return ensureCqiFormType(CTL_CODE, "Closing-the-Loop (CTL) Report", 20);
	}

	async ensureDraft(
		programId: string,
		termId: string,
		userId: string,
	): Promise<{ id: string }> {
		const formTypeId = await this.ensureFormType();
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

	async generate(
		programId: string,
		termId: string,
		userId?: string,
	): Promise<CtlPayload> {
		const [program, term] = await Promise.all([
			prisma.program.findUnique({
				where: { id: programId },
				select: { code: true, name: true },
			}),
			prisma.academicTerm.findUnique({
				where: { id: termId },
				select: { schoolYear: true, semester: true },
			}),
		]);
		if (!program || !term) {
			throw new CqiSourceNotFoundError(
				`Program '${programId}' or term '${termId}' not found`,
			);
		}

		// CQI entries whose loop has not been opened in any CTL report yet.
		const untrackedEntries = await prisma.cqiEntry.findMany({
			where: {
				cqiActionPlan: { programId, termId },
				ctlRow: null,
				status: "tracked",
			},
			select: {
				id: true,
				priorAttainmentPct: true,
				currentAttainmentPct: true,
			},
		});

		const submission = await this.findProgramTermSubmission(programId, termId);
		if (submission && untrackedEntries.length > 0) {
			await prisma.ctlRow.createMany({
				data: untrackedEntries.map((entry) => ({
					id: crypto.randomUUID(),
					closingTheLoopId: submission.id,
					cqiEntryId: entry.id,
					priorAttainmentPct: Number(entry.priorAttainmentPct),
					currentAttainmentPct: entry.currentAttainmentPct
						? Number(entry.currentAttainmentPct)
						: null,
					conditions12Met: false,
					condition3Met: false,
					condition4Met: false,
					condition5Met: false,
					loopStatus: computeLoopStatus({
						conditions12Met: false,
						condition3Met: false,
						condition4Met: false,
						condition5Met: false,
					}),
				})),
			});
		}

		if (submission && userId) {
			await snapshotFormData(submission.id, "computed", {
				generatedAt: new Date().toISOString(),
				openedRows: untrackedEntries.length,
			});
			await cqiAudit(userId, "closing_the_loop.generated", {
				targetRecordId: submission.id,
				programId,
				termId,
				openedRows: untrackedEntries.length,
			});
		}

		const rows = await this.loadRows(programId, termId);
		const identify = await this.loadIdentify(submission?.id);

		return {
			programId,
			termId,
			formSubmissionId: submission?.id ?? null,
			generatedAt: new Date().toISOString(),
			program: { code: program.code, name: program.name },
			term: { schoolYear: term.schoolYear, semester: term.semester },
			rows,
			identify,
		};
	}

	async generateFromSubmission(
		submissionId: string,
		userId?: string,
	): Promise<CtlPayload> {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: { programId: true, termId: true, formData: true },
		});
		if (!submission) throw new CqiSubmissionNotFoundError(submissionId);
		if (!submission.programId) {
			throw new CqiSourceNotFoundError(
				`Closing-the-loop report '${submissionId}' has no attached program.`,
			);
		}
		void userId;
		return this.generate(submission.programId, submission.termId, userId);
	}

	async save(
		submissionId: string,
		userId: string,
		body: SaveCtl,
	): Promise<{ id: string; rows: number }> {
		const existing = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: { id: true, status: true, formData: true },
		});
		if (!existing) throw new CqiSubmissionNotFoundError(submissionId);
		if (
			!EDITABLE_STATUSES.includes(
				existing.status as (typeof EDITABLE_STATUSES)[number],
			)
		) {
			throw new CqiInvalidEditError("Closing-the-loop report");
		}

		for (const edit of body.rows) {
			const row = await prisma.ctlRow.findUnique({
				where: { id: edit.id },
				include: { cqiEntry: { select: { interventionImplemented: true } } },
			});
			if (!row)
				throw new CqiSourceNotFoundError(`CTL row '${edit.id}' not found`);

			const conditions12Met = edit.conditions12Met ?? row.conditions12Met;
			const condition3Met = edit.condition3Met ?? row.condition3Met;
			const condition4Met = edit.condition4Met ?? row.condition4Met;
			const condition5Met = edit.condition5Met ?? row.condition5Met;
			const interventionImplementedText =
				edit.interventionImplementedText ?? row.interventionImplementedText;
			const loopStatus = computeLoopStatus({
				conditions12Met,
				condition3Met,
				condition4Met,
				condition5Met,
				interventionImplemented: row.cqiEntry.interventionImplemented ?? null,
				interventionImplementedText,
			});
			await prisma.ctlRow.update({
				where: { id: edit.id },
				data: {
					...(edit.gapFindingAndEvidence !== undefined
						? { gapFindingAndEvidence: edit.gapFindingAndEvidence }
						: {}),
					...(edit.interventionImplementedText !== undefined
						? { interventionImplementedText: edit.interventionImplementedText }
						: {}),
					...(edit.priorAttainmentPct !== undefined
						? { priorAttainmentPct: edit.priorAttainmentPct }
						: {}),
					...(edit.currentAttainmentPct !== undefined
						? { currentAttainmentPct: edit.currentAttainmentPct }
						: {}),
					conditions12Met,
					condition3Met,
					condition4Met,
					condition5Met,
					loopStatus,
				},
			});
		}

		const formData = (existing.formData ?? {}) as Record<string, unknown>;
		const identify = (body.identify ?? {}) as Record<string, unknown>;
		await prisma.formSubmission.update({
			where: { id: submissionId },
			data: {
				formData: {
					...formData,
					identify: {
						...((formData.identify as Record<string, unknown> | undefined) ??
							{}),
						...identify,
					},
				} as Prisma.InputJsonValue,
			},
		});

		await cqiAudit(userId, "closing_the_loop.rows_saved", {
			targetRecordId: submissionId,
			rows: body.rows.length,
		});
		return { id: submissionId, rows: body.rows.length };
	}

	private async findProgramTermSubmission(programId: string, termId: string) {
		const formTypeId = await this.ensureFormType();
		return prisma.formSubmission.findFirst({
			where: { formTypeId, programId, termId },
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
	}

	private async loadRows(
		programId: string,
		termId: string,
	): Promise<ReturnType<typeof toCtlRowDto>[]> {
		const rows = await prisma.ctlRow.findMany({
			where: { closingTheLoop: { programId, termId } },
			include: {
				cqiEntry: {
					select: {
						plo: { select: { code: true, description: true } },
						cohortYearLevel: true,
						interventionImplemented: true,
					},
				},
			},
			orderBy: [
				{ cqiEntry: { plo: { code: "asc" } } },
				{ cqiEntry: { cohortYearLevel: "asc" } },
			],
		});
		return rows.map(toCtlRowDto);
	}

	private async loadIdentify(submissionId?: string | null) {
		if (!submissionId) {
			return {
				c1PriorCycleKpisAchieved: null,
				c2PreviouslyMetDeclining: null,
				c3ExternalShifts: null,
				c4ProactiveImprovements: null,
			};
		}
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: { formData: true },
		});
		const identify =
			(submission?.formData as { identify?: Record<string, unknown> })
				?.identify ?? {};
		return {
			c1PriorCycleKpisAchieved:
				(typeof identify.c1PriorCycleKpisAchieved === "string"
					? identify.c1PriorCycleKpisAchieved
					: null) ?? null,
			c2PreviouslyMetDeclining:
				(typeof identify.c2PreviouslyMetDeclining === "string"
					? identify.c2PreviouslyMetDeclining
					: null) ?? null,
			c3ExternalShifts:
				(typeof identify.c3ExternalShifts === "string"
					? identify.c3ExternalShifts
					: null) ?? null,
			c4ProactiveImprovements:
				(typeof identify.c4ProactiveImprovements === "string"
					? identify.c4ProactiveImprovements
					: null) ?? null,
		};
	}
}

// --- AnnualProgramReportService ----------------------------------------------
// F24 `annual_program_report` (Permanent retention): a validation gate blocks
// submission unless an approved cohort-tracking sheet exists for the program.

const APAR_KPI_DEFS: {
	code: string;
	label: string;
	computed: boolean;
	required: boolean;
}[] = [
	{
		code: "overall_plo_attainment",
		label: "Overall PLO Attainment (%)",
		computed: true,
		required: true,
	},
	{
		code: "y1_cohort_clo_attainment",
		label: "Year 1 Cohort Avg CLO Attainment (%)",
		computed: true,
		required: true,
	},
	{
		code: "y2_cohort_clo_attainment",
		label: "Year 2 Cohort Avg CLO Attainment (%)",
		computed: true,
		required: true,
	},
	{
		code: "y3_cohort_clo_attainment",
		label: "Year 3 Cohort Avg CLO Attainment (%)",
		computed: true,
		required: true,
	},
	{
		code: "y4_cohort_clo_attainment",
		label: "Year 4 Cohort Avg CLO Attainment (%)",
		computed: true,
		required: true,
	},
	{
		code: "capstone_pass_rate",
		label: "Capstone Pass Rate (%)",
		computed: false,
		required: false,
	},
	{
		code: "ojt_satisfactory_rating",
		label: "OJT Satisfactory Rating (%)",
		computed: false,
		required: false,
	},
	{
		code: "portfolio_standard_met",
		label: "Portfolio Standard Met (%)",
		computed: false,
		required: false,
	},
	{
		code: "exit_survey_satisfaction",
		label: "Exit Survey Satisfaction (%)",
		computed: false,
		required: false,
	},
	{
		code: "alumni_employment",
		label: "Alumni Employment (%)",
		computed: false,
		required: false,
	},
	{
		code: "employer_satisfaction",
		label: "Employer Satisfaction (%)",
		computed: false,
		required: false,
	},
	{
		code: "cqi_action_completion_rate",
		label: "CQI Action Completion Rate (%)",
		computed: true,
		required: true,
	},
];

export class AnnualProgramReportService {
	async ensureFormType(): Promise<string> {
		return ensureCqiFormType(
			ANNUAL_REPORT_CODE,
			"Annual Program Assessment Report (APAR)",
			19,
		);
	}

	async ensureDraft(
		programId: string,
		userId: string,
		termId?: string,
	): Promise<{ id: string }> {
		const formTypeId = await this.ensureFormType();
		const reportingTermId =
			termId ?? (await this.latestTermWithData(programId));

		const existing = await prisma.formSubmission.findFirst({
			where: {
				formTypeId,
				programId,
				...(termId ? { termId } : {}),
				status: { in: [...EDITABLE_STATUSES, "submitted", "approved"] },
			},
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
		if (existing) return existing;

		const created = await submissionService.create(
			{ formTypeId, programId, termId: reportingTermId, formData: {} },
			userId,
		);
		return { id: created.id };
	}

	async generate(
		programId: string,
		termId?: string,
		userId?: string,
	): Promise<AparPayload> {
		const program = await prisma.program.findUnique({
			where: { id: programId },
			select: { code: true, name: true },
		});
		if (!program) {
			throw new CqiSourceNotFoundError(`Program '${programId}' not found`);
		}
		const reportingTermId =
			termId ?? (await this.latestTermWithData(programId));
		const term = await prisma.academicTerm.findUnique({
			where: { id: reportingTermId },
			select: { schoolYear: true, semester: true },
		});
		if (!term) {
			throw new CqiSourceNotFoundError(
				`Academic term '${reportingTermId}' not found`,
			);
		}

		const [ploAvg, perCohort, cqiCompletion] = await Promise.all([
			this.computeOverallPloAttainment(programId, reportingTermId),
			this.computeCohortCloAttainment(programId, reportingTermId),
			this.computeCqiCompletionRate(programId),
		]);

		const kpis = APAR_KPI_DEFS.map((def) => {
			let value: number | null = null;
			let computed = def.computed;
			if (def.code === "overall_plo_attainment") value = ploAvg;
			else if (
				def.code.startsWith("y") &&
				def.code.endsWith("_cohort_clo_attainment")
			) {
				const level = Number(def.code[1]);
				value = perCohort[level] ?? null;
			} else if (def.code === "cqi_action_completion_rate") {
				value = cqiCompletion;
			} else {
				computed = false;
			}
			return {
				code: def.code,
				label: def.label,
				value,
				benchmark: MIN_ATTAINMENT_PCT,
				status: computeDashboardStatus(value, MIN_ATTAINMENT_PCT),
				computed,
				required: def.required,
			};
		});

		const submission = await this.findProgramSubmission(programId, termId);
		if (submission && userId) {
			await snapshotFormData(submission.id, "computed", {
				generatedAt: new Date().toISOString(),
				termId: reportingTermId,
				kpis,
			});
			await cqiAudit(userId, "annual_program_report.generated", {
				targetRecordId: submission.id,
				programId,
				termId: reportingTermId,
			});
		}

		const savedFormData = (submission?.formData ?? {}) as {
			attachments?: Record<string, boolean>;
			narratives?: Record<string, string>;
			dashboard?: { code: string; value: number | null }[];
		};

		const endSchoolYear = term.schoolYear.split("-").pop() ?? term.schoolYear;

		return {
			programId,
			formSubmissionId: submission?.id ?? null,
			termId: reportingTermId,
			generatedAt: new Date().toISOString(),
			program: { code: program.code, name: program.name },
			term: { schoolYear: term.schoolYear, semester: term.semester },
			kpis,
			attachments: savedFormData.attachments ?? {},
			narratives: (savedFormData.narratives ?? {}) as Record<
				string,
				string | null
			>,
			dueDate: `June 30, ${endSchoolYear}`,
		};
	}

	async generateFromSubmission(
		submissionId: string,
		userId?: string,
	): Promise<AparPayload> {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: { programId: true, termId: true },
		});
		if (!submission) throw new CqiSubmissionNotFoundError(submissionId);
		if (!submission.programId) {
			throw new CqiSourceNotFoundError(
				`Annual program report '${submissionId}' has no attached program.`,
			);
		}
		return this.generate(submission.programId, submission.termId, userId);
	}

	async save(
		submissionId: string,
		userId: string,
		body: SaveApar,
	): Promise<{ id: string }> {
		const existing = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: { id: true, status: true, formData: true },
		});
		if (!existing) throw new CqiSubmissionNotFoundError(submissionId);
		if (
			!EDITABLE_STATUSES.includes(
				existing.status as (typeof EDITABLE_STATUSES)[number],
			)
		) {
			throw new CqiInvalidEditError("Annual program report");
		}

		const formData = (existing.formData ?? {}) as Record<string, unknown>;
		const dashboard = (body.dashboard ?? []).map((row) => ({
			code: row.kpiCode,
			label:
				APAR_KPI_DEFS.find((def) => def.code === row.kpiCode)?.label ??
				row.kpiCode,
			value: row.value ?? null,
			benchmark: MIN_ATTAINMENT_PCT,
			status: computeDashboardStatus(row.value, MIN_ATTAINMENT_PCT),
			computed:
				APAR_KPI_DEFS.find((def) => def.code === row.kpiCode)?.computed ??
				false,
		}));

		await prisma.formSubmission.update({
			where: { id: submissionId },
			data: {
				formData: {
					...formData,
					...(body.attachments ? { attachments: body.attachments } : {}),
					...(body.narratives ? { narratives: body.narratives } : {}),
					...(body.dashboard ? { dashboard } : {}),
				} as Prisma.InputJsonValue,
			},
		});
		await cqiAudit(userId, "annual_program_report.saved", {
			targetRecordId: submissionId,
		});
		return { id: submissionId };
	}

	private async latestTermWithData(programId: string): Promise<string> {
		const term = await prisma.academicTerm.findFirst({
			where: { classSections: { some: { course: { programId } } } },
			orderBy: [{ schoolYear: "desc" }, { semester: "desc" }],
			select: { id: true },
		});
		if (!term) {
			throw new CqiSourceNotFoundError(
				`No stored attainment found for program '${programId}'. Upload and persist a class record first.`,
			);
		}
		return term.id;
	}

	private async findProgramSubmission(programId: string, termId?: string) {
		const formTypeId = await this.ensureFormType();
		return prisma.formSubmission.findFirst({
			where: {
				formTypeId,
				programId,
				...(termId ? { termId } : {}),
			},
			orderBy: { createdAt: "desc" },
			select: { id: true, formData: true },
		});
	}

	private async computeOverallPloAttainment(
		programId: string,
		termId: string,
	): Promise<number | null> {
		const rows = await prisma.ploAttainment.findMany({
			where: { programId, termId },
			select: { attainedPct: true },
		});
		if (rows.length === 0) return null;
		return meanPct(rows.map((r) => Number(r.attainedPct)));
	}

	private async computeCohortCloAttainment(
		programId: string,
		termId: string,
	): Promise<Record<number, number | null>> {
		const result: Record<number, number | null> = {
			1: null,
			2: null,
			3: null,
			4: null,
		};
		const rows = await prisma.cloAttainment.findMany({
			where: {
				classSection: { course: { programId }, termId },
			},
			include: { student: { select: { yearLevel: true } } },
		});
		const buckets = new Map<number, number[]>();
		for (const row of rows) {
			const level = row.student.yearLevel;
			if (!level || level < 1 || level > 4) continue;
			const composite = toNumber(row.compositeScorePct);
			if (composite === null) continue;
			const bucket = buckets.get(level) ?? [];
			bucket.push(composite);
			buckets.set(level, bucket);
		}
		for (const [level, values] of buckets) {
			result[level] = meanPct(values);
		}
		return result;
	}

	private async computeCqiCompletionRate(
		programId: string,
	): Promise<number | null> {
		const [closed, tracked] = await Promise.all([
			prisma.cqiEntry.count({
				where: {
					status: "tracked",
					interventionImplemented: "yes",
					cqiActionPlan: { programId },
				},
			}),
			prisma.cqiEntry.count({
				where: {
					status: "tracked",
					cqiActionPlan: { programId },
				},
			}),
		]);
		if (tracked === 0) return null;
		return (closed / tracked) * 100;
	}
}

// --- Shared helpers ----------------------------------------------------------

/** Lists CQI submissions for a form type, newest first. */
export async function listCqiSubmissions(
	formTypeCode: string,
	opts: { programId?: string } = {},
): Promise<CqiSubmissionListItem[]> {
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
			term: { select: { schoolYear: true, semester: true } },
		},
	});
}

async function ensureCqiFormType(
	code: string,
	name: string,
	sequenceNo: number,
): Promise<string> {
	const existing = await prisma.formType.findUnique({
		where: { code },
		select: { id: true },
	});
	if (existing) return existing.id;

	try {
		const created = await prisma.formType.create({
			data: {
				id: crypto.randomUUID(),
				code,
				name,
				pdcaStage: "ACT",
				sequenceNo,
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

async function snapshotFormData(
	submissionId: string,
	key: string,
	value: unknown,
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
				[key]: value,
			} as Prisma.InputJsonValue,
		},
		select: { id: true },
	});
}

async function cqiAudit(
	userId: string,
	action: string,
	details: Record<string, unknown>,
): Promise<void> {
	await prisma.auditLog.create({
		data: {
			id: crypto.randomUUID(),
			userId,
			action,
			moduleAffected: "cqi",
			targetRecordId:
				typeof details.targetRecordId === "string"
					? details.targetRecordId
					: null,
			details: details as Prisma.InputJsonValue,
		},
	});
}

function gapKey(ploId: string, cohortYearLevel: number | null): string {
	return `${ploId}|${cohortYearLevel ?? "null"}`;
}

function toGapRowDto(row: GapRowRow): GapRowDto {
	return {
		id: row.id,
		ploCode: row.plo.code,
		ploDescription: row.plo.description,
		cohortYearLevel: row.cohortYearLevel,
		attainmentPct: Number(row.attainmentPct),
		rootCauseCategory: row.rootCauseCategory,
		rootCauseAnalysis: row.rootCauseAnalysis,
		namedOwner: row.namedOwner,
		cqiActionPlanEntryId: row.cqiActionPlanEntryId,
	};
}

function toCqiEntryDto(entry: CqiEntryRow) {
	return {
		id: entry.id,
		ploCode: entry.plo.code,
		ploDescription: entry.plo.description,
		cohortYearLevel: entry.cohortYearLevel,
		evidenceSource: entry.evidenceSource,
		priorAttainmentPct: Number(entry.priorAttainmentPct),
		rootCauseCategory: entry.rootCauseCategory,
		intervention: entry.intervention,
		owner: entry.owner,
		ownerRole: entry.ownerRole,
		timelineAndKpi: entry.timelineAndKpi,
		status: entry.status,
		interventionImplemented: entry.interventionImplemented,
		currentAttainmentPct: entry.currentAttainmentPct
			? Number(entry.currentAttainmentPct)
			: null,
	};
}

function toCtlRowDto(row: CtlRowRow) {
	return {
		id: row.id,
		cqiEntryId: row.cqiEntryId,
		ploCode: row.cqiEntry.plo.code,
		ploDescription: row.cqiEntry.plo.description,
		cohortYearLevel: row.cqiEntry.cohortYearLevel,
		gapFindingAndEvidence: row.gapFindingAndEvidence,
		interventionImplementedText: row.interventionImplementedText,
		priorAttainmentPct: row.priorAttainmentPct
			? Number(row.priorAttainmentPct)
			: null,
		currentAttainmentPct: row.currentAttainmentPct
			? Number(row.currentAttainmentPct)
			: null,
		conditions12Met: row.conditions12Met,
		condition3Met: row.condition3Met,
		condition4Met: row.condition4Met,
		condition5Met: row.condition5Met,
		loopStatus: row.loopStatus,
	};
}

function toNumber(value: number | null | Prisma.Decimal): number | null {
	if (value === null || value === undefined) return null;
	return Number(value);
}

// --- Submit gate ------------------------------------------------------------
// Registers the APAR validation gate so the generic form-submit endpoint cannot
// bypass the "Cohort Tracking Sheet attached" requirement.

registerSubmitGate(ANNUAL_REPORT_CODE, async (submission) => {
	if (!submission.programId) {
		throw new SubmitGateError(
			ANNUAL_REPORT_CODE,
			"APAR blocked: the report must be attached to a program.",
		);
	}
	const formData = (submission.formData ?? {}) as {
		attachments?: Record<string, boolean>;
	};
	if (!formData.attachments?.cohort_tracking) {
		throw new SubmitGateError(
			ANNUAL_REPORT_CODE,
			"APAR blocked: the Cohort Tracking Sheet (F16) is not attached.",
		);
	}
	const cohortType = await prisma.formType.findUnique({
		where: { code: "cohort_tracking" },
		select: { id: true },
	});
	const approved = cohortType
		? await prisma.formSubmission.findFirst({
				where: {
					formTypeId: cohortType.id,
					programId: submission.programId,
					status: "approved",
				},
				select: { id: true },
			})
		: null;
	if (!approved) {
		throw new SubmitGateError(
			ANNUAL_REPORT_CODE,
			"APAR blocked: no approved cohort-tracking submission exists for this program.",
		);
	}
});

// --- Services ----------------------------------------------------------------

export const ploGapAnalysisService = new PloGapAnalysisService();
export const cqiActionPlanService = new CqiActionPlanService();
export const closingTheLoopService = new ClosingTheLoopService();
export const annualProgramReportService = new AnnualProgramReportService();
