import {
	type CqiNarrativeEntry,
	type CqiNarrativePayload,
	type CqiNarrativeResponse,
	ingestClient,
} from "@lib/ingest/ingest-client";
import { findSystemicTriggers } from "@lib/forms/systemic-trigger";
import { prisma } from "@lib/prisma";
import { MIN_ATTAINMENT_PCT, round2 } from "@lib/validators/attainment";
import type { Prisma } from "@prisma/generated/prisma/client";
import {
	type CqiEffectivenessInput,
	type CqiEffectivenessRow,
	FLOOR_PCT,
	type OutcomeInput,
	type OutcomeRow,
	comparePrior,
	computeCqiEffectiveness,
	computeDerivedOutcome,
	computeFindings,
	computeNextCyclePriorities,
	computeOutcome,
	computePerformanceStats,
} from "./cqi-institutional.compute";
import type { CqiInstitutionalReport } from "./cqi-institutional.model";

/** 404 — the requested term does not exist. */
export class CqiTermNotFoundError extends Error {
	constructor(termId: string) {
		super(`Academic term '${termId}' not found`);
		this.name = "CqiTermNotFoundError";
	}
}

/** 409 — nothing has been persisted for the term yet. */
export class CqiReportNoDataError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CqiReportNoDataError";
	}
}

/** 404 — no stored narrative for the term (or row). */
export class CqiNarrativeNotFoundError extends Error {
	constructor(message = "No CQI narrative has been generated for this term.") {
		super(message);
		this.name = "CqiNarrativeNotFoundError";
	}
}

export type CqiNarrativeFetcher = (
	payload: CqiNarrativePayload,
) => Promise<CqiNarrativeResponse>;

const defaultFetcher: CqiNarrativeFetcher = (payload) =>
	ingestClient.cqiNarrative(payload);

type TermRef = {
	id: string;
	schoolYear: string;
	semester: string;
	startDate: Date | null;
};

type SectionRef = {
	id: string;
	sectionCode: string;
	course: {
		id: string;
		code: string;
		title: string;
		program: { id: string; code: string; name: string };
	};
};

type BuildResult = {
	report: CqiInstitutionalReport;
	payload: CqiNarrativePayload;
	entries: CqiEffectivenessRow[];
};

const REPORT_KIND = "cqi_institutional_v1";

function finite(value: number | null | undefined): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function mean(values: number[]): number | null {
	if (values.length === 0) return null;
	return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function modalYear(records: { yearLevel: number | null }[]): number | null {
	const counts = new Map<number, number>();
	for (const record of records) {
		if (record.yearLevel === null) continue;
		counts.set(record.yearLevel, (counts.get(record.yearLevel) ?? 0) + 1);
	}
	let best: number | null = null;
	let bestCount = 0;
	for (const [year, count] of counts) {
		if (count > bestCount) {
			best = year;
			bestCount = count;
		}
	}
	return best;
}

function yTarget(
	row: Record<string, unknown> | undefined,
	yearLevel: number | null,
): number | null {
	if (!row) return null;
	const keys = ["y1TargetPct", "y2TargetPct", "y3TargetPct", "y4TargetPct"];
	const preferred = yearLevel ? keys[yearLevel - 1] : undefined;
	const candidates = [preferred, ...keys].filter(Boolean) as string[];
	for (const key of candidates) {
		const value = row[key];
		if (value !== null && value !== undefined) {
			const numeric = Number(value);
			if (Number.isFinite(numeric)) return numeric;
		}
	}
	return null;
}

function parseAttainmentRows(snapshot: unknown): Record<string, unknown>[] {
	if (!snapshot || typeof snapshot !== "object") return [];
	const attainments = (snapshot as { attainments?: unknown }).attainments;
	return Array.isArray(attainments)
		? (attainments.filter(
				(row) => row && typeof row === "object",
			) as Record<string, unknown>[])
		: [];
}

function loopStatusOf(
	value: string | null | undefined,
): CqiEffectivenessRow["loopStatus"] {
	if (value === "closed") return "CLOSED";
	if (value === "open_not_implemented") return "OPEN_NOT_IMPLEMENTED";
	if (value === "open_reassess") return "OPEN_REASSESS";
	return null;
}

/**
 * Report-level service. Reads stored attainment (never re-derives the 70/30
 * composite), assembles the institutional report, and stores the validated
 * Python narrative as a `pending_review` `AiRecommendation`.
 */
export class CqiInstitutionalReportService {
	constructor(
		private readonly fetchNarrative: CqiNarrativeFetcher = defaultFetcher,
	) {}

	/** `GET /reports/cqi-institutional` — assembled report + latest narrative. */
	async getReport(termId?: string, programId?: string): Promise<CqiInstitutionalReport> {
		const { report } = await this.build(termId, programId);
		const narrative = await this.latestNarrative(report.termId);
		return {
			...report,
			findings: {
				...report.findings,
				hypotheses: narrative?.factors ?? [],
			},
			narrative,
		};
	}

	/**
	 * `POST /reports/cqi-institutional/narrative` — sends the sanitized,
	 * pre-computed payload to python-server and stores only a validated `ok`.
	 */
	async generateNarrative(
		termId: string | undefined,
		programId: string | undefined,
		userId: string,
	): Promise<{
		status: "ok" | "error" | "narrative_unavailable";
		narrative: CqiInstitutionalReport["narrative"];
		error: string | null;
		reason: string | null;
	}> {
		const { report, payload } = await this.build(termId, programId);
		const response = await this.fetchNarrative(payload);

		// NOTE: HTTP 200 does not mean success — both error statuses are 200.
		if (response.status !== "ok" || !response.summary) {
			return {
				status: response.status,
				narrative: null,
				error: response.error,
				reason: response.reason,
			};
		}

		const row = await prisma.aiRecommendation.create({
			data: {
				id: crypto.randomUUID(),
				termId: report.termId,
				programId: null,
				summary: response.summary,
				recommendationText: JSON.stringify(response),
				sourceDataSnapshot: {
					reportKind: REPORT_KIND,
					generatedByUserId: userId,
					payload,
					factsUsed: response.facts_used,
					provenance: response.provenance ?? null,
					// NOTE: stored for audit only; never rendered in the UI.
					promptUsed: response.prompt_used ?? null,
				} as unknown as Prisma.InputJsonValue,
				status: "pending_review",
			},
		});

		return {
			status: "ok",
			narrative: this.toNarrative(row),
			error: null,
			reason: null,
		};
	}

	/** `GET /reports/cqi-institutional/narrative` — latest stored narrative. */
	async latestNarrative(
		termId: string,
	): Promise<CqiInstitutionalReport["narrative"]> {
		const row = await prisma.aiRecommendation.findFirst({
			where: {
				termId,
				programId: null,
				sourceDataSnapshot: { path: ["reportKind"], equals: REPORT_KIND },
			},
			orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
		});
		return row ? this.toNarrative(row) : null;
	}

	/** `PATCH /reports/cqi-institutional/narrative/:id` — human review only. */
	async reviewNarrative(
		id: string,
		status: "acknowledged" | "dismissed",
		userId: string,
	): Promise<CqiInstitutionalReport["narrative"]> {
		const existing = await prisma.aiRecommendation.findUnique({
			where: { id },
			select: { id: true, sourceDataSnapshot: true },
		});
		const kind = (
			existing?.sourceDataSnapshot as { reportKind?: string } | null
		)?.reportKind;
		if (!existing || kind !== REPORT_KIND) {
			throw new CqiNarrativeNotFoundError(`CQI narrative '${id}' not found.`);
		}
		const row = await prisma.aiRecommendation.update({
			where: { id },
			data: {
				status,
				reviewedByUserId: userId,
				reviewedAt: new Date(),
			},
		});
		return this.toNarrative(row);
	}

	// --- Assembly -----------------------------------------------------------

	private async resolveTerm(termId?: string): Promise<TermRef[]> {
		const terms = await prisma.academicTerm.findMany({
			orderBy: [
				{ startDate: { sort: "desc", nulls: "last" } },
				{ schoolYear: "desc" },
				{ semester: "desc" },
			],
			select: {
				id: true,
				schoolYear: true,
				semester: true,
				startDate: true,
			},
		});
		if (terms.length === 0) {
			throw new CqiReportNoDataError("No academic terms exist yet.");
		}
		if (!termId) return terms;
		const found = terms.find((term) => term.id === termId);
		if (!found) throw new CqiTermNotFoundError(termId);
		// Prior-cycle lookups need the full ordered list, current first.
		const index = terms.findIndex((term) => term.id === termId);
		return [found, ...terms.slice(index + 1)];
	}

	private async build(termId?: string, programId?: string): Promise<BuildResult> {
		const [term, ...laterTerms] = await this.resolveTerm(termId);
		const priorTerm = laterTerms[0] ?? null;

		const sections = await prisma.classSection.findMany({
			where: {
				termId: term.id,
				...(programId ? { course: { programId } } : {}),
			},
			select: {
				id: true,
				sectionCode: true,
				course: {
					select: {
						id: true,
						code: true,
						title: true,
						program: { select: { id: true, code: true, name: true } },
					},
				},
			},
		});
		if (sections.length === 0) {
			throw new CqiReportNoDataError(
				`No class sections exist for ${term.schoolYear} ${term.semester}.`,
			);
		}
		const sectionById = new Map<string, SectionRef>(
			sections.map((section) => [section.id, section]),
		);
		const programIds = [...new Set(sections.map((s) => s.course.program.id))];

		const runs = await prisma.computationRun.findMany({
			where: { scope: { in: sections.map((section) => section.id) } },
			orderBy: { runAt: "desc" },
			select: { id: true, scope: true, runAt: true, etlSnapshotJson: true },
		});
		const latestRun = new Map<string, (typeof runs)[number]>();
		for (const run of runs) {
			if (!latestRun.has(run.scope)) latestRun.set(run.scope, run);
		}
		const computationRunIds = [...latestRun.values()].map((run) => run.id);
		if (computationRunIds.length === 0) {
			throw new CqiReportNoDataError(
				`No persisted computation runs for ${term.schoolYear} ${term.semester}. Upload and save a class record first.`,
			);
		}

		// --- completeness from the latest ETL snapshot per section ----------
		let snapshotRecords = 0;
		let incompleteRecords = 0;
		const sectionCloComplete = new Map<string, boolean>();
		for (const run of latestRun.values()) {
			const rows = parseAttainmentRows(run.etlSnapshotJson);
			snapshotRecords += rows.length;
			for (const row of rows) {
				const complete =
					row.is_record_complete !== false && row.rule1_met !== false;
				if (!complete) incompleteRecords += 1;
				const cloCode = typeof row.clo_code === "string" ? row.clo_code : "";
				if (!cloCode) continue;
				const key = `${run.scope}|${cloCode}`;
				sectionCloComplete.set(
					key,
					(sectionCloComplete.get(key) ?? true) && complete,
				);
			}
		}

		const attainments = await prisma.cloAttainment.findMany({
			where: { computationRunId: { in: computationRunIds } },
			select: {
				classSectionId: true,
				cloId: true,
				studentId: true,
				directScorePct: true,
				indirectScorePct: true,
				compositeScorePct: true,
				clo: { select: { code: true, description: true } },
				student: { select: { yearLevel: true } },
			},
		});
		const missingIndirectRecords = attainments.filter(
			(row) => row.indirectScorePct === null,
		).length;

		const enrollments = await prisma.enrollment.findMany({
			where: { classSection: { termId: term.id } },
			select: { classSectionId: true, studentId: true },
		});
		const enrolledCount =
			new Set(enrollments.map((row) => row.studentId)).size ||
			new Set(attainments.map((row) => row.studentId)).size;

		// --- F04 targets -----------------------------------------------------
		const targetForm = await prisma.formSubmission.findFirst({
			where: {
				formType: { code: "target_setting_matrix" },
				status: "approved",
			},
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
		const [ploTargetRows, courseTargetRows] = targetForm
			? await Promise.all([
					prisma.ploTargetRow.findMany({
						where: { targetSettingMatrixId: targetForm.id },
						select: {
							ploId: true,
							ploCode: true,
							y1TargetPct: true,
							y2TargetPct: true,
							y3TargetPct: true,
							y4TargetPct: true,
						},
					}),
					prisma.courseCloTargetRow.findMany({
						where: { targetSettingMatrixId: targetForm.id },
						select: {
							courseCode: true,
							cloCode: true,
							y1TargetPct: true,
							y2TargetPct: true,
							y3TargetPct: true,
							y4TargetPct: true,
						},
					}),
				])
			: [[], []];
		const ploTargetById = new Map<string, Record<string, unknown>>(
			ploTargetRows.map((row) => [
				row.ploId ?? row.ploCode,
				row as unknown as Record<string, unknown>,
			]),
		);
		const ploTargetByCode = new Map<string, Record<string, unknown>>(
			ploTargetRows.map((row) => [
				row.ploCode,
				row as unknown as Record<string, unknown>,
			]),
		);
		const courseTargetByKey = new Map<string, Record<string, unknown>>(
			courseTargetRows.map((row) => [
				`${row.courseCode}|${row.cloCode}`,
				row as unknown as Record<string, unknown>,
			]),
		);
		const missingTargets = new Set<string>();

		// --- CLO outcome groups ---------------------------------------------
		type CloGroup = {
			key: string;
			cloId: string;
			code: string;
			description: string;
			programCode: string;
			courseCode: string;
			records: OutcomeInput["records"];
		};
		const groups = new Map<string, CloGroup>();
		for (const row of attainments) {
			const section = sectionById.get(row.classSectionId);
			if (!section) continue;
			const composite = finite(Number(row.compositeScorePct))
				? Number(row.compositeScorePct)
				: null;
			if (composite === null) continue;
			const key = `${section.course.program.code}/${section.course.code}/${row.clo.code}`;
			let group = groups.get(key);
			if (!group) {
				group = {
					key,
					cloId: row.cloId,
					code: `${section.course.code}/${row.clo.code}`,
					description: row.clo.description,
					programCode: section.course.program.code,
					courseCode: section.course.code,
					records: [],
				};
				groups.set(key, group);
			}
			group.records.push({
				studentKey: row.studentId,
				directPct: finite(Number(row.directScorePct))
					? Number(row.directScorePct)
					: null,
				indirectPct: finite(Number(row.indirectScorePct))
					? Number(row.indirectScorePct)
					: null,
				compositePct: composite,
				yearLevel: row.student?.yearLevel ?? null,
				isComplete:
					sectionCloComplete.get(
						`${row.classSectionId}|${row.clo.code}`,
					) ?? true,
			});
		}
		if (groups.size === 0) {
			throw new CqiReportNoDataError(
				`No CLO attainment records exist for ${term.schoolYear} ${term.semester}.`,
			);
		}

		const priorCloLkm = priorTerm
			? await this.priorCloMeans(priorTerm.id)
			: new Map<string, number>();
		const cloOutcomes: OutcomeRow[] = [];
		for (const group of groups.values()) {
			const year = modalYear(group.records);
			const targetRow = courseTargetByKey.get(
				`${group.courseCode}|${group.code.split("/").pop()}`,
			);
			const targetPct = yTarget(targetRow, year);
			if (targetPct === null) missingTargets.add(group.key);
			cloOutcomes.push(
				computeOutcome({
					key: group.key,
					outcomeType: "CLO",
					code: group.code,
					description: group.description,
					programCode: group.programCode,
					courseCode: group.courseCode,
					targetPct,
					priorCycleCompositePct: priorCloLkm.get(group.key) ?? null,
					records: group.records,
				}),
			);
		}

		// --- PLO outcomes (persisted composites; direct/indirect derived) ----
		const priorPloMap = priorTerm
			? await this.priorPloMeans(priorTerm.id)
			: new Map<string, number>();
		const cloOutcomeByCloId = new Map<string, OutcomeRow>();
		for (const group of groups.values()) {
			const outcome = cloOutcomes.find((row) => row.key === group.key);
			if (outcome) cloOutcomeByCloId.set(group.cloId, outcome);
		}

		const ploOutcomes = await this.buildPloOutcomes({
			programIds,
			termId: term.id,
			cloOutcomeByCloId,
			cloToPloMaps: await prisma.cloToPloMap.findMany({
				where: { plo: { programId: { in: programIds } } },
				select: {
					cloId: true,
					ploId: true,
					plo: {
						select: {
							code: true,
							description: true,
							programId: true,
							program: { select: { code: true } },
						},
					},
				},
			}),
			ploTargetById,
			ploTargetByCode,
			priorPloMap,
			missingTargets,
		});

		// --- PEO (evidence only; never fabricated) ---------------------------
		const peoRows = await prisma.peoAttainment.findMany({
			where: { termId: term.id, programId: { in: programIds } },
			select: {
				attainedPct: true,
				peo: {
					select: {
						code: true,
						description: true,
						program: { select: { code: true } },
					},
				},
			},
		});
		const peoOutcomes: OutcomeRow[] = peoRows.map((row) =>
			computeDerivedOutcome({
				key: `${row.peo.program.code}/${row.peo.code}`,
				outcomeType: "PEO",
				code: `${row.peo.program.code}/${row.peo.code}`,
				description: row.peo.description,
				programCode: row.peo.program.code,
				courseCode: null,
				targetPct: null,
				compositePct: Number(row.attainedPct),
				directPct: null,
				indirectPct: null,
				priorCycleCompositePct: null,
				values: [],
				studentCount: 0,
				assessedCount: 0,
			}),
		);

		const outcomes = [...cloOutcomes, ...ploOutcomes, ...peoOutcomes];
		const scoredOutcomes = [...cloOutcomes, ...ploOutcomes];

		// --- previous CQI + escalation ---------------------------------------
		const escalation = await this.computeEscalations(programIds);
		const entries = await this.buildCqiEntries({
			termId: term.id,
			priorTermId: priorTerm?.id ?? null,
			escalatedOutcomes: escalation,
			outcomeByKey: new Map(scoredOutcomes.map((row) => [row.key, row])),
		});

		const findings = computeFindings(scoredOutcomes);
		const priorComparisons = comparePrior(
			scoredOutcomes,
			new Map([
				...priorCloLkm.entries(),
				...priorPloMap.entries(),
			]),
		);
		const nextCycle = computeNextCyclePriorities(
			priorComparisons,
			entries,
			findings,
		);

		const statistics = computePerformanceStats(
			attainments.map((row) => ({
				studentKey: row.studentId,
				compositePct: finite(Number(row.compositeScorePct))
					? Number(row.compositeScorePct)
					: null,
			})),
			enrolledCount,
		);

		const programSummaries = [
			...new Map(
				sections.map((s) => [s.course.program.id, s.course.program]),
			).values(),
		].map(
			(program) => {
				const programSectionIds = new Set(
					sections
						.filter((s) => s.course.program.id === program.id)
						.map((s) => s.id),
				);
				const programStudentIds = new Set<string>();
				for (const enrollment of enrollments) {
					if (programSectionIds.has(enrollment.classSectionId)) {
						programStudentIds.add(enrollment.studentId);
					}
				}
				const meansByStudent = new Map<string, number[]>();
				for (const row of attainments) {
					if (!programSectionIds.has(row.classSectionId)) continue;
					const composite = finite(Number(row.compositeScorePct))
						? Number(row.compositeScorePct)
						: null;
					if (composite === null) continue;
					const bucket = meansByStudent.get(row.studentId) ?? [];
					bucket.push(composite);
					meansByStudent.set(row.studentId, bucket);
				}
				const atRiskCount = [...meansByStudent.entries()]
					.filter(([, bucket]) => {
						const studentMean = mean(bucket);
						return studentMean !== null && studentMean < MIN_ATTAINMENT_PCT;
					})
					.length;
				return {
					programCode: program.code,
					programName: program.name,
					atRiskCount,
					assessedCount: meansByStudent.size,
					totalStudents: programStudentIds.size,
				};
			},
		);

		const missingSections = [
			peoOutcomes.length === 0
				? "PEO attainment (no captured evidence)"
				: null,
			priorTerm === null
				? "Prior-cycle comparison (no earlier term)"
				: null,
			entries.length === 0
				? "CQI action entries (none recorded for this cycle)"
				: null,
			entries.length > 0
				? "Structured KPI target and deadline (stored as free text)"
				: null,
			missingTargets.size > 0
				? `F04 targets (${missingTargets.size} outcome(s) fall back to the ${FLOOR_PCT}% floor)`
				: null,
			missingIndirectRecords > 0
				? `Indirect survey ratings missing on ${missingIndirectRecords} CLO record(s)`
				: null,
		].filter((value): value is string => value !== null);

		const report: CqiInstitutionalReport = {
			termId: term.id,
			term: { schoolYear: term.schoolYear, semester: term.semester },
			generatedAt: new Date().toISOString(),
			scope: {
				programs: [...new Map(sections.map((s) => [s.course.program.id, s.course.program])).values()].map(
					(program) => ({ code: program.code, name: program.name }),
				),
				sections: sections.length,
				courses: new Set(sections.map((s) => s.course.id)).size,
				enrolledCount,
				assessedCount: statistics.assessedCount,
				computationRunIds,
				thresholds: {
					floorPct: MIN_ATTAINMENT_PCT,
					targetSource: targetForm
						? "Latest approved F04 Target-Setting Matrix; missing rows fall back to the 70% floor."
						: "No approved F04 matrix found; the 70% floor is used.",
				},
			},
			completeness: {
				snapshotRecords,
				incompleteRecords,
				completenessPct:
					snapshotRecords === 0
						? null
						: round2(
								((snapshotRecords - incompleteRecords) / snapshotRecords) * 100,
							),
				missingIndirectRecords,
				missingTargets: [...missingTargets],
				missingSections,
			},
			programSummaries,
			statistics,
			outcomes,
			priorComparisons,
			findings: {
				strengths: findings.strengths,
				weaknesses: findings.weaknesses,
				hypotheses: [],
			},
			previousCqi: entries,
			nextCycle,
			narrative: null,
		};

		return {
			report,
			payload: this.buildNarrativePayload(term, statistics, scoredOutcomes, entries),
			entries,
		};
	}

	private async priorCloMeans(termId: string): Promise<Map<string, number>> {
		const sections = await prisma.classSection.findMany({
			where: { termId },
			select: {
				id: true,
				course: {
					select: { code: true, program: { select: { code: true } } },
				},
			},
		});
		if (sections.length === 0) return new Map();
		const runs = await prisma.computationRun.findMany({
			where: { scope: { in: sections.map((section) => section.id) } },
			orderBy: { runAt: "desc" },
			select: { id: true, scope: true },
		});
		const latest = new Map<string, string>();
		for (const run of runs) if (!latest.has(run.scope)) latest.set(run.scope, run.id);
		const sectionById = new Map(sections.map((section) => [section.id, section]));
		const rows = await prisma.cloAttainment.findMany({
			where: { computationRunId: { in: [...latest.values()] } },
			select: {
				classSectionId: true,
				compositeScorePct: true,
				clo: { select: { code: true } },
			},
		});
		const grouped = new Map<string, number[]>();
		for (const row of rows) {
			const section = sectionById.get(row.classSectionId);
			if (!section) continue;
			const key = `${section.course.program.code}/${section.course.code}/${row.clo.code}`;
			const bucket = grouped.get(key) ?? [];
			bucket.push(Number(row.compositeScorePct));
			grouped.set(key, bucket);
		}
		const result = new Map<string, number>();
		for (const [key, values] of grouped) {
			const value = mean(values);
			if (value !== null) result.set(key, value);
		}
		return result;
	}

	private async priorPloMeans(termId: string): Promise<Map<string, number>> {
		const rows = await prisma.ploAttainment.findMany({
			where: { termId },
			orderBy: { computationRun: { runAt: "desc" } },
			select: {
				ploId: true,
				attainedPct: true,
				plo: {
					select: { code: true, program: { select: { code: true } } },
				},
			},
		});
		const result = new Map<string, number>();
		for (const row of rows) {
			const key = `${row.plo.program.code}/${row.plo.code}`;
			if (!result.has(key)) result.set(key, Number(row.attainedPct));
		}
		return result;
	}

	private async buildPloOutcomes(input: {
		programIds: string[];
		termId: string;
		cloOutcomeByCloId: Map<string, OutcomeRow>;
		cloToPloMaps: {
			cloId: string;
			ploId: string;
			plo: {
				code: string;
				description: string;
				programId: string;
				program: { code: string };
			};
		}[];
		ploTargetById: Map<string, Record<string, unknown>>;
		ploTargetByCode: Map<string, Record<string, unknown>>;
		priorPloMap: Map<string, number>;
		missingTargets: Set<string>;
	}): Promise<OutcomeRow[]> {
		const mappedClos = new Map<string, OutcomeRow[]>();
		for (const map of input.cloToPloMaps) {
			const outcome = input.cloOutcomeByCloId.get(map.cloId);
			if (!outcome) continue;
			const bucket = mappedClos.get(map.ploId) ?? [];
			bucket.push(outcome);
			mappedClos.set(map.ploId, bucket);
		}

		const stored = await prisma.ploAttainment.findMany({
			where: { termId: input.termId, programId: { in: input.programIds } },
			orderBy: { computationRun: { runAt: "desc" } },
			select: {
				ploId: true,
				attainedPct: true,
				plo: {
					select: {
						code: true,
						description: true,
						programId: true,
						program: { select: { code: true } },
					},
				},
			},
		});

		const rows = new Map<string, OutcomeRow>();
		for (const row of stored) {
			const key = `${row.plo.program.code}/${row.plo.code}`;
			if (rows.has(key)) continue;
			const mapped = mappedClos.get(row.ploId) ?? [];
			const targetPct = yTarget(
				input.ploTargetById.get(row.ploId) ??
					input.ploTargetByCode.get(row.plo.code),
				null,
			);
			if (targetPct === null) input.missingTargets.add(key);
			rows.set(
				key,
				computeDerivedOutcome({
					key,
					outcomeType: "PLO",
					code: key,
					description: row.plo.description,
					programCode: row.plo.program.code,
					courseCode: null,
					targetPct,
					compositePct: Number(row.attainedPct),
					directPct: mean(
						mapped
							.map((outcome) => outcome.directPct)
							.filter(finite),
					),
					indirectPct: mean(
						mapped
							.map((outcome) => outcome.indirectPct)
							.filter(finite),
					),
					priorCycleCompositePct: input.priorPloMap.get(key) ?? null,
					// NOTE: PLO per-student scores are not persisted; the mapped
					// CLO record distribution is shown and the row is marked derived.
					values: mapped.flatMap((outcome) =>
						outcome.compositePct === null
							? []
							: Array.from(
									{ length: outcome.assessedCount },
									() => outcome.compositePct as number,
								),
					),
					studentCount: Math.max(
						...mapped.map((outcome) => outcome.studentCount),
						0,
					),
					assessedCount: mapped.reduce(
						(sum, outcome) => sum + outcome.assessedCount,
						0,
					),
				}),
			);
		}

		// Fallback: no stored PLO attainment — derive from mapped CLO means.
		for (const [ploId, mapped] of mappedClos) {
			const sample = input.cloToPloMaps.find((map) => map.ploId === ploId);
			if (!sample) continue;
			const key = `${sample.plo.program.code}/${sample.plo.code}`;
			if (rows.has(key)) continue;
			const targetPct = yTarget(
				input.ploTargetById.get(ploId) ??
					input.ploTargetByCode.get(sample.plo.code),
				null,
			);
			if (targetPct === null) input.missingTargets.add(key);
			const composite = mean(
				mapped.map((outcome) => outcome.compositePct).filter(finite),
			);
			rows.set(
				key,
				computeDerivedOutcome({
					key,
					outcomeType: "PLO",
					code: key,
					description: sample.plo.description,
					programCode: sample.plo.program.code,
					courseCode: null,
					targetPct,
					compositePct: composite,
					directPct: mean(
						mapped.map((outcome) => outcome.directPct).filter(finite),
					),
					indirectPct: mean(
						mapped.map((outcome) => outcome.indirectPct).filter(finite),
					),
					priorCycleCompositePct: input.priorPloMap.get(key) ?? null,
					values: mapped
						.map((outcome) => outcome.compositePct)
						.filter(finite),
					studentCount: Math.max(
						...mapped.map((outcome) => outcome.studentCount),
						0,
					),
					assessedCount: mapped.reduce(
						(sum, outcome) => sum + outcome.assessedCount,
						0,
					),
				}),
			);
		}
		return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
	}

	/**
	 * Escalation = the same PLO misses the 70% floor for 3 consecutive terms.
	 * Reuses the systemic-gap rule rather than duplicating the run logic.
	 */
	private async computeEscalations(
		programIds: string[],
	): Promise<Set<string>> {
		const terms = await prisma.academicTerm.findMany({
			orderBy: [
				{ startDate: { sort: "desc", nulls: "last" } },
				{ schoolYear: "desc" },
				{ semester: "desc" },
			],
			select: { id: true },
		});
		const rows = await prisma.ploAttainment.findMany({
			where: { programId: { in: programIds } },
			select: {
				ploId: true,
				termId: true,
				attainedPct: true,
				plo: {
					select: { code: true, program: { select: { code: true } } },
				},
			},
		});
		const seen = new Set<string>();
		const snapshots = terms.map((term) => ({
			cycle: term.id,
			plos: rows
				.filter((row) => {
					const key = `${row.ploId}|${row.termId}`;
					if (row.termId !== term.id || seen.has(key)) return false;
					seen.add(key);
					return true;
				})
				.map((row) => ({
					ploCode: `${row.plo.program.code}/${row.plo.code}`,
					achieved: Number(row.attainedPct) >= FLOOR_PCT,
				})),
		}));
		return new Set(findSystemicTriggers(snapshots).ploCodes);
	}

	private async buildCqiEntries(input: {
		termId: string;
		priorTermId: string | null;
		escalatedOutcomes: Set<string>;
		outcomeByKey: Map<string, OutcomeRow>;
	}): Promise<CqiEffectivenessRow[]> {
		const termIds = [input.termId, input.priorTermId].filter(
			(value): value is string => value !== null,
		);
		const rows = await prisma.cqiEntry.findMany({
			where: { cqiActionPlan: { termId: { in: termIds } } },
			select: {
				id: true,
				priorAttainmentPct: true,
				currentAttainmentPct: true,
				interventionImplemented: true,
				intervention: true,
				ownerRole: true,
				rootCauseCategory: true,
				timelineAndKpi: true,
				plo: {
					select: {
						code: true,
						program: { select: { code: true } },
					},
				},
				ctlRow: { select: { loopStatus: true } },
			},
		});
		const entries: CqiEffectivenessInput[] = rows.map((row) => {
			const outcomeCode = `${row.plo.program.code}/${row.plo.code}`;
			return {
				entryId: row.id,
				outcomeCode,
				programCode: row.plo.program.code,
				priorAttainmentPct:
					row.priorAttainmentPct === null
						? null
						: Number(row.priorAttainmentPct),
				currentAttainmentPct:
					row.currentAttainmentPct === null
						? null
						: Number(row.currentAttainmentPct),
				implementationStatus: row.interventionImplemented,
				loopStatus: loopStatusOf(row.ctlRow?.loopStatus),
				intervention: row.intervention,
				ownerRole: row.ownerRole,
				rootCauseCategory: row.rootCauseCategory,
				timelineAndKpi: row.timelineAndKpi,
				isEscalated: input.escalatedOutcomes.has(outcomeCode),
			};
		});
		return computeCqiEffectiveness(entries);
	}

	// --- Narrative ----------------------------------------------------------

	private buildNarrativePayload(
		term: TermRef,
		statistics: CqiInstitutionalReport["statistics"],
		outcomes: OutcomeRow[],
		entries: CqiEffectivenessRow[],
	): CqiNarrativePayload {
		// NOTE: institution-wide report — no single program metadata is sent.
		const payload: CqiNarrativePayload = {
			program_term: {
				term_label: `${term.schoolYear} ${term.semester}`,
				academic_year: term.schoolYear,
			},
			counts: {
				enrolled_count: statistics.enrolledCount,
				assessed_count: statistics.assessedCount,
			},
			// NOTE: only aggregate outcome values leave the webapp; no student rows.
			outcomes: outcomes
				.filter((row) => row.outcomeType !== "PEO")
				.map((row) => ({
					outcome_type: row.outcomeType === "CLO" ? ("CLO" as const) : ("PLO" as const),
					outcome_code: row.key,
					target_pct: row.effectiveTargetPct,
					direct_pct: row.directPct ?? undefined,
					indirect_pct: row.indirectPct ?? undefined,
					composite_pct: row.compositePct ?? undefined,
					is_complete: row.isComplete,
					prior_cycle_composite_pct: row.priorCycleCompositePct ?? undefined,
					status:
						row.status === "MET" || row.status === "NOT MET"
							? row.status
							: undefined,
				})),
			cqi_entries: entries.map((entry): CqiNarrativeEntry => {
				const outcome = outcomes.find(
					(row) => row.key === entry.outcomeCode,
				);
				return {
					outcome_code: entry.outcomeCode,
					status: outcome?.status === "MET" ? "MET" : "NOT MET",
					loop_status: entry.loopStatus ?? undefined,
					is_escalated: entry.isEscalated,
					// NOTE: role only — the personal `owner` field never leaves the DB.
					named_owner: entry.ownerRole.trim() || "Program Chair",
					intervention: entry.intervention.slice(0, 500),
					timeline: entry.timelineAndKpi.slice(0, 200),
					root_cause_category: entry.rootCauseCategory ?? undefined,
				};
			}),
		};
		return payload;
	}

	private toNarrative(
		row: {
			id: string;
			status: string;
			generatedAt: Date;
			summary: string;
			recommendationText: string;
		},
	): NonNullable<CqiInstitutionalReport["narrative"]> {
		let parsed: Partial<CqiNarrativeResponse> = {};
		try {
			parsed = JSON.parse(row.recommendationText) as CqiNarrativeResponse;
		} catch {
			// NOTE: a malformed row still renders its summary, not a crash.
		}
		return {
			id: row.id,
			status: row.status,
			generatedAt: row.generatedAt.toISOString(),
			summary: parsed.summary ?? row.summary,
			recommendations: parsed.recommendations ?? [],
			pattern: parsed.pattern
				? {
						description: parsed.pattern.description,
						evidenceFactIds: parsed.pattern.evidence_fact_ids ?? [],
					}
				: null,
			factors: (parsed.possible_contributing_factors ?? []).map(
				(factor) => ({
					hypothesis: factor.hypothesis,
					rootCauseCategory: factor.root_cause_category,
					evidenceFactIds: factor.evidence_fact_ids ?? [],
					status: "pending_program_chair_confirmation" as const,
				}),
			),
			dataLimitations: parsed.data_limitations ?? [],
			missingSections: parsed.missing_sections ?? [],
			provenance: parsed.provenance ?? null,
		};
	}
}

export const cqiInstitutionalReportService =
	new CqiInstitutionalReportService();
