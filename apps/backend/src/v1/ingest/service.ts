import { EDITABLE_STATUSES } from "@lib/forms/state-machine";
import { registerSubmitGate, SubmitGateError } from "@lib/forms/submit-gates";
import { csvPercent, parseCsv } from "@lib/ingest/csv";
import type {
	ETLJob,
	EtlLoadedData,
	EtlResultData,
	EtlSectionExtractionStatus,
	EtlSectionInfo,
	EtlSetupInfo,
} from "@lib/ingest/ingest-client";
import { ingestClient } from "@lib/ingest/ingest-client";
import { normalizeName, parseStudentName } from "@lib/ingest/name-utils";
import {
	computeEditedAttainment,
	reconcileAtRisk,
} from "@lib/ingest/score-edit";
import { prisma } from "@lib/prisma";
import type { Prisma, UploadRecord } from "@prisma/generated/prisma/client";
import { submissionService } from "@v1/forms/service";

import {
	compareSectionToWorkbook,
	type SectionComparisonResult,
} from "./section-verifier";

// --- In-memory Cache for Idempotency ---
// NOTE: clients poll completed jobs repeatedly — the cache runs the persistence
// logic once and replays the stored result on every later poll. `ready` is the
// reviewed-but-unsaved ETL result: what a later save commits from.
export type CachedJobResult =
	| { status: "ready"; etl?: EtlResultData | null; preview: UploadPreview }
	| {
			status: "completed";
			persistence: PersistenceSummary;
			etl?: unknown;
			verification?: SectionComparisonResult;
	  }
	| { status: "failed"; error: unknown };

const jobCompletionCache = new Map<string, CachedJobResult>();

// In-flight persistence mutex to avoid concurrent execution during client polling
const inFlightJobs = new Set<string>();

// --- Interfaces ---

export interface AttainmentRecord {
	student_name: string;
	student_id: string | null;
	clo_code: string;
	direct_clo_attainment_pct: number;
	indirect_clo_attainment_pct?: number | null;
	composite_clo_attainment_pct?: number | null;
	met_threshold: boolean;
	tla_pct?: number | null;
	at_pct?: number | null;
	exam_pct?: number | null;
	output_pct?: number | null;
}

export interface TypedEtlLoadedData extends EtlLoadedData {
	attainments: AttainmentRecord[];
	formula_version?: string;
	section?: EtlSectionInfo;
	section_extraction?: EtlSectionExtractionStatus;
	setup?: EtlSetupInfo;
}

/** Subset of the class-record header the persistence bootstrap can rely on. */
interface ImportedHeader {
	course_code?: string | null;
	course_title?: string | null;
	course_type?: string | null;
	section?: string | null;
	semester_year?: string | null;
	instructor_name?: string | null;
	no_of_students?: number;
	threshold?: number;
	grading_system?: string | null;
}

interface CloPloMappingEntry {
	clo_code?: string;
	plo_code?: string;
	correlation_strength?: number;
}

export type PersistenceSummary = {
	computationRunId: string;
	studentsProcessed: number;
	studentsCreated: number;
	cloAttainmentsCreated: number;
	atRiskFlagsCreated: number;
	cloMatchFailures: { cloCode: string; studentName: string; reason: string }[];
	verification?: SectionComparisonResult;
};

/**
 * Read-only summary of a finished ETL job shown before the user saves —
 * nothing is written to the attainment tables until `saveJob` runs.
 */
export interface UploadPreview {
	verification: SectionComparisonResult;
	students: number;
	rows: number;
	atRisk: number;
	/** CLO codes the section's course does not define — rows a save skips. */
	unmatchedClos: { cloCode: string; rows: number }[];
	setup: EtlSetupInfo | null;
}

export type AttainmentRosterRow = {
	id: string;
	studentId: string;
	studentName: string;
	studentNumber: string;
	cloCode: string;
	directScorePct: number;
	compositeScorePct: number;
	isBelowThreshold: boolean;
	atRisk: boolean;
};

export type ScoreUpdateSummary = {
	updated: number;
	flagsCreated: number;
	flagsRemoved: number;
	failures: { attainmentId: string; reason: string }[];
};

export type ReimportSummary = {
	computationRunId: string;
	studentsCreated: number;
	attainmentsCreated: number;
	attainmentsUpdated: number;
	flagsCreated: number;
	flagsRemoved: number;
	skipped: { row: number; reason: string }[];
};

// --- Form type -----------------------------------------------------------------

export const CLO_RAW_DATA_CODE = "clo_raw_data";

const CLO_RAW_DATA_META = {
	name: "Per-Student CLO Raw Data Sheet",
	sequenceNo: 7,
} as const;

/**
 * Race-safe `FormType` ensure (same pattern as `ensureActionTakenFormType`) —
 * created lazily on the first init, never seeded.
 */
export async function ensureCloRawDataType(): Promise<string> {
	const existing = await prisma.formType.findUnique({
		where: { code: CLO_RAW_DATA_CODE },
		select: { id: true },
	});
	if (existing) return existing.id;

	try {
		const created = await prisma.formType.create({
			data: {
				id: crypto.randomUUID(),
				code: CLO_RAW_DATA_CODE,
				name: CLO_RAW_DATA_META.name,
				pdcaStage: "DO",
				sequenceNo: CLO_RAW_DATA_META.sequenceNo,
			},
			select: { id: true },
		});
		return created.id;
	} catch {
		const retried = await prisma.formType.findUnique({
			where: { code: CLO_RAW_DATA_CODE },
			select: { id: true },
		});
		if (retried) return retried.id;
		throw new Error(`Failed to ensure the ${CLO_RAW_DATA_CODE} form type`);
	}
}

// --- Custom Errors ---

export class ClassSectionNotFoundError extends Error {
	constructor(classSectionId: string) {
		super(
			`ClassSection with ID '${classSectionId}' not found. Sections must exist before uploading class records.`,
		);
		this.name = "ClassSectionNotFoundError";
	}
}

export class SectionBindingMismatchError extends Error {
	constructor(queryId: string, boundId: string) {
		super(
			`Requested class section '${queryId}' does not match the class section '${boundId}' bound to this upload job.`,
		);
		this.name = "SectionBindingMismatchError";
	}
}

export class SectionMismatchError extends Error {
	public readonly verification: SectionComparisonResult;

	constructor(message: string, verification: SectionComparisonResult) {
		super(message);
		this.name = "SectionMismatchError";
		this.verification = verification;
	}
}

export class MalformedEtlResultError extends Error {
	public readonly etlJobId: string;

	constructor(etlJobId: string) {
		super(
			"The result from the python-server was missing the expected 'result.loaded.attainments' structure.",
		);
		this.name = "MalformedEtlResultError";
		this.etlJobId = etlJobId;
	}
}

export class ComputationRunNotFoundError extends Error {
	constructor(classSectionId: string) {
		super(
			`No computation run found for class section '${classSectionId}'. Upload a class record first.`,
		);
		this.name = "ComputationRunNotFoundError";
	}
}

export class MalformedRosterCsvError extends Error {
	constructor() {
		super(
			"The roster CSV must have a header row with a student name column and at least one CLO column (e.g. 'CLO1').",
		);
		this.name = "MalformedRosterCsvError";
	}
}

// --- Services ---

export class AttainmentService {
	async persistAttainment(
		etlLoadedData: TypedEtlLoadedData,
		classSectionId: string,
		triggeredByUserId?: string,
	): Promise<PersistenceSummary> {
		const { programId, courseId, academicContext } =
			await this.resolveAcademicChain(classSectionId);

		// Run workbook verification before writing anything to the DB
		const verification = compareSectionToWorkbook(academicContext, {
			section: etlLoadedData.section,
			section_extraction: etlLoadedData.section_extraction,
			setup: etlLoadedData.setup,
		});

		if (
			etlLoadedData.section_extraction === "ok" &&
			verification.status === "mismatch"
		) {
			const detail = verification.mismatches.join("; ");
			throw new SectionMismatchError(
				`Workbook verification failed: ${detail}`,
				verification,
			);
		}

		const summary: PersistenceSummary = {
			computationRunId: "",
			studentsProcessed: 0,
			studentsCreated: 0,
			cloAttainmentsCreated: 0,
			atRiskFlagsCreated: 0,
			cloMatchFailures: [],
			verification,
		};

		const snapshotWithVerification = {
			...etlLoadedData,
			verification,
		};

		const computationRun = await prisma.computationRun.create({
			data: {
				id: crypto.randomUUID(),
				scope: classSectionId,
				formulaVersion: etlLoadedData.formula_version ?? "70_30_v1",
				directWeight: 0.7,
				indirectWeight: 0.3,
				etlSnapshotJson:
					snapshotWithVerification as unknown as Prisma.InputJsonValue,
				...(triggeredByUserId ? { triggeredByUserId } : {}),
			},
		});
		summary.computationRunId = computationRun.id;

		const cloCache = new Map<string, { id: string } | null>();
		const studentCache = new Map<string, { id: string }>();
		// NOTE: students seen this run — enrollment upserted once each so noEnrolled is non-zero (testing_results 6.5)
		const enrolledCache = new Set<string>();

		for (const record of etlLoadedData.attainments) {
			summary.studentsProcessed++;

			const cacheKey = `${record.student_name}|${record.student_id ?? ""}`;
			let student = studentCache.get(cacheKey);

			if (!student) {
				const resolved = await this.resolveOrCreateStudent(
					record.student_name,
					record.student_id,
					programId,
				);
				if (!resolved) {
					console.warn(
						`[Critical] Failed to find or create a student for record: ${record.student_name}. This record will be skipped.`,
					);
					continue;
				}
				if (resolved.created) {
					summary.studentsCreated++;
					console.log(
						`Created new student: ${resolved.firstName} ${resolved.lastName} from record name "${record.student_name}"`,
					);
				}
				student = { id: resolved.id };
				studentCache.set(cacheKey, student);
			}

			if (!enrolledCache.has(student.id)) {
				// NOTE: idempotent across re-uploads via the (studentId, classSectionId) unique — re-upload still appends runs (testing_results 5.5)
				await prisma.enrollment.upsert({
					where: {
						studentId_classSectionId: {
							studentId: student.id,
							classSectionId,
						},
					},
					create: {
						id: crypto.randomUUID(),
						studentId: student.id,
						classSectionId,
					},
					update: {},
				});
				enrolledCache.add(student.id);
			}

			let clo: { id: string } | null;
			const cachedClo = cloCache.get(record.clo_code);
			if (cachedClo !== undefined) {
				clo = cachedClo;
			} else {
				const dbClo = await prisma.clo.findFirst({
					where: {
						courseId: courseId,
						code: record.clo_code,
					},
					select: { id: true },
				});
				cloCache.set(record.clo_code, dbClo);
				clo = dbClo;
			}

			if (!clo) {
				const failure = {
					cloCode: record.clo_code,
					studentName: record.student_name,
					reason: `CLO code '${record.clo_code}' not found for the course associated with ClassSection '${classSectionId}'.`,
				};
				summary.cloMatchFailures.push(failure);
				console.warn(
					`Skipping attainment record for student '${record.student_name}'. Reason: ${failure.reason}`,
				);
				continue;
			}

			const directScore = record.direct_clo_attainment_pct * 100;
			const indirectScore = record.indirect_clo_attainment_pct ?? null;
			const compositeScore = record.composite_clo_attainment_pct ?? directScore;
			const isBelowThreshold = !record.met_threshold;

			const newAttainment = await prisma.cloAttainment.create({
				data: {
					id: crypto.randomUUID(),
					directScorePct: directScore,
					indirectScorePct: indirectScore,
					compositeScorePct: compositeScore,
					examPct: asNullablePct(record.exam_pct),
					atPct: asNullablePct(record.at_pct),
					tlaPct: asNullablePct(record.tla_pct),
					outputPct: asNullablePct(record.output_pct),
					isBelowThreshold,
					classSectionId: classSectionId,
					cloId: clo.id,
					studentId: student.id,
					computationRunId: computationRun.id,
				},
			});
			summary.cloAttainmentsCreated++;

			if (isBelowThreshold) {
				await prisma.atRiskFlag.create({
					data: {
						id: crypto.randomUUID(),
						studentId: student.id,
						cloAttainmentId: newAttainment.id,
						reason: `Below institutional threshold on ${
							record.clo_code
						}: ${directScore.toFixed(1)}%`,
					},
				});
				summary.atRiskFlagsCreated++;
			}
		}

		return summary;
	}

	/**
	 * Read-only pre-save summary of an ETL result: section verification plus
	 * the parsed counts, mirroring what `persistAttainment` would write.
	 */
	async buildPreview(
		etlLoadedData: TypedEtlLoadedData,
		classSectionId: string,
	): Promise<UploadPreview> {
		const { courseId, academicContext } =
			await this.resolveAcademicChain(classSectionId);

		const verification = compareSectionToWorkbook(academicContext, {
			section: etlLoadedData.section,
			section_extraction: etlLoadedData.section_extraction,
			setup: etlLoadedData.setup,
		});

		const knownClos = new Set(
			(
				await prisma.clo.findMany({
					where: { courseId },
					select: { code: true },
				})
			).map((clo) => clo.code.toUpperCase()),
		);

		const students = new Set<string>();
		const unmatched = new Map<string, number>();
		let atRisk = 0;

		for (const record of etlLoadedData.attainments) {
			students.add(`${record.student_name}|${record.student_id ?? ""}`);
			// NOTE: same rule as persistAttainment's isBelowThreshold, so the
			// preview's at-risk count matches the flags a save creates.
			if (!record.met_threshold) atRisk++;
			const code = String(record.clo_code).toUpperCase();
			if (!knownClos.has(code)) {
				unmatched.set(
					record.clo_code,
					(unmatched.get(record.clo_code) ?? 0) + 1,
				);
			}
		}

		return {
			verification,
			students: students.size,
			rows: etlLoadedData.attainments.length,
			atRisk,
			unmatchedClos: [...unmatched].map(([cloCode, rows]) => ({
				cloCode,
				rows,
			})),
			setup: etlLoadedData.setup ?? null,
		};
	}

	/**
	 * Lists the per-student CLO attainment rows for a class section's compute
	 * run — the editable roster backing the `clo_raw_data` table. `atRisk`
	 * reflects whether an `AtRiskFlag` currently points at the attainment.
	 */
	async listAttainments(
		classSectionId: string,
		computationRunId?: string,
	): Promise<AttainmentRosterRow[]> {
		const run = await this.resolveRun(classSectionId, computationRunId);
		const rows = await prisma.cloAttainment.findMany({
			where: { classSectionId, computationRunId: run.id },
			include: {
				student: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						studentNumber: true,
					},
				},
				clo: { select: { code: true } },
				atRiskFlags: { select: { id: true } },
			},
			orderBy: [{ student: { lastName: "asc" } }, { clo: { code: "asc" } }],
		});

		return rows.map((row) => ({
			id: row.id,
			studentId: row.student.id,
			studentName: `${row.student.lastName}, ${row.student.firstName}`.trim(),
			studentNumber: row.student.studentNumber,
			cloCode: row.clo.code,
			directScorePct: Number(row.directScorePct ?? row.compositeScorePct),
			compositeScorePct: Number(row.compositeScorePct),
			isBelowThreshold: row.isBelowThreshold,
			atRisk: row.atRiskFlags.length > 0,
		}));
	}

	/**
	 * Manually edits one or more per-student CLO scores for a class section.
	 * Derived fields (`compositeScorePct`, `isBelowThreshold`) are recomputed
	 * and the `AtRiskFlag` is reconciled to match the ≥70% rule — flags are
	 * computed, never hand-entered. Writes an audit trail.
	 */
	async updateScores(
		classSectionId: string,
		updates: { attainmentId: string; directScorePct: number }[],
		triggeredByUserId?: string,
	): Promise<ScoreUpdateSummary> {
		const run = await this.resolveRun(classSectionId);
		const summary: ScoreUpdateSummary = {
			updated: 0,
			flagsCreated: 0,
			flagsRemoved: 0,
			failures: [],
		};

		const existing = await prisma.cloAttainment.findMany({
			where: {
				computationRunId: run.id,
				id: { in: updates.map((u) => u.attainmentId) },
			},
			select: { id: true, indirectScorePct: true },
		});
		const existingIds = new Set(existing.map((row) => row.id));

		for (const update of updates) {
			if (!existingIds.has(update.attainmentId)) {
				summary.failures.push({
					attainmentId: update.attainmentId,
					reason: "Attainment not found in this section's computation run.",
				});
				continue;
			}

			const existingAttainment = existing.find(
				(row) => row.id === update.attainmentId,
			);
			const edited = computeEditedAttainment(
				update.directScorePct,
				existingAttainment?.indirectScorePct === null ||
					existingAttainment?.indirectScorePct === undefined
					? existingAttainment?.indirectScorePct
					: Number(existingAttainment.indirectScorePct),
			);
			const attainment = await prisma.cloAttainment.update({
				where: { id: update.attainmentId },
				data: {
					directScorePct: update.directScorePct,
					compositeScorePct: edited.compositeScorePct,
					isBelowThreshold: edited.isBelowThreshold,
				},
				include: { atRiskFlags: { select: { id: true } } },
			});
			summary.updated++;

			const reconcile = reconcileAtRisk(
				edited.isBelowThreshold,
				attainment.atRiskFlags.length > 0,
			);
			if (reconcile.shouldCreate) {
				await prisma.atRiskFlag.create({
					data: {
						id: crypto.randomUUID(),
						studentId: attainment.studentId,
						cloAttainmentId: attainment.id,
						reason: `Below institutional threshold on edited score: ${edited.compositeScorePct.toFixed(1)}%`,
					},
				});
				summary.flagsCreated++;
			}
			if (reconcile.shouldPrune) {
				const deleted = await prisma.atRiskFlag.deleteMany({
					where: { cloAttainmentId: attainment.id },
				});
				summary.flagsRemoved += deleted.count;
			}
		}

		if (triggeredByUserId && summary.updated > 0) {
			await this.audit(triggeredByUserId, "clo_raw_data.scores_updated", {
				classSectionId,
				computationRunId: run.id,
				updated: summary.updated,
				flagsCreated: summary.flagsCreated,
				flagsRemoved: summary.flagsRemoved,
			});
		}

		return summary;
	}

	/**
	 * Re-imports a wide-format roster CSV (header: `student_name, student_id,
	 * CLO1, CLO2, ...`) for a class section. Per-cell non-blank values are
	 * matched to the section's course CLOs by header code; the target
	 * `CloAttainment` is created or updated with recomputed derived fields and
	 * a reconciled at-risk flag. Returns a per-row skip list for unknowns.
	 */
	async reimportScores(
		file: File,
		classSectionId: string,
		computationRunId?: string,
	): Promise<ReimportSummary> {
		const run = await this.resolveRun(classSectionId, computationRunId);
		const text = await file.text();
		const parsed = parseCsv(text);

		const summary: ReimportSummary = {
			computationRunId: run.id,
			studentsCreated: 0,
			attainmentsCreated: 0,
			attainmentsUpdated: 0,
			flagsCreated: 0,
			flagsRemoved: 0,
			skipped: [],
		};

		if (parsed.length === 0) return summary;
		const [header, ...dataRows] = parsed;

		const nameIdx = header.findIndex((h) => /name/i.test(h));
		const idIdx = header.findIndex(
			(h, i) => i !== nameIdx && /(id|number|no\.?)$/i.test(h),
		);
		const cloColumns = header
			.map((code, idx) => ({ code: code.trim().toUpperCase(), idx }))
			.filter(
				({ idx, code }) =>
					idx !== nameIdx &&
					idx !== idIdx &&
					code !== "" &&
					/^CLO\d+$/i.test(code),
			);

		if (nameIdx === -1 || cloColumns.length === 0) {
			throw new MalformedRosterCsvError();
		}

		const cloByCode = await this.resolveClos(
			classSectionId,
			cloColumns.map((c) => c.code),
		);
		const section = await prisma.classSection.findUnique({
			where: { id: classSectionId },
			select: { course: { select: { programId: true } } },
		});
		const programId = section?.course.programId ?? null;
		const studentCache = new Map<string, { id: string; created: boolean }>();

		for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx += 1) {
			const cells = dataRows[rowIdx];
			const studentName = cells[nameIdx]?.trim();
			if (!studentName) {
				summary.skipped.push({
					row: rowIdx + 2,
					reason: "Blank student name.",
				});
				continue;
			}
			const studentId = idIdx >= 0 ? cells[idIdx]?.trim() || null : null;

			const cached = studentCache.get(`${studentName}|${studentId ?? ""}`);
			let student: { id: string; created: boolean } | null = cached ?? null;
			if (!student) {
				const resolved = await this.resolveOrCreateStudent(
					studentName,
					studentId,
					programId,
				);
				if (!resolved) {
					summary.skipped.push({
						row: rowIdx + 2,
						reason: "Could not resolve student.",
					});
					continue;
				}
				student = { id: resolved.id, created: resolved.created };
				studentCache.set(`${studentName}|${studentId ?? ""}`, student);
				if (student.created) summary.studentsCreated++;
			}

			for (const { code, idx } of cloColumns) {
				const raw = csvPercent(cells[idx]);
				if (raw === undefined) continue; // blank cell — leave untouched

				const clo = cloByCode.get(code);
				if (!clo) {
					summary.skipped.push({
						row: rowIdx + 2,
						reason: `CLO '${code}' not found for this section's course.`,
					});
					continue;
				}

				const existing = await prisma.cloAttainment.findUnique({
					where: {
						classSectionId_cloId_studentId_computationRunId: {
							classSectionId,
							cloId: clo.id,
							studentId: student.id,
							computationRunId: run.id,
						},
					},
					include: { atRiskFlags: { select: { id: true } } },
				});
				const edited = computeEditedAttainment(
					raw,
					existing?.indirectScorePct === null ||
						existing?.indirectScorePct === undefined
						? existing?.indirectScorePct
						: Number(existing.indirectScorePct),
				);

				let attainmentId: string;
				if (existing) {
					attainmentId = existing.id;
					summary.attainmentsUpdated++;
				} else {
					const created = await prisma.cloAttainment.create({
						data: {
							id: crypto.randomUUID(),
							classSectionId,
							cloId: clo.id,
							studentId: student.id,
							computationRunId: run.id,
							directScorePct: raw,
							compositeScorePct: edited.compositeScorePct,
							isBelowThreshold: edited.isBelowThreshold,
						},
						select: { id: true },
					});
					attainmentId = created.id;
					summary.attainmentsCreated++;
				}

				if (existing) {
					const reconcile = reconcileAtRisk(
						edited.isBelowThreshold,
						existing.atRiskFlags.length > 0,
					);
					if (reconcile.shouldPrune) {
						summary.flagsRemoved += (
							await prisma.atRiskFlag.deleteMany({
								where: { cloAttainmentId: attainmentId },
							})
						).count;
					}
					await prisma.cloAttainment.update({
						where: { id: attainmentId },
						data: {
							directScorePct: raw,
							compositeScorePct: edited.compositeScorePct,
							isBelowThreshold: edited.isBelowThreshold,
						},
					});
				}
				if (edited.isBelowThreshold) {
					const flagExists = existing ? existing.atRiskFlags.length > 0 : false;
					if (!flagExists) {
						await prisma.atRiskFlag.create({
							data: {
								id: crypto.randomUUID(),
								studentId: student.id,
								cloAttainmentId: attainmentId,
								reason: `Below institutional threshold on imported ${code}: ${edited.compositeScorePct.toFixed(1)}%`,
							},
						});
						summary.flagsCreated++;
					}
				}
			}
		}

		return summary;
	}

	/** Resolves the computation run for a class section (or verifies one). */
	private async resolveRun(
		classSectionId: string,
		computationRunId?: string,
	): Promise<{ id: string }> {
		if (computationRunId) {
			const run = await prisma.computationRun.findFirst({
				where: { id: computationRunId, scope: classSectionId },
				select: { id: true },
			});
			if (!run) {
				throw new ComputationRunNotFoundError(classSectionId);
			}
			return run;
		}

		const run = await prisma.computationRun.findFirst({
			where: { scope: classSectionId },
			orderBy: { runAt: "desc" },
			select: { id: true },
		});
		if (!run) {
			throw new ComputationRunNotFoundError(classSectionId);
		}
		return run;
	}

	/** Loads the section's course CLOs by code. */
	private async resolveClos(
		classSectionId: string,
		codes: string[],
	): Promise<Map<string, { id: string }>> {
		const section = await prisma.classSection.findUnique({
			where: { id: classSectionId },
			select: { courseId: true },
		});
		if (!section) return new Map();

		const clos = await prisma.clo.findMany({
			where: {
				courseId: section.courseId,
				code: { in: codes },
			},
			select: { id: true, code: true },
		});
		return new Map(clos.map((clo) => [clo.code.toUpperCase(), clo]));
	}

	/**
	 * Finds an existing student by student number or normalized name within the
	 * given program; creates one when neither matches. `programId: null` skips
	 * the program filter for name matching.
	 */
	private async resolveOrCreateStudent(
		studentName: string,
		studentId: string | null,
		programId: string | null,
	): Promise<{
		id: string;
		firstName: string;
		lastName: string;
		created: boolean;
	} | null> {
		const cleanStudentId = studentId?.trim() || null;
		if (cleanStudentId) {
			const existing = await prisma.student.findUnique({
				where: { studentNumber: cleanStudentId },
				select: { id: true, firstName: true, lastName: true },
			});
			if (existing) {
				return { ...existing, created: false };
			}
		}

		const { lastName, firstName } = parseStudentName(studentName);
		const normalizedRecordName = normalizeName(firstName + lastName);

		const potentialMatches = await prisma.student.findMany({
			where: {
				lastName: { contains: lastName, mode: "insensitive" },
				...(programId ? { programId } : {}),
			},
			select: { id: true, firstName: true, lastName: true },
		});
		for (const candidate of potentialMatches) {
			if (
				normalizeName(candidate.firstName + candidate.lastName) ===
				normalizedRecordName
			) {
				return { ...candidate, created: false };
			}
		}

		if (!programId) {
			throw new Error(
				`Cannot create student '${studentName}' without a program.`,
			);
		}

		const studentNumber =
			cleanStudentId ||
			`TBA-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

		let wasCreated = false;
		const student = await this.ensureRow(
			() =>
				prisma.student.findUnique({
					where: { studentNumber },
					select: { id: true, firstName: true, lastName: true },
				}),
			async () => {
				const res = await prisma.student.create({
					data: {
						id: crypto.randomUUID(),
						firstName,
						lastName,
						studentNumber,
						anonymizedId: crypto.randomUUID(),
						program: { connect: { id: programId } },
					},
					select: { id: true, firstName: true, lastName: true },
				});
				wasCreated = true;
				return res;
			},
		);
		return { ...student, created: wasCreated };
	}

	private async audit(
		userId: string,
		action: string,
		details: Record<string, unknown> | Prisma.InputJsonValue,
	): Promise<void> {
		await prisma.auditLog.create({
			data: {
				id: crypto.randomUUID(),
				userId,
				action,
				moduleAffected: "ingest",
				targetRecordId:
					typeof (details as Record<string, unknown>).classSectionId ===
					"string"
						? ((details as Record<string, unknown>).classSectionId as string)
						: null,
				details: details as Prisma.InputJsonValue,
			},
		});
	}

	/**
	 * Strictly resolves the academic chain from the selected ClassSection.
	 * Fails with ClassSectionNotFoundError if the section or its relationships do not exist.
	 * Never auto-creates missing sections.
	 */
	private async resolveAcademicChain(classSectionId: string): Promise<{
		programId: string;
		courseId: string;
		termId: string;
		academicContext: {
			sectionCode: string;
			course: {
				code: string;
				program: {
					code: string;
				};
			};
			term: {
				schoolYear: string;
				semester: string;
			};
		};
	}> {
		const existing = await prisma.classSection.findUnique({
			where: { id: classSectionId },
			select: {
				id: true,
				sectionCode: true,
				termId: true,
				courseId: true,
				course: {
					select: {
						id: true,
						code: true,
						programId: true,
						program: { select: { code: true } },
					},
				},
				term: {
					select: {
						schoolYear: true,
						semester: true,
					},
				},
			},
		});

		if (!existing || !existing.course?.programId) {
			throw new ClassSectionNotFoundError(classSectionId);
		}

		return {
			programId: existing.course.programId,
			courseId: existing.course.id,
			termId: existing.termId,
			academicContext: {
				sectionCode: existing.sectionCode,
				course: {
					code: existing.course.code,
					program: {
						code: existing.course.program.code,
					},
				},
				term: {
					schoolYear: existing.term.schoolYear,
					semester: existing.term.semester,
				},
			},
		};
	}

	/** Find-first-then-create with a duplicate-safe re-find on a create race. */
	private async ensureRow<T>(
		find: () => Promise<T | null>,
		create: () => Promise<T>,
	): Promise<T> {
		const existing = await find();
		if (existing) return existing;

		try {
			return await create();
		} catch (error) {
			const retried = await find();
			if (retried) return retried;
			throw error;
		}
	}
}

function asOptionalString(value: unknown): string | undefined {
	if (value === null || value === undefined) return undefined;
	const text = String(value).trim();
	return text || undefined;
}

/** Converts an ETL 0–1 fraction to a 0–100 percentage, or null when absent. */
function asNullablePct(value: number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	return Math.round(value * 10000) / 100;
}

function asSlug(value: string): string {
	return value
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 16);
}

/**
 * Human-readable text for `UploadRecord.error` — handles Error, the python
 * server's StructuredError (`{ error_type, message }`) and plain strings.
 * NOTE: without this the structured error stringifies to "[object Object]".
 */
function uploadErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	if (error && typeof error === "object") {
		const { error_type: errorType, message } = error as {
			error_type?: unknown;
			message?: unknown;
		};
		if (typeof message === "string" && message) return message;
		if (typeof errorType === "string" && errorType) return errorType;
	}
	return String(error);
}

export class IngestService {
	/**
	 * Starts the ETL process by uploading the file to the python-server.
	 * Does not wait for completion. Records the attempt in `UploadRecord` so
	 * the user's cross-device upload history includes it from the start.
	 * @returns The job ID for polling.
	 */
	async startUpload(
		file: File,
		filename: string,
		classSectionId: string,
		userId: string,
	): Promise<{ jobId: string }> {
		const section = await prisma.classSection.findUnique({
			where: { id: classSectionId },
			select: { id: true },
		});
		if (!section) {
			throw new ClassSectionNotFoundError(classSectionId);
		}

		const record = await prisma.uploadRecord.create({
			data: {
				userId,
				classSectionId,
				filename,
				status: "queued",
			},
		});

		try {
			const blob = new Blob([file]);
			const jobId = await ingestClient.upload(blob, filename);
			await prisma.uploadRecord.update({
				where: { id: record.id },
				data: { etlJobId: jobId },
			});
			return { jobId };
		} catch (error) {
			await this.markUploadFailed(record.id, error);
			throw error;
		}
	}

	/**
	 * `GET /ingest/clo-raw-data/submission` — newest `clo_raw_data` submission
	 * for a class section, or `null`. NOTE: any status is returned so the strip
	 * shows a submitted/approved record instead of prompting for a new draft;
	 * the lookup never creates a FormType (a read stays a read).
	 */
	async getSubmission(
		classSectionId: string,
	): Promise<{ formSubmissionId: string | null }> {
		const section = await prisma.classSection.findUnique({
			where: { id: classSectionId },
			select: { id: true },
		});
		if (!section) {
			throw new ClassSectionNotFoundError(classSectionId);
		}

		const formType = await prisma.formType.findUnique({
			where: { code: CLO_RAW_DATA_CODE },
			select: { id: true },
		});
		if (!formType) return { formSubmissionId: null };

		const existing = await prisma.formSubmission.findFirst({
			where: { formTypeId: formType.id, classSectionId },
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
		return { formSubmissionId: existing?.id ?? null };
	}

	/**
	 * `POST /ingest/clo-raw-data/init` — open (or reuse) the `clo_raw_data`
	 * draft for a class section; term/program resolved server-side so the
	 * client only picks the section. Reuses draft/returned/submitted, fresh
	 * draft after approved/archived — mirrors `atrisk.init`.
	 */
	async initSubmission(
		classSectionId: string,
		userId: string,
	): Promise<{ formSubmissionId: string }> {
		const section = await prisma.classSection.findUnique({
			where: { id: classSectionId },
			include: { course: { select: { programId: true } } },
		});
		if (!section) {
			throw new ClassSectionNotFoundError(classSectionId);
		}

		const formTypeId = await ensureCloRawDataType();
		const existing = await prisma.formSubmission.findFirst({
			where: {
				formTypeId,
				classSectionId,
				status: { in: [...EDITABLE_STATUSES, "submitted"] },
			},
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
		if (existing) return { formSubmissionId: existing.id };

		const created = await submissionService.create(
			{
				formTypeId,
				classSectionId,
				programId: section.course.programId,
				termId: section.termId,
				formData: {},
			},
			userId,
		);
		return { formSubmissionId: created.id };
	}

	/** Returns the upload history for a user, newest first. */
	async listHistory(userId: string) {
		return prisma.uploadRecord.findMany({
			where: { userId },
			orderBy: { createdAt: "desc" },
			include: {
				classSection: {
					select: {
						sectionCode: true,
						course: {
							select: { code: true, title: true },
						},
						term: {
							select: { schoolYear: true, semester: true },
						},
					},
				},
			},
		});
	}

	/** Marks the upload record for a python job as failed (if one exists). */
	private async markUploadFailed(
		recordId: string,
		error: unknown,
	): Promise<void> {
		const message = uploadErrorMessage(error);
		await prisma.uploadRecord.update({
			where: { id: recordId },
			data: { status: "failed", error: message },
		});
	}

	/** Finds the `UploadRecord` that started the given python ETL job, if any. */
	private async findRecordByJob(jobId: string) {
		return prisma.uploadRecord.findFirst({ where: { etlJobId: jobId } });
	}

	/** Validates the python result shape and returns the typed ETL payload. */
	private loadedOf(job: ETLJob): TypedEtlLoadedData {
		if (!job.result?.loaded || !Array.isArray(job.result.loaded.attainments)) {
			throw new MalformedEtlResultError(job.job_id);
		}
		return job.result.loaded as TypedEtlLoadedData;
	}

	/**
	 * Processes a completed ETL job, validates the result, and persists it.
	 * This is the core logic that should only run once per job.
	 */
	private async processAndPersistJob(
		job: ETLJob,
		classSectionId: string,
		triggeredByUserId?: string,
	) {
		const loadedData = this.loadedOf(job);

		const persistenceSummary = await attainmentService.persistAttainment(
			loadedData,
			classSectionId,
			triggeredByUserId,
		);

		return {
			status: "completed" as const,
			etl: job.result,
			persistence: persistenceSummary,
			verification: persistenceSummary.verification,
		};
	}

	/** Maps a preview/persistence error onto a cached `failed` result. */
	private async failJob(
		jobId: string,
		record: UploadRecord | null,
		error: unknown,
	) {
		console.error(`[Ingest] Job ${jobId} failed:`, error);

		let errorObj: {
			error_type: string;
			message: string;
			verification?: SectionComparisonResult;
		};

		if (error instanceof SectionMismatchError) {
			errorObj = {
				error_type: "SectionMismatchError",
				message: error.message,
				verification: error.verification,
			};
		} else if (error instanceof MalformedEtlResultError) {
			errorObj = {
				error_type: error.name,
				message: error.message,
			};
		} else {
			errorObj = {
				error_type: "PersistenceFailed",
				message: (error as Error).message,
			};
		}

		const result = { status: "failed" as const, error: errorObj };
		jobCompletionCache.set(jobId, result);

		if (record) {
			await this.markUploadFailed(record.id, errorObj.message);
		}

		return result;
	}

	/** Persists a completed job once and records the result on its history row. */
	private async commitJob(
		jobId: string,
		job: ETLJob,
		record: UploadRecord | null,
		classSectionId: string,
		triggeredByUserId?: string,
	) {
		// NOTE: second guard — `ingestClient.getJob` awaited above lets two
		// concurrent saves through the one in `resolveJob`.
		if (inFlightJobs.has(jobId)) {
			return { status: "running" as const };
		}
		inFlightJobs.add(jobId);

		try {
			const result = await this.processAndPersistJob(
				job,
				classSectionId,
				triggeredByUserId,
			);
			jobCompletionCache.set(jobId, result);

			if (record && result.status === "completed") {
				await prisma.uploadRecord.update({
					where: { id: record.id },
					data: {
						status: "completed",
						computationRunId: result.persistence.computationRunId,
						summary: result.persistence as unknown as Prisma.InputJsonValue,
					},
				});
			}

			return result;
		} catch (error) {
			return this.failJob(jobId, record, error);
		} finally {
			inFlightJobs.delete(jobId);
		}
	}

	/**
	 * Shared job resolution for the status poll and the save call: section
	 * binding → cached replay → `UploadRecord` replay → python poll. With
	 * `commit: false` a finished job answers `ready` + a preview and writes
	 * nothing; `commit: true` runs the (idempotent) persistence step.
	 */
	private async resolveJob(
		jobId: string,
		queryClassSectionId: string | undefined,
		opts: { commit: boolean; userId?: string },
	) {
		// 1. Look up the authoritative upload record to verify section binding.
		// NOTE: this must run BEFORE the jobCompletionCache read below — otherwise
		// a poll for a completed job with the wrong classSectionId would return the
		// cached 200 instead of a SectionBindingMismatchError (400).
		const record = await this.findRecordByJob(jobId);
		const boundClassSectionId = record?.classSectionId;

		// If query specifies a classSectionId and it doesn't match the bound section, reject immediately
		if (
			boundClassSectionId &&
			queryClassSectionId &&
			queryClassSectionId !== boundClassSectionId
		) {
			throw new SectionBindingMismatchError(
				queryClassSectionId,
				boundClassSectionId,
			);
		}

		const cached = jobCompletionCache.get(jobId);
		// NOTE: a `ready` entry is only a preview — a save must still persist it.
		if (cached && (cached.status !== "ready" || !opts.commit)) return cached;

		const targetClassSectionId = boundClassSectionId ?? queryClassSectionId;
		if (!targetClassSectionId) {
			throw new Error("No classSectionId bound to job or provided in query");
		}

		// If already completed or failed in UploadRecord, return the recorded result idempotently
		if (record?.status === "completed" && record.summary) {
			const persistedSummary = record.summary as unknown as PersistenceSummary;
			const result = {
				status: "completed" as const,
				persistence: persistedSummary,
				verification: persistedSummary.verification,
			};
			jobCompletionCache.set(jobId, result);
			return result;
		}

		if (record?.status === "failed") {
			const result = {
				status: "failed" as const,
				error: {
					error_type: "UploadFailed",
					message: record.error ?? "Upload job previously marked as failed",
				},
			};
			jobCompletionCache.set(jobId, result);
			return result;
		}

		// Return running if persistence is currently in-flight to prevent duplicate execution from polling
		if (inFlightJobs.has(jobId)) {
			return { status: "running" as const };
		}

		// NOTE: a save can commit straight from the previewed payload when the
		// python job is no longer reachable (e.g. Redis flushed).
		const ready = cached?.status === "ready" ? cached : null;
		const job: ETLJob = ready?.etl
			? { job_id: jobId, status: "completed", result: ready.etl }
			: await ingestClient.getJob(jobId);

		if (job.status === "running" || job.status === "queued") {
			return { status: job.status };
		}

		if (job.status === "failed") {
			const result = { status: "failed" as const, error: job.error };
			jobCompletionCache.set(jobId, result);

			if (record) {
				await this.markUploadFailed(record.id, job.error ?? job.status);
			}

			return result;
		}

		if (job.status === "completed") {
			if (opts.commit) {
				return this.commitJob(
					jobId,
					job,
					record,
					targetClassSectionId,
					opts.userId,
				);
			}

			// Preview only: nothing is written until the user saves.
			try {
				const preview = await attainmentService.buildPreview(
					this.loadedOf(job),
					targetClassSectionId,
				);
				const result = { status: "ready" as const, etl: job.result, preview };
				jobCompletionCache.set(jobId, result);
				return result;
			} catch (error) {
				return this.failJob(jobId, record, error);
			}
		}

		// Should not be reached
		return { status: "unknown", error: "Unknown job status" };
	}

	/**
	 * `GET /ingest/upload/:jobId/status` — polls the job. A finished job answers
	 * `ready` with a preview; nothing is written until `saveJob` runs.
	 */
	async getJobStatus(
		jobId: string,
		queryClassSectionId?: string,
		triggeredByUserId?: string,
	) {
		return this.resolveJob(jobId, queryClassSectionId, {
			commit: false,
			userId: triggeredByUserId,
		});
	}

	/**
	 * `POST /ingest/upload/:jobId/save` — persists a reviewed job and marks the
	 * matching `UploadRecord` `completed` (or `failed` when persistence throws).
	 * Idempotent: a repeated save replays the stored summary.
	 */
	async saveJob(
		jobId: string,
		queryClassSectionId?: string,
		triggeredByUserId?: string,
	) {
		return this.resolveJob(jobId, queryClassSectionId, {
			commit: true,
			userId: triggeredByUserId,
		});
	}

	/**
	 * `POST /ingest/upload/:jobId/discard` — the user chose to re-upload instead
	 * of saving; only the history row changes (the attainment tables were never
	 * touched for a `queued` record).
	 */
	async discardJob(
		jobId: string,
		queryClassSectionId?: string,
	): Promise<{ status: "discarded" }> {
		const record = await this.findRecordByJob(jobId);
		const boundClassSectionId = record?.classSectionId;

		if (
			boundClassSectionId &&
			queryClassSectionId &&
			queryClassSectionId !== boundClassSectionId
		) {
			throw new SectionBindingMismatchError(
				queryClassSectionId,
				boundClassSectionId,
			);
		}

		// NOTE: an already-saved record stays `completed` — discard only clears
		// uploads that never persisted.
		if (record && record.status === "queued") {
			await prisma.uploadRecord.update({
				where: { id: record.id },
				data: { status: "discarded" },
			});
		}

		return { status: "discarded" };
	}
}

export const attainmentService = new AttainmentService();
export const ingestService = new IngestService();

// --- Submit gate ---------------------------------------------------------------

/**
 * NOTE: a `clo_raw_data` submission for a section with no captured scores has
 * nothing to assess — block it before the approval chain starts (same idea as
 * the `action_taken` gate).
 */
registerSubmitGate(CLO_RAW_DATA_CODE, async (submission) => {
	if (!submission.classSectionId) {
		throw new SubmitGateError(
			CLO_RAW_DATA_CODE,
			"Per-Student CLO Raw Data blocked: the submission is not bound to a class section.",
		);
	}
	const count = await prisma.cloAttainment.count({
		where: { classSectionId: submission.classSectionId },
	});
	if (count === 0) {
		throw new SubmitGateError(
			CLO_RAW_DATA_CODE,
			"Per-Student CLO Raw Data blocked: upload a class record for this section first.",
		);
	}
});
