import type { ETLJob, EtlLoadedData } from "@lib/ingest/ingest-client";
import { ingestClient } from "@lib/ingest/ingest-client";
import { normalizeName, parseStudentName } from "@lib/ingest/name-utils";
import { prisma } from "@lib/prisma";

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

export interface PersistenceSummary {
	computationRunId: string;
	studentsProcessed: number;
	studentsCreated: number;
	cloAttainmentsCreated: number;
	atRiskFlagsCreated: number;
	cloMatchFailures: { cloCode: string; studentName: string; reason: string }[];
}

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

			let student: { id: string } | null = null;
			if (record.student_id) {
				student = await prisma.student.findUnique({
					where: { studentNumber: record.student_id },
					select: { id: true },
				});
			}

			if (!student) {
				const { lastName, firstName } = parseStudentName(record.student_name);
				const normalizedRecordName = normalizeName(firstName + lastName);

				const potentialMatches = await prisma.student.findMany({
					where: {
						lastName: { contains: lastName, mode: "insensitive" },
						programId: programId,
					},
					select: { id: true, firstName: true, lastName: true },
				});

				for (const pStudent of potentialMatches) {
					const normalizedDbName = normalizeName(
						pStudent.firstName + pStudent.lastName,
					);
					if (normalizedDbName === normalizedRecordName) {
						student = { id: pStudent.id };
						break;
					}
				}
			}

			if (!student) {
				const { lastName, firstName } = parseStudentName(record.student_name);
				const newStudent = await prisma.student.create({
					data: {
						id: crypto.randomUUID(),
						firstName,
						lastName,
						studentNumber:
							record.student_id ||
							`TBA-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
						anonymizedId: crypto.randomUUID(),
						program: {
							connect: { id: programId },
						},
					},
					select: { id: true },
				});
				student = newStudent;
				summary.studentsCreated++;
				console.log(
					`Created new student: ${firstName} ${lastName} (ID: ${student.id}) from record name "${record.student_name}"`,
				);
			}

			if (!student) {
				console.warn(
					`[Critical] Failed to find or create a student for record: ${record.student_name}. This record will be skipped.`,
				);
				continue;
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
	 * Does not wait for completion.
	 * @returns The job ID for polling.
	 */
	async startUpload(file: File, filename: string): Promise<{ jobId: string }> {
		const blob = new Blob([file]);
		const jobId = await ingestClient.upload(blob, filename);
		return { jobId };
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
	 * Caches results to ensure idempotency.
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
				return result;
			}
		}

		// Should not be reached
		return { status: "unknown", error: "Unknown job status" };
	}
}

export const attainmentService = new AttainmentService();
export const ingestService = new IngestService();
