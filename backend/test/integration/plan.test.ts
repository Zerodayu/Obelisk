import { describe, expect, it } from "bun:test";
import { prisma } from "@lib/prisma";
import { isDbReachable } from "@test/helpers/db-gate";
import { MissingRationaleError, TargetBelowFloorError } from "@v1/plan/compute";
import {
	assessmentBudgetService,
	assessmentCalendarService,
	curriculumMapService,
	PlanTemplateProtectedError,
	targetSettingMatrixService,
} from "@v1/plan/service";

const db = await isDbReachable();

const IDS = {
	department: "it-plan-dept",
	program: "it-plan-prog",
	term: "it-plan-term",
	user: "it-plan-user",
	plo1: "it-plan-plo-1",
	plo2: "it-plan-plo-2",
};

const PLAN_FORM_CODES = [
	"curriculum_map",
	"assessment_calendar",
	"target_setting_matrix",
	"assessment_budget",
];

async function seedAcademicChain() {
	await prisma.department.create({
		data: {
			id: IDS.department,
			name: "Integration PLAN Dept",
			code: "IT-PLAN",
		},
	});
	await prisma.program.create({
		data: {
			id: IDS.program,
			departmentId: IDS.department,
			name: "Integration Test PLAN Program",
			code: "IT-PLAN-PROG",
		},
	});
	await prisma.academicTerm.create({
		data: {
			id: IDS.term,
			schoolYear: "2096-2097",
			semester: "1st",
			isActive: false,
		},
	});
	await prisma.plo.create({
		data: {
			id: IDS.plo1,
			programId: IDS.program,
			code: "ITPLAN-PLO1",
			description: "PLAN integration PLO 1",
			targetAttainmentPct: 70,
		},
	});
	await prisma.plo.create({
		data: {
			id: IDS.plo2,
			programId: IDS.program,
			code: "ITPLAN-PLO2",
			description: "PLAN integration PLO 2",
			targetAttainmentPct: 70,
		},
	});
	await prisma.user.create({
		data: {
			id: IDS.user,
			name: "PLAN User",
			email: "plan@obelisktest.local",
		},
	});
}

/** Clears any rows left over by an aborted earlier run (timeouts skip `finally`). */
async function resetPlanData() {
	await prisma.formSubmission.deleteMany({
		where: {
			formType: { code: { in: PLAN_FORM_CODES } },
			programId: IDS.program,
		},
	});
	await prisma.auditLog.deleteMany({
		where: { moduleAffected: "plan", userId: IDS.user },
	});
	await prisma.plo.deleteMany({ where: { programId: IDS.program } });
	await prisma.academicTerm.deleteMany({ where: { id: IDS.term } });
	await prisma.program.deleteMany({ where: { id: IDS.program } });
	await prisma.department.deleteMany({ where: { id: IDS.department } });
	await prisma.user.deleteMany({ where: { id: IDS.user } });
	await prisma.formType.deleteMany({
		where: { code: { in: PLAN_FORM_CODES } },
	});
}

async function cleanup(draftIds: string[]) {
	await prisma.auditLog.deleteMany({
		where: { moduleAffected: "plan", userId: IDS.user },
	});
	await prisma.formSubmission.deleteMany({ where: { id: { in: draftIds } } });
}

describe.skipIf(!db)("PLAN-phase setup forms (integration)", () => {
	it("exit check: all four PLAN forms initialize, save, protect templates, and compute rollups", async () => {
		await resetPlanData();
		await seedAcademicChain();
		const draftIds: string[] = [];
		try {
			// --- curriculum_map ------------------------------------------------
			const cm = await curriculumMapService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(cm.draft.id);
			expect(cm.payload.directoryRows).toHaveLength(0);

			const cmSaved = await curriculumMapService.save(cm.draft.id, IDS.user, {
				header: { programTitle: "BS IT", revisionNumber: "Rev. 1" },
				plos: [
					{
						ploCode: "ITPLAN-PLO1",
						statement: "PLAN integration PLO 1",
						evidenceSources: ["exam", "rubric"],
						dStageCourse: "IT 401",
						validationStatus: "confirmed",
					},
					{
						ploCode: "ITPLAN-PLO2",
						statement: "PLAN integration PLO 2",
						evidenceSources: ["portfolio"],
					},
				],
				courses: [
					{
						yearLevel: 1,
						courseCode: "IT 101",
						courseTitle: "Intro to Computing",
						cells: [{ ploCode: "ITPLAN-PLO2", stage: "i" }],
					},
					{
						yearLevel: 4,
						courseCode: "IT 401",
						courseTitle: "Capstone",
						cells: [{ ploCode: "ITPLAN-PLO1", stage: "d", cloCodes: "CLO3" }],
					},
				],
			});
			expect(cmSaved.directoryRows).toHaveLength(2);
			expect(cmSaved.directoryRows[0].ploId).toBe(IDS.plo1);
			expect(cmSaved.courseRows).toHaveLength(2);
			expect(cmSaved.coverageCheck).toEqual({
				"ITPLAN-PLO1": true,
				"ITPLAN-PLO2": false,
			});
			expect(cmSaved.header).toMatchObject({ programTitle: "BS IT" });

			const cmAudit = await prisma.auditLog.findFirst({
				where: { action: "curriculum_map.saved", targetRecordId: cm.draft.id },
			});
			expect(auditLogged(cmAudit)).toBe(true);

			// --- assessment_calendar -------------------------------------------
			const cal = await assessmentCalendarService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(cal.draft.id);
			// 9 Semester 1 + 8 Annual/Sem2 institutional template rows.
			expect(cal.payload.events).toHaveLength(17);
			expect(cal.payload.events.filter((e) => e.isTemplate)).toHaveLength(17);
			expect(cal.payload.events[0].templateKey).toBe("pac_convening");

			// Template dates are editable...
			const pacEvent = cal.payload.events.find(
				(e) => e.templateKey === "pac_convening",
			);
			if (!pacEvent) throw new Error("pac_convening template not seeded");
			const pacEventId = pacEvent.id;
			const calEdited = await assessmentCalendarService.save(
				cal.draft.id,
				IDS.user,
				{
					header: { dateApprovedByDean: "2026-06-01" },
					events: [
						{
							id: pacEventId,
							section: "semester1",
							periodWeeks: "June 1 - July 15",
							responsibleParty: "PAC Chair",
						},
					],
				},
			);
			expect(calEdited.events.find((e) => e.id === pacEventId)).toMatchObject({
				periodWeeks: "June 1 - July 15",
			});

			// ...but never deletable.
			await expect(
				assessmentCalendarService.save(cal.draft.id, IDS.user, {
					events: [],
					removeEventIds: [pacEventId],
				}),
			).rejects.toThrow(PlanTemplateProtectedError);

			// Program-specific rows are fully free-form.
			const calWithExtra = await assessmentCalendarService.save(
				cal.draft.id,
				IDS.user,
				{
					events: [
						{
							section: "program_specific",
							activity: "Local accreditation mock visit",
							cohortYears: [4],
						},
					],
				},
			);
			const extra = calWithExtra.events.find((e) => !e.isTemplate);
			if (!extra) throw new Error("program-specific event not created");
			expect(extra.activity).toBe("Local accreditation mock visit");
			const calAfterRemove = await assessmentCalendarService.save(
				cal.draft.id,
				IDS.user,
				{ events: [], removeEventIds: [extra.id] },
			);
			expect(calAfterRemove.events).toHaveLength(17);
			expect(calAfterRemove.header).toMatchObject({
				dateApprovedByDean: "2026-06-01",
			});

			// --- target_setting_matrix ------------------------------------------
			const tsm = await targetSettingMatrixService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(tsm.draft.id);
			// One seeded row per program PLO at the 70% default.
			expect(tsm.payload.ploRows).toHaveLength(2);
			for (const row of tsm.payload.ploRows) {
				expect(row.targets).toEqual([70, 70, 70, 70]);
			}
			expect(tsm.payload.programPloAvg).toEqual([70, 70, 70, 70]);

			await expect(
				targetSettingMatrixService.save(tsm.draft.id, IDS.user, {
					ploRows: [
						{
							ploCode: "ITPLAN-PLO1",
							y1TargetPct: 65,
							y2TargetPct: 70,
							y3TargetPct: 70,
							y4TargetPct: 70,
						},
					],
					courseRows: [],
				}),
			).rejects.toThrow(TargetBelowFloorError);

			await expect(
				targetSettingMatrixService.save(tsm.draft.id, IDS.user, {
					ploRows: [
						{
							ploCode: "ITPLAN-PLO1",
							y1TargetPct: 75,
							y2TargetPct: 70,
							y3TargetPct: 70,
							y4TargetPct: 70,
						},
					],
					courseRows: [],
				}),
			).rejects.toThrow(MissingRationaleError);

			const tsmSaved = await targetSettingMatrixService.save(
				tsm.draft.id,
				IDS.user,
				{
					header: { priorYearProgramPloAvg: 72.5 },
					ploRows: [
						{
							ploCode: "ITPLAN-PLO1",
							statement: "PLAN integration PLO 1",
							y1TargetPct: 74,
							y2TargetPct: 75,
							y3TargetPct: 76,
							y4TargetPct: 77,
							rationale: "Consistently strong cohort history",
						},
						{
							ploCode: "ITPLAN-PLO2",
							y1TargetPct: 70,
							y2TargetPct: 71,
							y3TargetPct: 72,
							y4TargetPct: 73,
							rationale: "Improving indirect survey trend",
						},
					],
					courseRows: [
						{
							courseCode: "IT 101",
							courseTitle: "Intro to Computing",
							cloCode: "CLO1",
							y1TargetPct: 72,
							notes: "Gateway course",
						},
					],
				},
			);
			expect(tsmSaved.ploRows[0].targets).toEqual([74, 75, 76, 77]);
			expect(tsmSaved.programPloAvg).toEqual([72, 73, 74, 75]);
			expect(tsmSaved.courseRows[0].targets).toEqual([72, null, null, null]);
			expect(tsmSaved.header).toMatchObject({
				priorYearProgramPloAvg: 72.5,
			});

			// --- assessment_budget ----------------------------------------------
			const budget = await assessmentBudgetService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			draftIds.push(budget.draft.id);
			// The 12 fixed line items grouped by PDCA phase.
			expect(budget.payload.lineItems).toHaveLength(12);
			expect(
				budget.payload.lineItems.filter((l) => l.phase === "plan"),
			).toHaveLength(2);
			expect(budget.payload.lineItems.filter((l) => l.isFixed)).toHaveLength(
				12,
			);
			expect(budget.payload.totals).toEqual({
				estimatedTotal: 0,
				approvedTotal: 0,
			});

			const calibration = budget.payload.lineItems.find(
				(l) => l.name === "Industry Practitioner Calibration",
			);
			const contingency = budget.payload.lineItems.find(
				(l) => l.name === "Contingency/Miscellaneous",
			);
			if (!calibration || !contingency) {
				throw new Error("fixed budget line items not seeded");
			}
			const budgetSaved = await assessmentBudgetService.save(
				budget.draft.id,
				IDS.user,
				{
					header: {
						totalBudgetRequested: 50000,
						vpaaName: "Dr. VPAA",
					},
					lineItems: [
						{
							id: calibration.id,
							estimatedCost: 15000,
							approvedCost: 12000,
							source: "vpaa",
							notes: "Semester calibration workshop",
						},
						{
							phase: "act",
							name: "Program-specific rubric printing",
							estimatedCost: 2000,
							approvedCost: 1800,
							source: "dean",
						},
					],
				},
			);
			expect(budgetSaved.totals).toEqual({
				estimatedTotal: 17000,
				approvedTotal: 13800,
			});
			expect(budgetSaved.header).toMatchObject({
				totalBudgetRequested: 50000,
			});

			// Fixed line items cannot be removed.
			await expect(
				assessmentBudgetService.save(budget.draft.id, IDS.user, {
					lineItems: [],
					removeLineItemIds: [contingency.id],
				}),
			).rejects.toThrow(PlanTemplateProtectedError);

			// Extra program-specific rows can be removed again.
			const extraLine = budgetSaved.lineItems.find(
				(l) => l.name === "Program-specific rubric printing",
			);
			if (!extraLine) throw new Error("program-specific line item not created");
			const budgetAfterRemove = await assessmentBudgetService.save(
				budget.draft.id,
				IDS.user,
				{ lineItems: [], removeLineItemIds: [extraLine.id] },
			);
			expect(budgetAfterRemove.lineItems).toHaveLength(12);
			expect(budgetAfterRemove.totals).toEqual({
				estimatedTotal: 15000,
				approvedTotal: 12000,
			});

			// --- shared lifecycle -------------------------------------------------
			// Re-initializing reuses the same active draft instead of duplicating.
			const again = await curriculumMapService.init(
				IDS.program,
				IDS.term,
				IDS.user,
			);
			expect(again.draft.id).toBe(cm.draft.id);

			const audits = await prisma.auditLog.count({
				where: { moduleAffected: "plan", userId: IDS.user },
			});
			expect(audits).toBeGreaterThan(0);
		} finally {
			await cleanup(draftIds);
		}
	}, 60000);
});

function auditLogged(row: unknown): boolean {
	return row !== null;
}
