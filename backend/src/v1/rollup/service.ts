import type {
	AnalyticsCourseSubmission,
	AnalyticsSubmissionsPayload,
	AnalyticsSummaryResponse,
} from "@lib/ingest/ingest-client";
import { ingestClient } from "@lib/ingest/ingest-client";
import { prisma } from "@lib/prisma";
import type { Prisma } from "@prisma/generated/prisma/client";
import { aggregateClo, cloLevel, meanPct } from "@v1/car/compute";
import { submissionService } from "@v1/forms/service";
import {
	attainmentStatus,
	buildCohortLines,
	type CohortEntryInput,
} from "./compute";
import type {
	CloSectionSummary,
	CloSummaryPayload,
	CloSummaryRow,
	CohortAnnotations,
	CohortPayload,
	PloSummaryPayload,
	PloSummaryRow,
	RollupSubmissionListItem,
} from "./model";

const CLO_SUMMARY_FORM_TYPE_CODE = "clo_attainment_summary";
const PLO_SUMMARY_FORM_TYPE_CODE = "plo_attainment_summary";
const COHORT_TRACKING_FORM_TYPE_CODE = "cohort_tracking";
const MIN_ATTAINMENT_PCT = 70;
const EDITABLE_STATUSES = ["draft", "returned"] as const;

export class RollupSourceNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RollupSourceNotFoundError";
	}
}

export class RollupSubmissionNotFoundError extends Error {
	constructor(id: string) {
		super(`Roll-up submission '${id}' not found`);
		this.name = "RollupSubmissionNotFoundError";
	}
}

export class RollupInvalidEditError extends Error {
	constructor(form: string) {
		super(
			`${form} content may only be edited while the submission is draft or returned.`,
		);
		this.name = "RollupInvalidEditError";
	}
}

/** Shape stored on `ComputationRun.etlSnapshotJson` at persist time. */
type EtlSnapshot = {
	header: Record<string, unknown>;
	attainments: Record<string, unknown>[];
	clo_plo_mapping: Record<string, unknown>[];
};

type AttainmentRow = Prisma.CloAttainmentGetPayload<{
	include: {
		clo: {
			select: {
				code: true;
				description: true;
				cloToPloMaps: {
					select: { plo: { select: { code: true; description: true } } };
				};
			};
		};
	};
}>;

// --- CloSummaryService -----------------------------------------------------
// F14 `clo_attainment_summary`: a per-class-section CLO attainment summary
// assembled live from the section's stored `CloAttainment` rows (CAR mirror).

export class CloSummaryService {
	async ensureFormType(): Promise<string> {
		return ensureRollupFormType(
			CLO_SUMMARY_FORM_TYPE_CODE,
			"CLO Attainment Summary (Full Term)",
			14,
		);
	}

	/** Creates a CLO-summary draft for a class section if none exists yet. */
	async ensureDraft(
		classSectionId: string,
		userId: string,
		computationRunId?: string,
	): Promise<{ id: string }> {
		const formTypeId = await this.ensureFormType();
		const existing = await prisma.formSubmission.findFirst({
			where: {
				formTypeId,
				classSectionId,
				status: { in: [...EDITABLE_STATUSES, "submitted", "approved"] },
			},
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
		if (existing) return existing;

		const section = await prisma.classSection.findUnique({
			where: { id: classSectionId },
			select: { termId: true, course: { select: { programId: true } } },
		});
		if (!section) {
			throw new RollupSourceNotFoundError(
				`Class section '${classSectionId}' not found`,
			);
		}

		const created = await submissionService.create(
			{
				formTypeId,
				classSectionId,
				programId: section.course.programId,
				termId: section.termId,
				formData: computationRunId ? { computationRunId } : {},
			},
			userId,
		);
		return { id: created.id };
	}

	async generate(
		classSectionId: string,
		computationRunId?: string,
		userId?: string,
	): Promise<CloSummaryPayload> {
		const run = await this.resolveRun(classSectionId, computationRunId);

		const section = await prisma.classSection.findUnique({
			where: { id: classSectionId },
			select: {
				sectionCode: true,
				course: {
					select: {
						code: true,
						title: true,
						program: { select: { code: true, name: true } },
					},
				},
				term: { select: { schoolYear: true, semester: true } },
			},
		});
		if (!section) {
			throw new RollupSourceNotFoundError(
				`Class section '${classSectionId}' not found`,
			);
		}

		const attainments = await prisma.cloAttainment.findMany({
			where: { classSectionId, computationRunId: run.id },
			include: {
				clo: {
					select: {
						code: true,
						description: true,
						cloToPloMaps: {
							select: { plo: { select: { code: true, description: true } } },
						},
					},
				},
			},
			orderBy: { clo: { code: "asc" } },
		});

		const rows = buildCloRows(attainments);

		const averagePct = meanPct(rows.map((row) => row.weightedAvgPct));
		const summary: CloSectionSummary = {
			averagePct,
			level: averagePct === null ? null : cloLevel(averagePct),
			belowCount: rows.filter((row) => row.status === "NOT MET").length,
			totalCount: rows.length,
		};

		const submission = await this.findSectionSubmission(classSectionId);
		if (submission && userId) {
			await snapshotFormData(submission.id, "computed", {
				generatedAt: new Date().toISOString(),
				summary,
				rows,
			});
			await audit(userId, "clo_attainment_summary.generated", {
				targetRecordId: submission.id,
				classSectionId,
				computationRunId: run.id,
			});
		}

		return {
			classSectionId,
			computationRunId: run.id,
			formSubmissionId: submission?.id ?? null,
			generatedAt: new Date().toISOString(),
			course: { code: section.course.code, title: section.course.title },
			sectionCode: section.sectionCode,
			program: {
				code: section.course.program.code,
				name: section.course.program.name,
			},
			term: {
				schoolYear: section.term.schoolYear,
				semester: section.term.semester,
			},
			summary,
			rows,
		};
	}

	async generateFromSubmission(
		submissionId: string,
		userId?: string,
	): Promise<CloSummaryPayload> {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: { classSectionId: true, formData: true },
		});
		if (!submission) throw new RollupSubmissionNotFoundError(submissionId);
		if (!submission.classSectionId) {
			throw new RollupSourceNotFoundError(
				`CLO summary '${submissionId}' has no attached class section.`,
			);
		}
		const savedRunId = (submission.formData as { computationRunId?: string })
			?.computationRunId;
		return this.generate(submission.classSectionId, savedRunId, userId);
	}

	private async findSectionSubmission(classSectionId: string) {
		const formTypeId = await this.ensureFormType();
		return prisma.formSubmission.findFirst({
			where: { formTypeId, classSectionId },
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
	}

	private async resolveRun(
		classSectionId: string,
		computationRunId?: string,
	): Promise<{ id: string }> {
		if (computationRunId) {
			const run = await prisma.computationRun.findFirst({
				where: { id: computationRunId, scope: classSectionId },
				select: { id: true },
			});
			if (run) return run;
			throw new RollupSourceNotFoundError(
				`Computation run '${computationRunId}' not found for class section '${classSectionId}'`,
			);
		}
		const run = await prisma.computationRun.findFirst({
			where: { scope: classSectionId },
			orderBy: { runAt: "desc" },
			select: { id: true },
		});
		if (!run) {
			throw new RollupSourceNotFoundError(
				`No computation run found for class section '${classSectionId}'. Upload a class record first.`,
			);
		}
		return run;
	}
}

// --- PloSummaryService -----------------------------------------------------
// F15 `plo_attainment_summary`: feeds the program's section snapshots to the
// python-server `/analytics/summary` (Formulas 7A/7C) and persists the PLO
// roll-ups into `PloAttainment` under a fresh `ComputationRun`.

export type AnalyticsSummaryFetcher = (
	payload: AnalyticsSubmissionsPayload,
) => Promise<AnalyticsSummaryResponse>;

const defaultFetcher: AnalyticsSummaryFetcher = (payload) =>
	ingestClient.analyticsSummary(payload);

export class PloSummaryService {
	constructor(
		private readonly fetchSummary: AnalyticsSummaryFetcher = defaultFetcher,
	) {}

	async ensureFormType(): Promise<string> {
		return ensureRollupFormType(
			PLO_SUMMARY_FORM_TYPE_CODE,
			"PLO Attainment Summary",
			15,
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
	): Promise<PloSummaryPayload> {
		const [program, term] = await Promise.all([
			prisma.program.findUnique({
				where: { id: programId },
				select: {
					code: true,
					name: true,
					plos: {
						select: {
							id: true,
							code: true,
							description: true,
							targetAttainmentPct: true,
						},
					},
				},
			}),
			prisma.academicTerm.findUnique({
				where: { id: termId },
				select: { schoolYear: true, semester: true },
			}),
		]);
		if (!program || !term) {
			throw new RollupSourceNotFoundError(
				`Program '${programId}' or term '${termId}' not found`,
			);
		}

		const sections = await prisma.classSection.findMany({
			where: { course: { programId }, termId },
			select: {
				id: true,
				sectionCode: true,
				course: { select: { code: true } },
			},
		});

		const submissions: AnalyticsCourseSubmission[] = [];
		let fed = 0;
		for (const section of sections) {
			const run = await prisma.computationRun.findFirst({
				where: { scope: section.id },
				orderBy: { runAt: "desc" },
				select: { etlSnapshotJson: true },
			});
			const snapshot = run?.etlSnapshotJson as EtlSnapshot | null;
			if (!snapshot || !Array.isArray(snapshot.attainments)) continue;

			const header = (snapshot.header ?? {}) as Record<string, unknown>;
			submissions.push({
				program: program.name,
				course_code: (header.course_code as string) ?? section.course.code,
				section: (header.section as string) ?? section.sectionCode,
				header,
				attainments: snapshot.attainments,
				clo_plo_mapping: Array.isArray(snapshot.clo_plo_mapping)
					? snapshot.clo_plo_mapping
					: [],
			});
			fed++;
		}

		const response = await this.fetchSummary({
			period: {
				type: "semester",
				label: `${term.schoolYear} ${term.semester}`,
			},
			submissions,
		});

		const programSummary = response.program_summary[program.name];
		if (!programSummary) {
			throw new RollupSourceNotFoundError(
				`Python summary returned no data for program '${program.name}'. Upload and persist class records for the term first.`,
			);
		}

		const ploRows: PloSummaryRow[] = [];
		let belowCount = 0;
		for (const plo of program.plos) {
			const ps = programSummary.plos[plo.code];
			if (!ps) continue;

			const attainedPct = toPct(ps.plo_attainment_direct_only);
			const studentsBelow = await this.countStudentsBelowTarget(
				programId,
				termId,
				plo.id,
				Number(plo.targetAttainmentPct),
			);
			ploRows.push({
				ploCode: plo.code,
				ploDescription: plo.description,
				targetAttainmentPct: Number(plo.targetAttainmentPct),
				attainedPct,
				achieved: attainedPct >= Number(plo.targetAttainmentPct),
				studentsBelowTargetCount: studentsBelow,
				completenessPct: toPct(ps.plo_completeness_pct),
				rule3Met: ps.plo_rule3_met,
				mappedClos: (ps.mapped_clos ?? []).map((mapped) => ({
					cloCode: mapped.clo_code,
					meanAttainmentPct: toPct(mapped.mean_attainment_pct),
					rule1Met: mapped.rule1_met,
				})),
			});
			if (attainedPct < Number(plo.targetAttainmentPct)) belowCount++;
		}

		const summaryAverage = meanPct(ploRows.map((row) => row.attainedPct));
		const computationRunId = await this.persistPloAttainment(
			programId,
			termId,
			ploRows,
			new Map(program.plos.map((plo) => [plo.code, plo.id])),
			userId,
		);

		const submission = await this.findProgramTermSubmission(programId, termId);
		if (submission && userId) {
			await snapshotFormData(submission.id, "computed", {
				generatedAt: new Date().toISOString(),
				feed: { sections: sections.length, fed },
				summary: { averagePct: summaryAverage, belowCount },
				plos: ploRows,
			});
			await audit(userId, "plo_attainment_summary.generated", {
				targetRecordId: submission.id,
				programId,
				termId,
				computationRunId,
			});
		}

		return {
			programId,
			termId,
			computationRunId,
			formSubmissionId: submission?.id ?? null,
			generatedAt: new Date().toISOString(),
			program: { code: program.code, name: program.name },
			term: { schoolYear: term.schoolYear, semester: term.semester },
			feed: { sections: sections.length, fed },
			summary: { averagePct: summaryAverage, belowCount },
			plos: ploRows,
		};
	}

	async generateFromSubmission(
		submissionId: string,
		userId?: string,
	): Promise<PloSummaryPayload> {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: { programId: true, termId: true, formData: true },
		});
		if (!submission) throw new RollupSubmissionNotFoundError(submissionId);
		if (!submission.programId) {
			throw new RollupSourceNotFoundError(
				`PLO summary '${submissionId}' has no attached program.`,
			);
		}
		return this.generate(submission.programId, submission.termId, userId);
	}

	/** Replaces this program+term's PLO roll-ups under a fresh computation run. */
	private async persistPloAttainment(
		programId: string,
		termId: string,
		rows: PloSummaryRow[],
		ploIdByCode: Map<string, string>,
		userId?: string,
	): Promise<string> {
		const computationRunId = crypto.randomUUID();
		await prisma.computationRun.create({
			data: {
				id: computationRunId,
				scope: `plo:${programId}:${termId}`,
				formulaVersion: "70_30_v1",
				directWeight: 0.7,
				indirectWeight: 0.3,
				...(userId ? { triggeredByUserId: userId } : {}),
			},
		});

		await prisma.ploAttainment.deleteMany({
			where: { programId, termId },
		});

		if (rows.length > 0) {
			await prisma.ploAttainment.createMany({
				data: rows.map((row) => {
					const ploId = ploIdByCode.get(row.ploCode);
					if (!ploId) {
						throw new RollupSourceNotFoundError(
							`PLO '${row.ploCode}' reported by python-server is not in the program's PLO set.`,
						);
					}
					return {
						id: crypto.randomUUID(),
						ploId,
						programId,
						termId,
						attainedPct: row.attainedPct,
						studentsBelowTargetCount: row.studentsBelowTargetCount,
						computationRunId,
					};
				}),
			});
		}

		return computationRunId;
	}

	private async countStudentsBelowTarget(
		programId: string,
		termId: string,
		ploId: string,
		targetPct: number,
	): Promise<number> {
		const plo = await prisma.plo.findUnique({
			where: { id: ploId },
			select: { cloToPloMaps: { select: { cloId: true } } },
		});
		const cloIds = (plo?.cloToPloMaps ?? []).map((mapped) => mapped.cloId);
		if (cloIds.length === 0) return 0;

		const rows = await prisma.cloAttainment.findMany({
			where: {
				cloId: { in: cloIds },
				classSection: { termId, course: { programId } },
				compositeScorePct: { lt: targetPct },
			},
			distinct: ["studentId"],
			select: { studentId: true },
		});
		return rows.length;
	}

	private async findProgramTermSubmission(programId: string, termId: string) {
		const formTypeId = await this.ensureFormType();
		return prisma.formSubmission.findFirst({
			where: { formTypeId, programId, termId },
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
	}
}

// --- CohortTrackingService -------------------------------------------------
// F16 `cohort_tracking` (Permanent retention + strict audit): snapshots the
// longitudinal per-year-level CLO grid into the submission's `formData` at
// generation and audits every write.

export class CohortTrackingService {
	async ensureFormType(): Promise<string> {
		return ensureRollupFormType(
			COHORT_TRACKING_FORM_TYPE_CODE,
			"Cohort CLO/PLO Attainment Tracking Sheet",
			16,
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
	): Promise<CohortPayload> {
		const program = await prisma.program.findUnique({
			where: { id: programId },
			select: { code: true, name: true },
		});
		if (!program) {
			throw new RollupSourceNotFoundError(`Program '${programId}' not found`);
		}

		const sections = await prisma.classSection.findMany({
			where: { course: { programId } },
			select: { id: true, termId: true },
		});
		const sectionsForTerm = termId
			? sections.filter((section) => section.termId === termId)
			: sections;
		if (sectionsForTerm.length === 0) {
			throw new RollupSourceNotFoundError(
				`No class sections found for program '${program.name}'${
					termId ? " in the given term" : ""
				}.`,
			);
		}

		const [attainments, ploAttainments, terms] = await Promise.all([
			prisma.cloAttainment.findMany({
				where: { classSectionId: { in: sectionsForTerm.map((s) => s.id) } },
				include: {
					clo: { select: { code: true, description: true } },
					student: { select: { yearLevel: true } },
					classSection: { select: { termId: true } },
				},
			}),
			prisma.ploAttainment.findMany({
				where: { programId, ...(termId ? { termId } : {}) },
				include: { plo: { select: { code: true, description: true } } },
			}),
			prisma.academicTerm.findMany({
				where: { id: { in: sectionsForTerm.map((s) => s.termId) } },
				select: { id: true, schoolYear: true, semester: true },
			}),
		]);

		const termById = new Map(terms.map((term) => [term.id, term]));
		const entries = buildCohortEntries(attainments, termById);

		const lines = buildCohortLines(entries);

		const submission = await this.findProgramSubmission(programId, termId);
		const existingFormData = (submission?.formData ?? {}) as {
			annotations?: CohortAnnotations["annotations"];
		};
		const annotations = existingFormData.annotations ?? [];

		const plos = ploAttainments.map((row) => ({
			termId: row.termId,
			ploCode: row.plo.code,
			ploDescription: row.plo.description,
			attainmentPct: Number(row.attainedPct),
			achieved: Number(row.attainedPct) >= MIN_ATTAINMENT_PCT,
		}));

		if (submission && userId) {
			await snapshotFormData(submission.id, "computed", {
				generatedAt: new Date().toISOString(),
				lines,
				plos,
			});
			await audit(userId, "cohort_tracking.generated", {
				targetRecordId: submission.id,
				programId,
				termId: submission.termId,
			});
		}

		return {
			programId,
			formSubmissionId: submission?.id ?? null,
			generatedAt: new Date().toISOString(),
			program: { code: program.code, name: program.name },
			lines,
			annotations,
			plos,
		};
	}

	async generateFromSubmission(
		submissionId: string,
		userId?: string,
	): Promise<CohortPayload> {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: { programId: true, termId: true },
		});
		if (!submission) throw new RollupSubmissionNotFoundError(submissionId);
		if (!submission.programId) {
			throw new RollupSourceNotFoundError(
				`Cohort tracking '${submissionId}' has no attached program.`,
			);
		}
		return this.generate(submission.programId, undefined, userId);
	}

	/**
	 * Saves CQI follow-up annotations onto the tracking sheet. Every write is
	 * audited (Permanent retention class). Only allowed while draft or returned.
	 */
	async save(
		submissionId: string,
		userId: string,
		annotations: CohortAnnotations,
	): Promise<{ id: string; annotations: CohortAnnotations["annotations"] }> {
		const existing = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: { id: true, status: true, formData: true },
		});
		if (!existing) throw new RollupSubmissionNotFoundError(submissionId);
		if (
			!EDITABLE_STATUSES.includes(
				existing.status as (typeof EDITABLE_STATUSES)[number],
			)
		) {
			throw new RollupInvalidEditError("Cohort tracking");
		}

		const formData = (existing.formData ?? {}) as Record<string, unknown>;
		const updated = await prisma.formSubmission.update({
			where: { id: submissionId },
			data: {
				formData: {
					...formData,
					annotations: annotations.annotations,
				} as Prisma.InputJsonValue,
			},
			select: { id: true },
		});

		await audit(userId, "cohort_tracking.annotations_saved", {
			targetRecordId: submissionId,
			count: annotations.annotations.length,
		});

		return { id: updated.id, annotations: annotations.annotations };
	}

	private async latestTermWithData(programId: string): Promise<string> {
		const term = await prisma.academicTerm.findFirst({
			where: { classSections: { some: { course: { programId } } } },
			orderBy: [{ schoolYear: "desc" }, { semester: "desc" }],
			select: { id: true },
		});
		if (!term) {
			throw new RollupSourceNotFoundError(
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
			select: { id: true, termId: true, formData: true },
		});
	}
}

// --- Shared helpers --------------------------------------------------------

/** Lists roll-up submissions for a form type, newest first. */
export async function listRollupSubmissions(
	formTypeCode: string,
	opts: { programId?: string; classSectionId?: string } = {},
): Promise<RollupSubmissionListItem[]> {
	const formType = await prisma.formType.findUnique({
		where: { code: formTypeCode },
		select: { id: true },
	});
	if (!formType) return [];

	return prisma.formSubmission.findMany({
		where: {
			formTypeId: formType.id,
			...(opts.programId ? { programId: opts.programId } : {}),
			...(opts.classSectionId ? { classSectionId: opts.classSectionId } : {}),
		},
		orderBy: { createdAt: "desc" },
		select: {
			id: true,
			status: true,
			currentApproverRole: true,
			createdAt: true,
			updatedAt: true,
			classSection: {
				select: {
					sectionCode: true,
					course: { select: { code: true, title: true } },
				},
			},
			program: { select: { code: true, name: true } },
			term: { select: { schoolYear: true, semester: true } },
		},
	});
}

async function ensureRollupFormType(
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
				pdcaStage: "CHECK",
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

async function audit(
	userId: string,
	action: string,
	details: Record<string, unknown>,
): Promise<void> {
	await prisma.auditLog.create({
		data: {
			id: crypto.randomUUID(),
			userId,
			action,
			moduleAffected: "rollup",
			targetRecordId:
				typeof details.targetRecordId === "string"
					? details.targetRecordId
					: null,
			details: details as Prisma.InputJsonValue,
		},
	});
}

/** Assembles the per-CLO summary rows from a section's stored attainment. */
function buildCloRows(attainments: AttainmentRow[]): CloSummaryRow[] {
	const byClo = new Map<string, AttainmentRow[]>();
	for (const row of attainments) {
		const bucket = byClo.get(row.clo.code) ?? [];
		bucket.push(row);
		byClo.set(row.clo.code, bucket);
	}

	const rows: CloSummaryRow[] = [];
	for (const [code, group] of byClo) {
		const aggregate = aggregateClo(
			group.map((row) => ({
				compositeScorePct: toNumber(row.compositeScorePct),
				examPct: toNumber(row.examPct),
				atPct: toNumber(row.atPct),
				tlaPct: toNumber(row.tlaPct),
				outputPct: toNumber(row.outputPct),
			})),
		);
		const belowCount = group.filter((row) => {
			const pct = toNumber(row.compositeScorePct);
			return pct !== null && pct < MIN_ATTAINMENT_PCT;
		}).length;

		rows.push({
			cloCode: code,
			cloDescription: group[0].clo.description,
			ploCode: group[0].clo.cloToPloMaps[0]?.plo.code ?? null,
			ploDescription: group[0].clo.cloToPloMaps[0]?.plo.description ?? null,
			count: aggregate.count,
			belowCount,
			examPct: aggregate.examPct,
			atPct: aggregate.atPct,
			tlaPct: aggregate.tlaPct,
			outputPct: aggregate.outputPct,
			weightedAvgPct: aggregate.weightedAvgPct,
			level: cloLevel(aggregate.weightedAvgPct),
			status: aggregate.belowBenchmark ? "NOT MET" : "MET",
		});
	}
	return rows;
}

/** Flattens per-student CLO rows into per-term/per-year-level cohort inputs. */
function buildCohortEntries(
	attainments: Prisma.CloAttainmentGetPayload<{
		include: {
			clo: { select: { code: true; description: true } };
			student: { select: { yearLevel: true } };
			classSection: { select: { termId: true } };
		};
	}>[],
	termById: Map<string, { id: string; schoolYear: string; semester: string }>,
): CohortEntryInput[] {
	const groups = new Map<
		string,
		{
			yearLevel: number | null;
			termId: string;
			cloCode: string;
			cloDescription: string;
			schoolYear: string;
			semester: string;
			composites: number[];
		}
	>();
	for (const row of attainments) {
		const term = termById.get(row.classSection.termId);
		if (!term) continue;

		const yearLevel = row.student.yearLevel ?? null;
		const key = `${row.classSection.termId}|${yearLevel ?? "null"}|${row.clo.code}`;
		let group = groups.get(key);
		if (!group) {
			group = {
				yearLevel,
				termId: row.classSection.termId,
				cloCode: row.clo.code,
				cloDescription: row.clo.description,
				schoolYear: term.schoolYear,
				semester: term.semester,
				composites: [],
			};
			groups.set(key, group);
		}
		const pct = toNumber(row.compositeScorePct);
		if (pct !== null) group.composites.push(pct);
	}

	const entries: CohortEntryInput[] = [];
	for (const group of groups.values()) {
		const attainment = meanPct(group.composites) ?? 0;
		entries.push({
			yearLevel: group.yearLevel,
			termId: group.termId,
			schoolYear: group.schoolYear,
			semester: group.semester,
			row: {
				cloCode: group.cloCode,
				cloDescription: group.cloDescription,
				attainmentPct: attainment,
				status: attainmentStatus(attainment),
			},
		});
	}
	return entries;
}

// --- Module helpers --------------------------------------------------------

function toNumber(value: number | null | Prisma.Decimal): number | null {
	if (value === null || value === undefined) return null;
	return Number(value);
}

/** Converts a python-server 0–1 fraction to the 0–100 percentage scale. */
function toPct(fraction: number): number {
	return Math.round(fraction * 10000) / 100;
}

// --- Services --------------------------------------------------------------

export const cloSummaryService = new CloSummaryService();
export const ploSummaryService = new PloSummaryService();
export const cohortTrackingService = new CohortTrackingService();
