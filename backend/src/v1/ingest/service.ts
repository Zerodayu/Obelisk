import { csvPercent, parseCsv } from "@lib/ingest/csv";
import type { ETLJob, EtlLoadedData } from "@lib/ingest/ingest-client";
import { ingestClient } from "@lib/ingest/ingest-client";
import { normalizeName, parseStudentName } from "@lib/ingest/name-utils";
import {
	computeEditedAttainment,
	reconcileAtRisk,
} from "@lib/ingest/score-edit";
import { prisma } from "@lib/prisma";
import type { Prisma } from "@prisma/generated/prisma/client";

// --- In-memory Cache for Idempotency ---
// This ensures that even if the client polls a completed job multiple times,
// the persistence logic only runs once. The result is cached and returned on
// subsequent requests.
const jobCompletionCache = new Map<
	string,
	| { status: "completed"; persistence: PersistenceSummary; etl: unknown }
	| { status: "failed"; error: unknown }
>();

// --- Interfaces (assuming these might be moved to a model file later) ---

export interface AttainmentRecord {
	student_name: string;
	student_id: string | null;
	clo_code: string;
	direct_clo_attainment_pct: number;
	met_threshold: boolean;
}

export interface TypedEtlLoadedData extends EtlLoadedData {
	attainments: AttainmentRecord[];
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
};

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

// --- Custom Error ---

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
		const summary: PersistenceSummary = {
			computationRunId: "",
			studentsProcessed: 0,
			studentsCreated: 0,
			cloAttainmentsCreated: 0,
			atRiskFlagsCreated: 0,
			cloMatchFailures: [],
		};

		const { programId, courseId } = await this.ensureAcademicChain(
			classSectionId,
			etlLoadedData,
		);

		const computationRun = await prisma.computationRun.create({
			data: {
				id: crypto.randomUUID(),
				scope: classSectionId,
				formulaVersion: "70_30_v1",
				directWeight: 0.7,
				indirectWeight: 0.3,
				...(triggeredByUserId ? { triggeredByUserId } : {}),
			},
		});
		summary.computationRunId = computationRun.id;

		const cloCache = new Map<string, { id: string } | null>();

		for (const record of etlLoadedData.attainments) {
			summary.studentsProcessed++;

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
			const student = { id: resolved.id };

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
			const isBelowThreshold = !record.met_threshold;

			const newAttainment = await prisma.cloAttainment.create({
				data: {
					id: crypto.randomUUID(),
					directScorePct: directScore,
					indirectScorePct: null,
					compositeScorePct: directScore,
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
			select: { id: true },
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

			const edited = computeEditedAttainment(update.directScorePct);
			const attainment = await prisma.cloAttainment.update({
				where: { id: update.attainmentId },
				data: {
					directScorePct: edited.compositeScorePct,
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

				const edited = computeEditedAttainment(raw);
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
							directScorePct: edited.compositeScorePct,
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
							directScorePct: edited.compositeScorePct,
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
		if (studentId) {
			const existing = await prisma.student.findUnique({
				where: { studentNumber: studentId },
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

		const created = await prisma.student.create({
			data: {
				id: crypto.randomUUID(),
				firstName,
				lastName,
				studentNumber:
					studentId ||
					`TBA-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
				anonymizedId: crypto.randomUUID(),
				program: { connect: { id: programId } },
			},
			select: { id: true, firstName: true, lastName: true },
		});
		return { ...created, created: true };
	}

	private async audit(
		userId: string,
		action: string,
		details: Record<string, unknown>,
	): Promise<void> {
		await prisma.auditLog.create({
			data: {
				id: crypto.randomUUID(),
				userId,
				action,
				moduleAffected: "ingest",
				targetRecordId:
					typeof details.classSectionId === "string"
						? details.classSectionId
						: null,
				details: details as Prisma.InputJsonValue,
			},
		});
	}

	/**
	 * Ensures the academic records required for persistence exist for the given
	 * class section, creating (and reusing) them when they are missing — e.g. on
	 * a fresh database where the seed has not been run. All records are derived
	 * deterministically from the uploaded workbook so repeat uploads are
	 * idempotent.
	 */
	private async ensureAcademicChain(
		classSectionId: string,
		etlLoadedData: TypedEtlLoadedData,
	): Promise<{ programId: string; courseId: string; termId: string }> {
		const existing = await prisma.classSection.findUnique({
			where: { id: classSectionId },
			select: {
				termId: true,
				course: {
					select: { id: true, programId: true },
				},
			},
		});

		if (existing?.course?.programId) {
			return {
				programId: existing.course.programId,
				courseId: existing.course.id,
				termId: existing.termId,
			};
		}

		const header = (etlLoadedData.header ?? {}) as ImportedHeader;
		const courseCode = asOptionalString(header.course_code) ?? "IMPORTED";
		const courseTitle =
			asOptionalString(header.course_title) ?? "Imported Course";
		const sectionCode = asOptionalString(header.section) ?? "A";

		const programCode = `AUTO-${asSlug(courseCode)}`;
		const departmentCode = `DEPT-${asSlug(courseCode)}`;

		const semesterYearRaw = asOptionalString(header.semester_year);
		let schoolYear: string;
		let semester: string;
		if (semesterYearRaw) {
			const syMatch = semesterYearRaw.match(/(\d{4})\s*[-–&]?\s*(\d{4})/);
			if (syMatch) {
				schoolYear = `${syMatch[1]}-${syMatch[2]}`;
				semester = semesterYearRaw.replace(syMatch[0], "").trim() || "Term 1";
			} else {
				const year = new Date().getFullYear();
				schoolYear = `${year}-${year + 1}`;
				semester = semesterYearRaw;
			}
		} else {
			const year = new Date().getFullYear();
			schoolYear = `${year}-${year + 1}`;
			semester = "Term 1";
		}

		const department = await this.ensureRow(
			() => prisma.department.findUnique({ where: { code: departmentCode } }),
			() =>
				prisma.department.create({
					data: {
						id: crypto.randomUUID(),
						name: `Auto-imported (${departmentCode})`,
						code: departmentCode,
					},
				}),
		);

		const program = await this.ensureRow(
			() => prisma.program.findUnique({ where: { code: programCode } }),
			() =>
				prisma.program.create({
					data: {
						id: crypto.randomUUID(),
						name: `Auto-imported program for ${courseCode}`,
						code: programCode,
						departmentId: department.id,
					},
				}),
		);

		const term = await this.ensureRow(
			() =>
				prisma.academicTerm.findUnique({
					where: { schoolYear_semester: { schoolYear, semester } },
				}),
			() =>
				prisma.academicTerm.create({
					data: {
						id: crypto.randomUUID(),
						schoolYear,
						semester,
						isActive: true,
					},
				}),
		);

		const course = await this.ensureRow(
			() =>
				prisma.course.findFirst({
					where: { programId: program.id, code: courseCode },
				}),
			() =>
				prisma.course.create({
					data: {
						id: crypto.randomUUID(),
						programId: program.id,
						code: courseCode,
						title: courseTitle,
					},
				}),
		);

		const classSection = await this.ensureRow(
			() => prisma.classSection.findUnique({ where: { id: classSectionId } }),
			() =>
				prisma.classSection.create({
					data: {
						id: classSectionId,
						courseId: course.id,
						termId: term.id,
						sectionCode,
					},
				}),
		);

		await this.ensureClosAndPlos(course.id, program.id, etlLoadedData);

		console.log(
			`[Bootstrap] Auto-created academic chain for class section ${classSectionId}: department=${department.code}, program=${program.code}, term=${term.schoolYear} ${term.semester}, course=${course.code}, section=${classSection.sectionCode}`,
		);

		return {
			programId: program.id,
			courseId: course.id,
			termId: term.id,
		};
	}

	/** Creates any CLOs/PLOs referenced by the workbook (plus the CLO-PLO map). */
	private async ensureClosAndPlos(
		courseId: string,
		programId: string,
		etlLoadedData: TypedEtlLoadedData,
	): Promise<void> {
		const cloCodes = new Set<string>();
		for (const record of etlLoadedData.attainments) {
			if (record.clo_code) cloCodes.add(record.clo_code);
		}

		const mapping = Array.isArray(etlLoadedData.clo_plo_mapping)
			? (etlLoadedData.clo_plo_mapping as CloPloMappingEntry[])
			: [];
		for (const entry of mapping) {
			if (entry.clo_code) cloCodes.add(entry.clo_code);
		}

		const cloByCode = new Map<string, string>();
		for (const code of cloCodes) {
			const clo = await this.ensureRow(
				() => prisma.clo.findFirst({ where: { courseId, code } }),
				() =>
					prisma.clo.create({
						data: {
							id: crypto.randomUUID(),
							courseId,
							code,
							description: `CLO ${code} (auto-imported)`,
						},
					}),
			);
			cloByCode.set(code, clo.id);
		}

		const ploByCode = new Map<string, string>();
		for (const entry of mapping) {
			const ploCode = entry.plo_code;
			if (!ploCode) continue;

			if (!ploByCode.has(ploCode)) {
				const plo = await this.ensureRow(
					() =>
						prisma.plo.findFirst({
							where: { programId, code: ploCode },
						}),
					() =>
						prisma.plo.create({
							data: {
								id: crypto.randomUUID(),
								programId,
								code: ploCode,
								description: `PLO ${ploCode} (auto-imported)`,
							},
						}),
				);
				ploByCode.set(ploCode, plo.id);
			}

			const cloCode = entry.clo_code;
			if (!cloCode) continue;

			const cloId = cloByCode.get(cloCode);
			const ploId = ploByCode.get(ploCode);
			if (!cloId || !ploId) continue;

			await this.ensureRow(
				() =>
					prisma.cloToPloMap.findFirst({
						where: { cloId, ploId },
					}),
				() =>
					prisma.cloToPloMap.create({
						data: {
							id: crypto.randomUUID(),
							cloId,
							ploId,
							weight: (entry.correlation_strength ?? 1) / 100,
						},
					}),
			);
		}
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

function asSlug(value: string): string {
	return value
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 16);
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
		const message = error instanceof Error ? error.message : String(error);
		await prisma.uploadRecord.update({
			where: { id: recordId },
			data: { status: "failed", error: message },
		});
	}

	/** Finds the `UploadRecord` that started the given python ETL job, if any. */
	private async findRecordByJob(jobId: string) {
		return prisma.uploadRecord.findFirst({ where: { etlJobId: jobId } });
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
		if (!job.result?.loaded || !Array.isArray(job.result.loaded.attainments)) {
			throw new MalformedEtlResultError(job.job_id);
		}

		const loadedData = job.result.loaded as TypedEtlLoadedData;

		const persistenceSummary = await attainmentService.persistAttainment(
			loadedData,
			classSectionId,
			triggeredByUserId,
		);

		return {
			status: "completed" as const,
			etl: job.result,
			persistence: persistenceSummary,
		};
	}

	/**
	 * Checks the status of a job, and if complete, triggers the persistence step.
	 * Caches results to ensure idempotency. The matching `UploadRecord` is
	 * updated to `completed`/`failed` so the user's history stays accurate.
	 */
	async getJobStatus(
		jobId: string,
		classSectionId: string,
		triggeredByUserId?: string,
	) {
		// 1. Check if the job result is already in our cache.
		const cached = jobCompletionCache.get(jobId);
		if (cached) return cached;

		// 2. If not cached, get the current job status from python-server.
		const job = await ingestClient.getJob(jobId);

		if (job.status === "running" || job.status === "queued") {
			return { status: job.status };
		}

		if (job.status === "failed") {
			const result = { status: "failed" as const, error: job.error };
			jobCompletionCache.set(jobId, result); // Cache the failure

			const record = await this.findRecordByJob(jobId);
			if (record) {
				await this.markUploadFailed(record.id, job.error ?? job.status);
			}

			return result;
		}

		if (job.status === "completed") {
			try {
				const result = await this.processAndPersistJob(
					job,
					classSectionId,
					triggeredByUserId,
				);
				jobCompletionCache.set(jobId, result); // Cache the success

				const record = await this.findRecordByJob(jobId);
				if (record && result.status === "completed") {
					await prisma.uploadRecord.update({
						where: { id: record.id },
						data: {
							status: "completed",
							computationRunId: result.persistence.computationRunId,
							summary: result.persistence,
						},
					});
				}

				return result;
			} catch (error) {
				console.error(`[Ingest] Persistence failed for job ${jobId}:`, error);
				const result = {
					status: "failed" as const,
					error:
						error instanceof MalformedEtlResultError
							? { error_type: error.name, message: error.message }
							: {
									error_type: "PersistenceFailed",
									message: (error as Error).message,
								},
				};
				jobCompletionCache.set(jobId, result); // Cache the failure

				const record = await this.findRecordByJob(jobId);
				if (record) {
					await this.markUploadFailed(record.id, error);
				}

				return result;
			}
		}

		// Should not be reached
		return { status: "unknown", error: "Unknown job status" };
	}
}

export const attainmentService = new AttainmentService();
export const ingestService = new IngestService();
