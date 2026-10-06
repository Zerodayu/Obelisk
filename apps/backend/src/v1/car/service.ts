import {
	carJustification,
	type JustificationContext,
	registerJustification,
	type SubmissionJustification,
} from "@lib/forms/justification";
import { prisma } from "@lib/prisma";
import { isRootCauseCategory } from "@lib/validators/root-cause";
import type { Prisma } from "@prisma/generated/prisma/client";
import { submissionService } from "@v1/forms/service";
import { CLO_RAW_DATA_CODE } from "@v1/ingest/service";
import {
	aggregateClo,
	type CloRowLike,
	categoryMeans,
	cloLevel,
	meanPct,
} from "./compute";
import type {
	AssessmentTypeRow,
	AtRiskRow,
	CarPart1,
	CarPart2,
	CarPart3,
	CarPart5,
	CarPart6,
	CarPart7,
	CohortSummary,
	Part3Row,
	SaveCarParts,
} from "./model";

const CAR_FORM_TYPE_CODE = "course_assessment_report";
const MIN_ATTAINMENT_PCT = 70;

export class CarNotFoundError extends Error {
	constructor(id: string) {
		super(`CAR submission '${id}' not found`);
		this.name = "CarNotFoundError";
	}
}

export class CarInvalidEditError extends Error {
	constructor() {
		super(
			"CAR parts may only be edited while the submission is draft or returned.",
		);
		this.name = "CarInvalidEditError";
	}
}

/**
 * A class section with no `ComputationRun` yet — the normal state before any
 * class record has been uploaded. Distinct from a lookup failure so callers can
 * tell "no data captured yet" apart from "something is broken".
 */
export class ComputationRunNotFoundError extends Error {
	constructor(classSectionId: string) {
		super(
			`No computation run found for class section '${classSectionId}'. Upload a class record first.`,
		);
		this.name = "ComputationRunNotFoundError";
	}
}

/** Normalized per-student per-CLO row used by all part builders (Decimal-free). */
type NormalizedRow = CloRowLike & {
	cloId: string;
	cloCode: string;
	cloDescription: string;
	ploCode: string | null;
	ploDescription: string | null;
	studentId: string;
	studentName: string;
	studentNumber: string;
	yearLevel: number | null;
	atRisk: boolean;
};

type CarFormData = {
	part1?: SaveCarParts["part1"];
	part5?: SaveCarParts["part5"];
	part6?: SaveCarParts["part6"];
	part7?: SaveCarParts["part7"];
};

export class CarService {
	/** Find-or-create the `course_assessment_report` FormType row (idempotent). */
	async ensureCarFormType(): Promise<string> {
		const existing = await prisma.formType.findUnique({
			where: { code: CAR_FORM_TYPE_CODE },
			select: { id: true },
		});
		if (existing) return existing.id;

		try {
			const created = await prisma.formType.create({
				data: {
					id: crypto.randomUUID(),
					code: CAR_FORM_TYPE_CODE,
					name: "Course Assessment Report",
					pdcaStage: "CHECK",
					sequenceNo: 13,
				},
				select: { id: true },
			});
			return created.id;
		} catch {
			// Race with a concurrent ensure — re-find.
			const retried = await prisma.formType.findUnique({
				where: { code: CAR_FORM_TYPE_CODE },
				select: { id: true },
			});
			if (retried) return retried.id;
			throw new Error(
				"Failed to ensure the course_assessment_report form type",
			);
		}
	}

	/**
	 * Generates the full 7-part CAR for a class section by rolling up the stored
	 * attainment of the section's computation run. Computed parts (2/3/4) derive
	 * live; user-entered parts (1/5/6/7) merge from the section's CAR
	 * `FormSubmission.formData` (or fall back to empty defaults).
	 */
	async generate(
		classSectionId: string,
		computationRunId?: string,
	): Promise<import("./model").CarPayload> {
		const run = await this.resolveRun(classSectionId, computationRunId);
		if (!run) throw new ComputationRunNotFoundError(classSectionId);

		const section = await this.loadSection(classSectionId);
		if (!section) {
			throw new Error(`Class section '${classSectionId}' not found`);
		}

		const [attainments, noEnrolled] = await Promise.all([
			prisma.cloAttainment.findMany({
				where: { classSectionId, computationRunId: run.id },
				include: {
					clo: {
						select: {
							id: true,
							code: true,
							description: true,
							cloToPloMaps: {
								select: {
									plo: { select: { code: true, description: true } },
								},
							},
						},
					},
					student: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							studentNumber: true,
							yearLevel: true,
						},
					},
				},
				orderBy: [{ clo: { code: "asc" } }, { student: { lastName: "asc" } }],
			}),
			prisma.enrollment.count({ where: { classSectionId } }),
		]);

		const formTypeId = await this.ensureCarFormType();
		const carSubmission = await this.findSectionCar(formTypeId, classSectionId);
		const saved = (carSubmission?.formData ?? {}) as CarFormData;

		const rows = this.normalizeRows(attainments);
		const noCompleted = new Set(rows.map((row) => row.studentId)).size;

		const snapshot = (run.etlSnapshotJson ?? null) as {
			section?: { year_level?: number | null } | null;
			setup?: { faculty_name?: string | null } | null;
		} | null;

		return {
			classSectionId,
			computationRunId: run.id,
			formSubmissionId: carSubmission?.id ?? null,
			generatedAt: new Date().toISOString(),
			part1: this.buildPart1(
				section,
				rows,
				saved.part1,
				{
					noEnrolled,
					noCompleted,
				},
				snapshot,
			),
			part2: this.buildPart2(rows),
			part3: this.buildPart3(rows),
			part4: this.buildPart4(rows),
			part5: this.buildPart5(rows, saved.part5),
			part6: this.buildPart6(rows, saved.part6),
			part7: this.buildPart7(saved.part7, section.faculty?.name ?? null),
		};
	}

	/**
	 * Generates an assembled CAR from a submission id: resolves the section
	 * from the submission, then rolls up its computation run (the one persisted
	 * in `formData.computationRunId`, or the section's latest).
	 */
	async generateFromSubmission(
		submissionId: string,
	): Promise<import("./model").CarPayload> {
		const submission = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: {
				id: true,
				classSectionId: true,
				formData: true,
			},
		});
		if (!submission) throw new CarNotFoundError(submissionId);
		if (!submission.classSectionId) {
			throw new Error(
				`CAR submission '${submissionId}' has no attached class section.`,
			);
		}

		const savedRunId = (submission.formData as { computationRunId?: string })
			?.computationRunId;
		return this.generate(submission.classSectionId, savedRunId);
	}

	/** Saves the editable CAR parts into the section's CAR submission. */
	async save(
		submissionId: string,
		userId: string,
		parts: SaveCarParts,
	): Promise<{ id: string; formData: Record<string, unknown> }> {
		const existing = await prisma.formSubmission.findUnique({
			where: { id: submissionId },
			select: { id: true, status: true, formData: true },
		});
		if (!existing) throw new CarNotFoundError(submissionId);
		if (existing.status !== "draft" && existing.status !== "returned") {
			throw new CarInvalidEditError();
		}

		for (const entry of parts.part5 ?? []) {
			if (!isRootCauseCategory(entry.rootCauseCategory)) {
				throw new Error(
					`Invalid root-cause category "${entry.rootCauseCategory}" for ${entry.cloCode}.`,
				);
			}
		}

		const updated = await prisma.formSubmission.update({
			where: { id: submissionId },
			data: {
				formData: {
					...((existing.formData ?? {}) as Record<string, unknown>),
					...parts,
				} as Prisma.InputJsonValue,
			},
			select: { id: true, formData: true },
		});

		await prisma.auditLog.create({
			data: {
				id: crypto.randomUUID(),
				userId,
				action: "course_assessment_report.parts_saved",
				moduleAffected: "car",
				targetRecordId: submissionId,
				details: { parts: Object.keys(parts) },
			},
		});

		return {
			id: updated.id,
			formData: (updated.formData ?? {}) as Record<string, unknown>,
		};
	}

	/** Lists CAR submissions, most recent first (optionally for a section). */
	async list(classSectionId?: string) {
		return prisma.formSubmission.findMany({
			where: {
				formType: { code: CAR_FORM_TYPE_CODE },
				...(classSectionId ? { classSectionId } : {}),
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
				term: { select: { schoolYear: true, semester: true } },
			},
		});
	}

	/** Creates a CAR draft for a class section if none exists yet. */
	async ensureDraft(
		classSectionId: string,
		userId: string,
		computationRunId?: string,
	): Promise<{ id: string }> {
		const formTypeId = await this.ensureCarFormType();
		const existing = await prisma.formSubmission.findFirst({
			where: {
				formTypeId,
				classSectionId,
				status: { in: ["draft", "returned", "submitted", "approved"] },
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
			throw new Error(`Class section '${classSectionId}' not found`);
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

	/** Returns the section's latest CAR submission, if any. */
	private async findSectionCar(formTypeId: string, classSectionId: string) {
		return prisma.formSubmission.findFirst({
			where: { formTypeId, classSectionId },
			orderBy: { createdAt: "desc" },
			select: { id: true, status: true, formData: true },
		});
	}

	private async loadSection(classSectionId: string) {
		return prisma.classSection.findUnique({
			where: { id: classSectionId },
			select: {
				sectionCode: true,
				course: {
					select: {
						code: true,
						title: true,
						program: {
							select: {
								code: true,
								name: true,
								plos: {
									select: { id: true, code: true, description: true },
								},
							},
						},
						clos: {
							// NOTE: stage/weight feed the P1 mapping table when no saved formData exists (testing_results 6.4)
							select: {
								id: true,
								code: true,
								description: true,
								cloToPloMaps: {
									select: { stage: true, weight: true },
									take: 1,
								},
							},
							orderBy: { code: "asc" },
						},
					},
				},
				term: { select: { schoolYear: true, semester: true } },
				faculty: { select: { name: true, role: true } },
			},
		});
	}

	private async resolveRun(
		classSectionId: string,
		computationRunId?: string,
		// NOTE: etlSnapshotJson feeds P1 year-level/faculty fallbacks when formData and section.faculty are empty (testing_results 6.5)
	): Promise<{ id: string; etlSnapshotJson: unknown } | null> {
		if (computationRunId) {
			return prisma.computationRun.findFirst({
				where: { id: computationRunId, scope: classSectionId },
				select: { id: true, etlSnapshotJson: true },
			});
		}
		return prisma.computationRun.findFirst({
			where: { scope: classSectionId },
			orderBy: { runAt: "desc" },
			select: { id: true, etlSnapshotJson: true },
		});
	}

	// --- Normalization ------------------------------------------------------

	private normalizeRows(
		attainments: Prisma.CloAttainmentGetPayload<{
			include: {
				clo: {
					select: {
						id: true;
						code: true;
						description: true;
						cloToPloMaps: {
							select: {
								plo: { select: { code: true; description: true } };
							};
						};
					};
				};
				student: {
					select: {
						id: true;
						firstName: true;
						lastName: true;
						studentNumber: true;
						yearLevel: true;
					};
				};
			};
		}>[],
	): NormalizedRow[] {
		return attainments.map((row) => ({
			cloId: row.clo.id,
			cloCode: row.clo.code,
			cloDescription: row.clo.description,
			ploCode: row.clo.cloToPloMaps[0]?.plo.code ?? null,
			ploDescription: row.clo.cloToPloMaps[0]?.plo.description ?? null,
			studentId: row.studentId,
			studentName: `${row.student.lastName}, ${row.student.firstName}`.trim(),
			studentNumber: row.student.studentNumber,
			yearLevel: row.student.yearLevel ?? null,
			compositeScorePct: toNumber(row.compositeScorePct),
			examPct: toNumber(row.examPct),
			atPct: toNumber(row.atPct),
			tlaPct: toNumber(row.tlaPct),
			outputPct: toNumber(row.outputPct),
			atRisk: row.isBelowThreshold,
		}));
	}

	// --- Part builders ------------------------------------------------------

	private buildPart1(
		section: NonNullable<Awaited<ReturnType<CarService["loadSection"]>>>,
		rows: NormalizedRow[],
		saved: SaveCarParts["part1"],
		counts: { noEnrolled: number; noCompleted: number },
		snapshot: {
			section?: { year_level?: number | null } | null;
			setup?: { faculty_name?: string | null } | null;
		} | null = null,
	): CarPart1 {
		const clos = section.course.clos.map((clo) => {
			const mapped = saved?.cloPloMapping?.find((m) => m.cloCode === clo.code);
			// NOTE: DB CloToPloMap fills IPD/weight until faculty saves them in P1; saved formData always wins (testing_results 6.4)
			const dbMap = clo.cloToPloMaps[0] ?? null;
			const plo = ploForClo(rows, clo.code);
			return {
				cloCode: clo.code,
				cloDescription: clo.description,
				ploCode: plo?.code ?? null,
				ploDescription: plo?.description ?? null,
				// FIXME: no Bloom's source exists in the DB — saved P1 edits only (testing_results 6.4)
				bloomsLevel: mapped?.bloomsLevel ?? null,
				ipdStage: mapped?.ipdStage ?? dbMap?.stage ?? null,
				assessmentTypes: mapped?.assessmentTypes ?? null,
				// NOTE: CloToPloMap.weight is a correlation strength (0–1), shown as percent here
				weightInGradePct:
					mapped?.weightInGradePct ??
					(dbMap ? Number(dbMap.weight) * 100 : null),
			};
		});

		// NOTE: ETL snapshot is the only source for year level/faculty while the section has no assigned faculty (testing_results 6.5)
		const snapshotYearLevel = snapshot?.section?.year_level ?? null;
		const snapshotFaculty = snapshot?.setup?.faculty_name ?? null;
		const yearLevel = saved?.yearLevel ?? snapshotYearLevel;

		return {
			courseCode: section.course.code,
			courseTitle: section.course.title,
			schoolYear: section.term.schoolYear,
			semester: section.term.semester,
			sectionCode: section.sectionCode,
			programCode: section.course.program.code,
			programName: section.course.program.name,
			term: saved?.term ?? null,
			yearLevel:
				yearLevel === 1 || yearLevel === 2 || yearLevel === 3 || yearLevel === 4
					? yearLevel
					: null,
			noEnrolled: counts.noEnrolled,
			noCompleted: counts.noCompleted,
			dateSubmitted: saved?.dateSubmitted ?? null,
			facultyName:
				saved?.facultyName ?? section.faculty?.name ?? snapshotFaculty ?? null,
			designation: saved?.designation ?? null,
			cloPloMapping: clos,
		};
	}

	private buildPart2(rows: NormalizedRow[]): CarPart2 {
		const byClo = groupByCode(rows);

		const toRows = (
			field: "examPct" | "atPct" | "tlaPct" | "outputPct" | "compositeScorePct",
		): AssessmentTypeRow[] =>
			// NOTE: null-pct rows are dropped so an all-null section renders the frontend's empty state (testing_results 6.6)
			[...byClo.entries()]
				.map(([code, group]) => {
					const pct = meanPct(group.map((r) => r[field] ?? null));
					return {
						cloCode: code,
						cloDescription: group[0].cloDescription,
						attainmentPct: pct,
						belowBenchmark: pct !== null ? pct < MIN_ATTAINMENT_PCT : null,
					};
				})
				.filter((row) => row.attainmentPct !== null);

		return {
			// NOTE: the four instrument columns are always null on the v2
			// template (python-server KNOWN_LIMITATIONS #4), so `composite` is
			// the only group that reliably carries data for the approver.
			composite: toRows("compositeScorePct"),
			exams: toRows("examPct"),
			rubric: toRows("atPct"),
			perfTasks: toRows("tlaPct"),
			portfolio: toRows("outputPct"),
		};
	}

	private buildPart3(rows: NormalizedRow[]): CarPart3 {
		const cohorts = new Map<number | null, NormalizedRow[]>();
		for (const row of rows) {
			const key = row.yearLevel ?? null;
			const bucket = cohorts.get(key) ?? [];
			bucket.push(row);
			cohorts.set(key, bucket);
		}

		const orderByYear = (a: number | null, b: number | null) => {
			if (a !== null && b !== null) return a - b;
			if (a === null) return -1;
			return 1;
		};

		const summaries: CohortSummary[] = [];
		for (const yearLevel of [...cohorts.keys()].sort(orderByYear)) {
			const group = cohorts.get(yearLevel);
			if (!group) continue;
			const rowsForCohort = this.cohortSummaryRows(group);
			summaries.push({
				yearLevel,
				rows: rowsForCohort,
				cohortAvg: this.cohortAverage(rowsForCohort),
			});
		}
		return summaries;
	}

	private cohortSummaryRows(group: NormalizedRow[]): Part3Row[] {
		const byClo = groupByCode(group);
		return [...byClo.entries()]
			.map(([code, groupRows]): Part3Row => {
				const aggregate = aggregateClo(groupRows);
				return {
					cloCode: code,
					cloDescription: groupRows[0].cloDescription,
					examPct: aggregate.examPct,
					atPct: aggregate.atPct,
					tlaPct: aggregate.tlaPct,
					outputPct: aggregate.outputPct,
					weightedAvgPct: aggregate.weightedAvgPct,
					level: cloLevel(aggregate.weightedAvgPct),
					status: aggregate.belowBenchmark ? "NOT MET" : "MET",
				};
			})
			.sort((a, b) => a.cloCode.localeCompare(b.cloCode));
	}

	private cohortAverage(rows: Part3Row[]): CohortSummary["cohortAvg"] {
		const avg = meanPct(rows.map((r) => r.weightedAvgPct));
		return {
			weightedAvgPct: avg,
			level: avg === null ? null : cloLevel(avg),
		};
	}

	private buildPart4(rows: NormalizedRow[]): {
		count: number;
		dateReportedToProgramChair: string | null;
		rows: AtRiskRow[];
	} {
		const byStudent = new Map<string, NormalizedRow[]>();
		for (const row of rows) {
			if (!row.atRisk) continue;
			const bucket = byStudent.get(row.studentId) ?? [];
			bucket.push(row);
			byStudent.set(row.studentId, bucket);
		}

		const atRiskRows: AtRiskRow[] = [];
		for (const [studentId, cloRows] of byStudent) {
			const first = cloRows[0];
			atRiskRows.push({
				studentId,
				studentName: first.studentName,
				studentNumber: first.studentNumber,
				yearLevel: first.yearLevel,
				atRiskClos: cloRows.map((row) => {
					const means = categoryMeans([row]);
					return {
						cloCode: row.cloCode,
						attainmentPct: row.compositeScorePct ?? 0,
						assessmentType: bestAssessmentType(means),
					};
				}),
				intervention: null,
			});
		}

		return {
			count: atRiskRows.length,
			dateReportedToProgramChair: null,
			rows: atRiskRows.sort((a, b) =>
				a.studentName.localeCompare(b.studentName),
			),
		};
	}

	private buildPart5(
		rows: NormalizedRow[],
		saved: SaveCarParts["part5"],
	): CarPart5 {
		const savedByClo = new Map(
			(saved ?? []).map((entry) => [entry.cloCode, entry]),
		);
		const byClo = groupByCode(rows);
		const result: CarPart5 = [];

		for (const [code, group] of byClo) {
			const aggregate = aggregateClo(group);
			if (!aggregate.belowBenchmark) continue;
			const savedEntry = savedByClo.get(code);
			result.push({
				cloCode: code,
				cloDescription: group[0].cloDescription,
				attainmentPct: aggregate.weightedAvgPct,
				rootCauseCategory:
					savedEntry?.rootCauseCategory ?? "1-Curriculum Design",
				intervention: savedEntry?.intervention ?? "",
				owner: savedEntry?.owner ?? "",
				timelineAndKpi: savedEntry?.timelineAndKpi ?? "",
			});
		}

		return result;
	}

	private buildPart6(
		rows: NormalizedRow[],
		saved: SaveCarParts["part6"],
	): CarPart6 {
		const directByClo = new Map<string, number>();
		for (const row of rows) {
			directByClo.set(row.cloCode, row.compositeScorePct ?? 0);
		}

		return {
			studentExitCrossReferences: (saved?.studentExitCrossReferences ?? []).map(
				(ref) => ({
					cloPloCode: ref.cloPloCode,
					studentAvgPerceived: ref.studentAvgPerceived ?? null,
					directAttainmentPct: directByClo.get(ref.cloPloCode) ?? null,
					facultyNote: ref.facultyNote ?? null,
				}),
			),
			teachingStrategies: saved?.teachingStrategies ?? [],
			facultyReflection: saved?.facultyReflection ?? null,
		};
	}

	private buildPart7(
		saved: SaveCarParts["part7"],
		facultyName: string | null,
	): CarPart7 {
		const disposition = saved?.programChairDisposition;
		return {
			facultyCertification: false,
			submittedBy: facultyName,
			receivedBy: null,
			programChairDisposition: disposed(disposition),
		};
	}
}

// --- Helpers ---------------------------------------------------------------

function groupByCode<T extends { cloCode: string }>(
	rows: T[],
): Map<string, T[]> {
	const map = new Map<string, T[]>();
	for (const row of rows) {
		const bucket = map.get(row.cloCode) ?? [];
		bucket.push(row);
		map.set(row.cloCode, bucket);
	}
	return map;
}

function ploForClo(
	rows: NormalizedRow[],
	cloCode: string,
): { code: string; description: string } | null {
	const row = rows.find((r) => r.cloCode === cloCode);
	if (!row?.ploCode) return null;
	return { code: row.ploCode, description: row.ploDescription ?? "" };
}

function disposed(
	disposition: NonNullable<SaveCarParts["part7"]>["programChairDisposition"],
): CarPart7["programChairDisposition"] {
	if (!disposition) return null;
	return {
		accepted: disposition.accepted ?? null,
		returnReason: disposition.returnReason ?? null,
		returnByDate: disposition.returnByDate ?? null,
		cqiEntriesReviewed: disposition.cqiEntriesReviewed ?? null,
		escalationRequired: disposition.escalationRequired ?? null,
		atRiskListReceived: disposition.atRiskListReceived ?? null,
	};
}

function toNumber(value: number | null | Prisma.Decimal): number | null {
	if (value === null || value === undefined) return null;
	return Number(value);
}

function bestAssessmentType(means: {
	examPct: number | null;
	atPct: number | null;
	tlaPct: number | null;
	outputPct: number | null;
}): string | null {
	const entries = [
		["Exam/Quiz", means.examPct],
		["Rubric/Project", means.atPct],
		["Perf. Task", means.tlaPct],
		["Portfolio", means.outputPct],
	] as const;
	let best: string | null = null;
	let bestVal = -Infinity;
	for (const [label, pct] of entries) {
		if (pct === null) continue;
		if (pct > bestVal) {
			bestVal = pct;
			best = label;
		}
	}
	return best;
}

export const carService = new CarService();

/* NOTE: justification reuses `generate()` so the approver reads the same
 * assembled Part 1/2 the form screen shows; `formData` alone is empty until
 * Part 1 has been saved once. Any other throw degrades to the generic empty
 * state via `resolveJustification`. */
const sectionJustification = async (ctx: JustificationContext) => {
	if (!ctx.classSectionId) return null;
	// NOTE: `clo_raw_data` carries no `computationRunId` in formData (its
	// scores live in DB rows), so `generate` falls back to the section's
	// latest run — the same one the CAR would roll up.
	const runId = (ctx.formData as { computationRunId?: string })
		.computationRunId;
	try {
		const payload = await carService.generate(ctx.classSectionId, runId);
		return carJustification(payload);
	} catch (error) {
		// NOTE: "no class records yet" is a normal state, not a failure — say
		// so instead of letting the card fall back to the generic "no
		// justification recorded" line, which reads like no resolver exists.
		if (error instanceof ComputationRunNotFoundError) {
			return {
				kind: "car",
				rows: [],
				assessmentEvidence: [],
				coverage: null,
				uncoveredPlos: [],
				// TODO: surface the section code once `JustificationContext`
				// carries it — the sentence reads better with "for section F1".
				notes: [
					"No class records captured for this section yet — upload a class record so attainment can be computed.",
				],
			} satisfies SubmissionJustification;
		}
		throw error;
	}
};

registerJustification(CAR_FORM_TYPE_CODE, sectionJustification);
// NOTE: `clo_raw_data` holds the same section's raw scores the CAR rolls up,
// so an approver reviewing the raw sheet reads the same justification.
registerJustification(CLO_RAW_DATA_CODE, sectionJustification);
