import type { EtlLoadedData, ETLJob } from "@lib/ingest/ingest-client";
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

		const classSection = await prisma.classSection.findUnique({
			where: { id: classSectionId },
			select: {
				course: {
					select: {
						id: true,
						programId: true,
					},
				},
			},
		});

		if (!classSection?.course?.programId) {
			throw new Error(
				`ClassSection with id ${classSectionId} not found, or its course is not linked to a Program.`,
			);
		}
		const courseId = classSection.course.id;
		const programId = classSection.course.programId;

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
		if (
			!job.result?.loaded ||
			!Array.isArray(job.result.loaded.attainments)
		) {
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
		if (jobCompletionCache.has(jobId)) {
			return jobCompletionCache.get(jobId)!;
		}

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
				const result = {
					status: "failed" as const,
					error:
						error instanceof MalformedEtlResultError
							? { error_type: error.name, message: error.message }
							: { error_type: "PersistenceFailed", message: (error as Error).message },
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