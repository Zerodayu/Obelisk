import { describe, expect, it } from "bun:test";
import type {
	AnalyticsSubmissionsPayload,
	InstitutionalSummaryResponse,
} from "@lib/ingest/ingest-client";
import { prisma } from "@lib/prisma";
import { isDbReachable } from "@test/helpers/db-gate";
import {
	AiNoDataError,
	AiRecommendationService,
	AiTermNotFoundError,
	type InstitutionalSummaryFetcher,
} from "@v1/ai/service";
import { attainmentService } from "@v1/ingest/service";

const db = await isDbReachable();

const IDS = {
	department: "it-ai-dept",
	program: "it-ai-prog",
	programName: "Integration AI Program",
	// Older term WITH persisted class records.
	term: "it-ai-term",
	// Newer term WITH a section but no class records — must be walked past.
	emptyTerm: "it-ai-term-empty",
	course: "it-ai-course",
	section: "it-ai-section",
	emptySection: "it-ai-empty-section",
};

function stubFetcher(): {
	fetcher: InstitutionalSummaryFetcher;
	seen: AnalyticsSubmissionsPayload[];
} {
	const seen: AnalyticsSubmissionsPayload[] = [];
	const fetcher: InstitutionalSummaryFetcher = async (payload) => {
		seen.push(payload);
		const response: InstitutionalSummaryResponse = {
			status: "ok",
			summary: {
				period: payload.period,
				department_summary: {},
				program_summary: {},
				avp_group_summary: {},
				worst_performing_clos: [
					{
						group_name: "Program",
						key: IDS.programName,
						clo_code: "CLO2",
						mean_attainment_pct: 0.525,
						record_count: 4,
					},
				],
			},
			prompt_used: "institution-wide prompt",
			recommendation: "## Summary\nEscalate the CLO2 gap.",
		};
		return response;
	};
	return { fetcher, seen };
}

function classRecord() {
	return {
		header: {
			course_code: "AI-101",
			section: "A1",
			course_type: "lecture",
			semester_year: "2092-2093 1st",
			no_of_students: 2,
			threshold: 0.7,
		},
		clo_plo_mapping: [
			{ clo_code: "CLO1", plo_code: "PLO1", correlation_strength: 3 },
		],
		attainments: [
			{
				student_name: "Cruz, Juan",
				student_id: "IT-AI-0001",
				clo_code: "CLO1",
				direct_clo_attainment_pct: 0.85,
				met_threshold: true,
				exam_pct: 0.8,
			},
			{
				student_name: "Dela Peña, Maria",
				student_id: "IT-AI-0002",
				clo_code: "CLO2",
				direct_clo_attainment_pct: 0.45,
				met_threshold: false,
				output_pct: 0.45,
			},
		],
	};
}

describe.skipIf(!db)("AI recommendation generation (integration)", () => {
	async function resetAiData() {
		await prisma.aiRecommendation.deleteMany({
			where: { termId: { in: [IDS.term, IDS.emptyTerm] } },
		});
		await prisma.atRiskFlag.deleteMany({
			where: { student: { programId: IDS.program } },
		});
		await prisma.cloAttainment.deleteMany({
			where: { classSectionId: { in: [IDS.section, IDS.emptySection] } },
		});
		await prisma.computationRun.deleteMany({
			where: { scope: { in: [IDS.section, IDS.emptySection] } },
		});
		await prisma.student.deleteMany({ where: { programId: IDS.program } });
		await prisma.clo.deleteMany({ where: { courseId: IDS.course } });
		await prisma.classSection.deleteMany({
			where: { id: { in: [IDS.section, IDS.emptySection] } },
		});
		await prisma.course.deleteMany({ where: { programId: IDS.program } });
		await prisma.academicTerm.deleteMany({
			where: { id: { in: [IDS.term, IDS.emptyTerm] } },
		});
		await prisma.program.deleteMany({ where: { id: IDS.program } });
		await prisma.department.deleteMany({ where: { id: IDS.department } });
	}

	async function seed() {
		await prisma.department.create({
			data: { id: IDS.department, name: "Integration AI Dept", code: "IT-AI" },
		});
		await prisma.program.create({
			data: {
				id: IDS.program,
				departmentId: IDS.department,
				name: IDS.programName,
				code: "IT-AI-PROG",
			},
		});
		await prisma.academicTerm.create({
			data: {
				id: IDS.term,
				schoolYear: "2092-2093",
				semester: "1st",
				isActive: false,
				startDate: new Date("2092-06-01"),
			},
		});
		await prisma.academicTerm.create({
			data: {
				id: IDS.emptyTerm,
				schoolYear: "2093-2094",
				semester: "1st",
				isActive: true,
				startDate: new Date("2093-06-01"),
			},
		});
		await prisma.course.create({
			data: {
				id: IDS.course,
				programId: IDS.program,
				code: "AI-101",
				title: "AI Test Course",
			},
		});
		await prisma.classSection.create({
			data: {
				id: IDS.section,
				courseId: IDS.course,
				termId: IDS.term,
				sectionCode: "A1",
			},
		});
		await prisma.classSection.create({
			data: {
				id: IDS.emptySection,
				courseId: IDS.course,
				termId: IDS.emptyTerm,
				sectionCode: "B1",
			},
		});
		await prisma.clo.create({
			data: {
				id: "it-ai-clo-1",
				courseId: IDS.course,
				code: "CLO1",
				description: "AI CLO 1",
			},
		});
		await prisma.clo.create({
			data: {
				id: "it-ai-clo-2",
				courseId: IDS.course,
				code: "CLO2",
				description: "AI CLO 2",
			},
		});
	}

	it("generates and persists a recommendation from stored snapshots", async () => {
		await resetAiData();
		await seed();
		const { fetcher, seen } = stubFetcher();
		const service = new AiRecommendationService(fetcher);
		try {
			await attainmentService.persistAttainment(classRecord(), IDS.section);

			const payload = await service.generate();

			// The newest term has no class records — the walk must land on the
			// older term that does, and the payload must be org-enriched.
			expect(seen).toHaveLength(1);
			expect(seen[0].period.label).toBe("2092-2093 1st");
			expect(seen[0].submissions).toHaveLength(1);
			const submission = seen[0].submissions[0];
			expect(submission.department).toBe("Integration AI Dept");
			expect(submission.program).toBe(IDS.programName);
			expect(submission.course_code).toBe("AI-101");
			expect(submission.section).toBe("A1");
			expect(submission.attainments.length).toBeGreaterThan(0);

			expect(payload.status).toBe("pending_review");
			expect(payload.period?.label).toBe("2092-2093 1st");
			expect(payload.term?.schoolYear).toBe("2092-2093");
			expect(payload.recommendationText).toContain("CLO2 gap");
			expect(payload.worstPerformingClos[0]).toMatchObject({
				groupName: "Program",
				key: IDS.programName,
				cloCode: "CLO2",
				meanAttainmentPct: 52.5,
				recordCount: 4,
			});

			const row = await prisma.aiRecommendation.findUniqueOrThrow({
				where: { id: payload.id },
			});
			expect(row.termId).toBe(IDS.term);
			expect(row.status).toBe("pending_review");

			const latest = await service.latest();
			expect(latest?.id).toBe(payload.id);
		} finally {
			await resetAiData();
		}
	});

	it("returns null when no recommendation has been generated", async () => {
		await resetAiData();
		const service = new AiRecommendationService(stubFetcher().fetcher);
		try {
			expect(await service.latest()).toBeNull();
		} finally {
			await resetAiData();
		}
	});

	it("throws AiNoDataError for a term without class records", async () => {
		await resetAiData();
		await seed();
		const service = new AiRecommendationService(stubFetcher().fetcher);
		try {
			let error: unknown;
			try {
				await service.generate(IDS.emptyTerm);
			} catch (caught) {
				error = caught;
			}
			expect(error).toBeInstanceOf(AiNoDataError);
		} finally {
			await resetAiData();
		}
	});

	it("throws AiTermNotFoundError for an unknown term", async () => {
		await resetAiData();
		const service = new AiRecommendationService(stubFetcher().fetcher);
		try {
			let error: unknown;
			try {
				await service.generate("no-such-term");
			} catch (caught) {
				error = caught;
			}
			expect(error).toBeInstanceOf(AiTermNotFoundError);
		} finally {
			await resetAiData();
		}
	});
});
