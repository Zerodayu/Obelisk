import { describe, expect, it } from "bun:test";

import type {
	CqiNarrativePayload,
	CqiNarrativeResponse,
} from "@lib/ingest/ingest-client";
import { prisma } from "@lib/prisma";
import { isDbReachable } from "@test/helpers/db-gate";
import {
	CqiInstitutionalReportService,
	CqiNarrativeNotFoundError,
} from "@v1/reports/cqi-institutional.service";

const db = await isDbReachable();

const IDS = {
	department: "it-cqi-rpt-dept",
	program: "it-cqi-rpt-prog",
	term: "it-cqi-rpt-term",
	course: "it-cqi-rpt-course",
	section: "it-cqi-rpt-section",
	clo: "it-cqi-rpt-clo",
	run: "it-cqi-rpt-run",
	user: "it-cqi-rpt-user",
	students: Array.from({ length: 10 }, (_, i) => `it-cqi-rpt-stu-${i}`),
};

async function resetData() {
	await prisma.aiRecommendation.deleteMany({ where: { termId: IDS.term } });
	await prisma.cloAttainment.deleteMany({
		where: { classSectionId: IDS.section },
	});
	await prisma.computationRun.deleteMany({ where: { id: IDS.run } });
	await prisma.enrollment.deleteMany({
		where: { classSectionId: IDS.section },
	});
	await prisma.student.deleteMany({ where: { programId: IDS.program } });
	await prisma.clo.deleteMany({ where: { courseId: IDS.course } });
	await prisma.classSection.deleteMany({ where: { id: IDS.section } });
	await prisma.course.deleteMany({ where: { id: IDS.course } });
	await prisma.academicTerm.deleteMany({ where: { id: IDS.term } });
	await prisma.program.deleteMany({ where: { id: IDS.program } });
	await prisma.department.deleteMany({ where: { id: IDS.department } });
	await prisma.user.deleteMany({ where: { id: IDS.user } });
}

/** One section, one CLO, 10 students at 80% composite, no F04 target. */
async function seed() {
	await prisma.department.create({
		data: { id: IDS.department, name: "CQI Report Dept", code: "IT-CQIRPT" },
	});
	await prisma.program.create({
		data: {
			id: IDS.program,
			departmentId: IDS.department,
			name: "CQI Report Program",
			code: "CQIRPT",
		},
	});
	await prisma.academicTerm.create({
		data: {
			id: IDS.term,
			schoolYear: "2094-2095",
			semester: "1st",
			isActive: false,
		},
	});
	await prisma.course.create({
		data: {
			id: IDS.course,
			programId: IDS.program,
			code: "RPT-101",
			title: "Report Test Course",
		},
	});
	await prisma.classSection.create({
		data: {
			id: IDS.section,
			courseId: IDS.course,
			termId: IDS.term,
			sectionCode: "R1",
		},
	});
	await prisma.clo.create({
		data: {
			id: IDS.clo,
			courseId: IDS.course,
			code: "CLO1",
			description: "Report test CLO",
		},
	});
	await prisma.user.create({
		data: {
			id: IDS.user,
			name: "CQI Report User",
			email: "cqi-report@obelisktest.local",
			role: "vpaa",
		},
	});
	await prisma.computationRun.create({
		data: {
			id: IDS.run,
			scope: IDS.section,
			etlSnapshotJson: {
				attainments: [
					{ clo_code: "CLO1", is_record_complete: true, rule1_met: true },
				],
			},
		},
	});
	for (const [index, studentId] of IDS.students.entries()) {
		await prisma.student.create({
			data: {
				id: studentId,
				studentNumber: `IT-CQIRPT-${index}`,
				programId: IDS.program,
				yearLevel: 1,
				firstName: "Test",
				lastName: `Student${index}`,
				anonymizedId: `it-cqirpt-anon-${index}`,
			},
		});
		await prisma.enrollment.create({
			data: { id: `${studentId}-enr`, studentId, classSectionId: IDS.section },
		});
		await prisma.cloAttainment.create({
			data: {
				id: `${studentId}-att`,
				classSectionId: IDS.section,
				cloId: IDS.clo,
				studentId,
				directScorePct: 80,
				indirectScorePct: 80,
				compositeScorePct: 80,
				computationRunId: IDS.run,
			},
		});
	}
}

function narrativeResponse(
	status: CqiNarrativeResponse["status"],
): CqiNarrativeResponse {
	if (status !== "ok") {
		return {
			status,
			summary: null,
			recommendations: [],
			possible_contributing_factors: [],
			pattern: null,
			data_limitations: [],
			missing_sections: [],
			facts_used: [],
			provenance: null,
			error: status === "error" ? "LLM call failed" : null,
			reason: status === "narrative_unavailable" ? "No outcomes" : null,
		};
	}
	return {
		status: "ok",
		summary: "Institution-wide attainment held at 80%.",
		recommendations: [
			{
				problem: "RPT-101/CLO1 sits at 80% with no measurable headroom.",
				evidence_fact_ids: ["fact:clo:RPT-101/CLO1"],
				existing_intervention_assessment: null,
				proposed_additions: "Add a mid-term clinic.",
				responsible_role: "Program Chair",
				timeline: "Next term",
				success_indicator: "Lift to 85%",
				target: 85,
				verification_method: "Next cycle attainment",
			},
		],
		possible_contributing_factors: [
			{
				hypothesis: "Assessment items may be pitched at the floor.",
				root_cause_category: "Assessment Design",
				evidence_fact_ids: ["fact:clo:RPT-101/CLO1"],
			},
		],
		pattern: null,
		data_limitations: [],
		missing_sections: [],
		facts_used: [{ id: "fact:clo:RPT-101/CLO1" }],
		provenance: { model: "test" },
		error: null,
		reason: null,
	};
}

describe.skipIf(!db)("CQI institutional report (integration)", () => {
	it("persists only a validated narrative as pending_review", async () => {
		await resetData();
		await seed();
		try {
			const payloads: CqiNarrativePayload[] = [];
			const service = new CqiInstitutionalReportService(async (payload) => {
				payloads.push(payload);
				return narrativeResponse("ok");
			});

			const report = await service.getReport(IDS.term);
			expect(report.statistics.enrolledCount).toBe(10);
			expect(report.statistics.assessedCount).toBe(10);
			expect(report.statistics.meanPct).toBe(80);
			expect(report.findings.strengths).toHaveLength(1);
			expect(report.findings.strengths[0].outcomeCode).toBe("RPT-101/CLO1");
			// NOTE: no student identifiers may leave the webapp.
			expect(JSON.stringify(payloads[0] ?? {})).not.toContain("it-cqi-rpt-stu");

			const generated = await service.generateNarrative(
				IDS.term,
				undefined,
				IDS.user,
			);
			expect(generated.status).toBe("ok");

			const rows = await prisma.aiRecommendation.findMany({
				where: { termId: IDS.term, programId: null },
			});
			expect(rows).toHaveLength(1);
			expect(rows[0].status).toBe("pending_review");
			expect(
				(rows[0].sourceDataSnapshot as { reportKind?: string }).reportKind,
			).toBe("cqi_institutional_v1");

			const withNarrative = await service.getReport(IDS.term);
			expect(withNarrative.narrative?.recommendations).toHaveLength(1);
			expect(withNarrative.findings.hypotheses).toHaveLength(1);
			expect(withNarrative.findings.hypotheses[0].status).toBe(
				"pending_program_chair_confirmation",
			);

			const reviewed = await service.reviewNarrative(
				rows[0].id,
				"acknowledged",
				IDS.user,
			);
			expect(reviewed?.status).toBe("acknowledged");
		} finally {
			await resetData();
		}
	});

	it("stores nothing for error / narrative_unavailable", async () => {
		await resetData();
		await seed();
		try {
			for (const status of ["error", "narrative_unavailable"] as const) {
				const service = new CqiInstitutionalReportService(async () =>
					narrativeResponse(status),
				);
				const result = await service.generateNarrative(
					IDS.term,
					undefined,
					IDS.user,
				);
				expect(result.status).toBe(status);
				expect(result.narrative).toBeNull();
			}
			expect(
				await prisma.aiRecommendation.count({ where: { termId: IDS.term } }),
			).toBe(0);
		} finally {
			await resetData();
		}
	});

	it("refuses to review a recommendation that is not a CQI report", async () => {
		await resetData();
		await seed();
		try {
			const row = await prisma.aiRecommendation.create({
				data: {
					id: "it-cqi-rpt-foreign",
					termId: IDS.term,
					summary: "Program-level row",
					recommendationText: "{}",
					sourceDataSnapshot: { reportKind: "other" },
				},
			});
			const service = new CqiInstitutionalReportService(async () =>
				narrativeResponse("error"),
			);
			await expect(
				service.reviewNarrative(row.id, "dismissed", IDS.user),
			).rejects.toBeInstanceOf(CqiNarrativeNotFoundError);		} finally {
			await resetData();
		}
	});
});
