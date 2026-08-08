import type { EtlLoadedData } from "@lib/ingest/ingest-client";
import { ingestClient } from "@lib/ingest/ingest-client";
import { normalizeName, parseStudentName } from "@lib/ingest/name-utils";
import { prisma } from "@lib/prisma";

// The `EtlLoadedData` from the client is already well-typed, but we can
// create a more specific version for this service's known `attainments` shape.
export interface AttainmentRecord {
	student_name: string;
	student_id: string | null;
	clo_code: string;
	direct_clo_attainment_pct: number;
	met_threshold: boolean;
	// other fields from python are ignored as per instructions
}

export interface TypedEtlLoadedData extends EtlLoadedData {
	attainments: AttainmentRecord[];
}

// Summary object to be returned
export interface PersistenceSummary {
	computationRunId: string;
	studentsProcessed: number;
	studentsCreated: number;
	cloAttainmentsCreated: number;
	atRiskFlagsCreated: number;
	cloMatchFailures: { cloCode: string; studentName: string; reason: string }[];
}

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

			// 1. Find or create student
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
						programId: programId, // Match within the same program
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
							connect: { id: programId }, // Connect to the program
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

			// 2. Find CLO, using a cache for performance
			let clo: { id: string } | null;
			const cachedClo = cloCache.get(record.clo_code);
			if (cachedClo !== undefined) {
				clo = cachedClo;
			} else {
				// Use findFirst with a composite where clause
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

			// 3. Insert CloAttainment
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

			// 4. If below threshold, create an AtRiskFlag
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
	async uploadAndPersist(
		file: File,
		filename: string,
		classSectionId: string,
		triggeredByUserId?: string,
	): Promise<{ etl: unknown; persistence: PersistenceSummary }> {
		const blob = new Blob([file]);
		const etlResult = await ingestClient.ingest(blob, filename);

		// Runtime validation of the nested structure
		if (
			!etlResult.result?.loaded ||
			!Array.isArray(etlResult.result.loaded.attainments)
		) {
			throw new MalformedEtlResultError(etlResult.job_id);
		}

		// The type assertion is safe due to the runtime check above
		const loadedData = etlResult.result.loaded as TypedEtlLoadedData;

		const persistenceSummary = await attainmentService.persistAttainment(
			loadedData,
			classSectionId,
			triggeredByUserId,
		);

		return {
			etl: etlResult.result,
			persistence: persistenceSummary,
		};
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

export const attainmentService = new AttainmentService();
export const ingestService = new IngestService();
