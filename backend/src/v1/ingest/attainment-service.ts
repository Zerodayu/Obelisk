import { prisma } from "@lib/prisma";
import { randomUUID } from "crypto";
import type { EtlLoadedData } from "@lib/ingest/ingest-client";

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
	cloMatchFailures: { cloCode: string; studentName: string; reason: string }[];
}

// Helper to normalize names for matching
const normalizeName = (name: string) =>
	name.toLowerCase().replace(/[^a-z0-9]/g, "");

// Helper to parse student name into last and first names
function parseStudentName(name: string): { lastName: string; firstName: string } {
	if (name.includes(",")) {
		const [lastName, firstName] = name.split(",").map((s) => s.trim());
		return { lastName, firstName: firstName || "" };
	}
	const parts = name.split(" ").filter((p) => p);
	const lastName = parts.pop() || "";
	const firstName = parts.join(" ");
	return { lastName, firstName };
}

export const attainmentService = {
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

		const commonComputationData = {
			id: randomUUID(), // Provide the ID
			scope: classSectionId,
			formulaVersion: "70_30_v1",
			directWeight: 0.7,
			indirectWeight: 0.3,
		};

		const computationRun = await prisma.computationRun.create({
			data: triggeredByUserId
				? { ...commonComputationData, triggeredByUserId }
				: commonComputationData,
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
						id: randomUUID(), // Provide the ID
						firstName,
						lastName,
						studentNumber:
							record.student_id ||
							`TBA-${Date.now()}-${Math.random()
								.toString(36)
								.substring(2, 7)}`,
						anonymizedId: randomUUID(),
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
			if (cloCache.has(record.clo_code)) {
				clo = cloCache.get(record.clo_code)!;
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
			await prisma.cloAttainment.create({
				data: {
					id: randomUUID(), // Provide the ID
					directScorePct: directScore,
					indirectScorePct: null,
					compositeScorePct: directScore,
					isBelowThreshold: !record.met_threshold,
					classSectionId: classSectionId,
					cloId: clo.id,
					studentId: student.id,
					computationRunId: computationRun.id,
				},
			});
			summary.cloAttainmentsCreated++;
		}

		return summary;
	},
};