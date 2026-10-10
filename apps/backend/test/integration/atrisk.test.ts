import { describe, expect, it } from "bun:test";

import { NotOwnerError } from "@lib/forms/approval-routes";
import { SubmitGateError } from "@lib/forms/submit-gates";
import { prisma } from "@lib/prisma";
import { unitScopeOf } from "@lib/unit-scope";
import { isDbReachable } from "@test/helpers/db-gate";
import {
	ACTION_TAKEN_CODE,
	ActionTakenInvalidEditError,
	AtRiskSectionNotFoundError,
	atRiskService,
} from "@v1/atrisk/service";
import { submissionService } from "@v1/forms/service";

const db = await isDbReachable();

/**
 * Test 9.9 — action-taken form for at-risk students.
 *
 * The `AtRiskFlag` rows must survive submit and return, and are deleted **only**
 * when the form's final approval lands — scoped to the students the form
 * selected and to the form's class section. Approving any other form code must
 * never touch the flags.
 */
const IDS = {
	department: "it-ar-dept",
	program: "it-ar-prog",
	term: "it-ar-term",
	course: "it-ar-course",
	sectionA: "it-ar-section-a",
	sectionB: "it-ar-section-b",
	clo: "it-ar-clo",
	run: "it-ar-run",
	// Students: s1 flagged in BOTH sections, s2 + s3 only in section A.
	s1: "it-ar-s1",
	s2: "it-ar-s2",
	s3: "it-ar-s3",
	attA1: "it-ar-att-a1",
	attA2: "it-ar-att-a2",
	attA3: "it-ar-att-a3",
	attB1: "it-ar-att-b1",
	flag1: "it-ar-flag-1",
	flag2: "it-ar-flag-2",
	flag3: "it-ar-flag-3",
	flag4: "it-ar-flag-4",
	faculty: "it-ar-faculty",
	other: "it-ar-other",
	chair: "it-ar-chair",
	// Remaining approvers — every action_taken chain climbs
	// chair → dean → aqau → vpaa, and only the VPAA's approval clears flags.
	dean: "it-ar-dean",
	aqau: "it-ar-aqau",
	vpaa: "it-ar-vpaa",
	// Only deleted when THIS file created it (clo_raw_data may be owned by
	// another test file — never delete a FormType row we did not create).
	rawType: "it-ar-type-raw",
};

/** Every user id this file creates (seed/reset cleanup scope). */
const USER_IDS = [
	IDS.faculty,
	IDS.other,
	IDS.chair,
	IDS.dean,
	IDS.aqau,
	IDS.vpaa,
];

const FLAG_IDS = [IDS.flag1, IDS.flag2, IDS.flag3, IDS.flag4];

/** Remaining test-owned flags (scoped so foreign fixtures can't skew counts). */
function flagCount(): Promise<number> {
	return prisma.atRiskFlag.count({ where: { id: { in: FLAG_IDS } } });
}

/**
 * The `action_taken` approval ladder with the seeded user for each rung —
 * every chain climbs to the VPAA, and the flag-clearing effect runs only when
 * the LAST rung lands (`lib/forms/approval-effects.ts`).
 */
const LADDER = [
	{ role: "program_chair", userId: IDS.chair },
	{ role: "dean", userId: IDS.dean },
	{ role: "aqau", userId: IDS.aqau },
	{ role: "vpaa", userId: IDS.vpaa },
] as const;

/** Approve rung `index` (0-based) of the ladder for submission `id`. */
function approveRung(id: string, index: number) {
	const rung = LADDER[index];
	return submissionService.decide(id, rung.role, rung.userId, rung.role, {
		decision: "approved",
	});
}

async function reset(): Promise<void> {
	await prisma.auditLog.deleteMany({
		where: { userId: { in: USER_IDS } },
	});
	// Submissions first — FormType deletion is Restrict-ed while referenced.
	await prisma.formSubmission.deleteMany({
		where: { programId: IDS.program },
	});
	await prisma.formType.deleteMany({ where: { id: IDS.rawType } });
	await prisma.formType.deleteMany({ where: { code: ACTION_TAKEN_CODE } });
	await prisma.atRiskFlag.deleteMany({
		where: { id: { in: FLAG_IDS } },
	});
	await prisma.cloAttainment.deleteMany({
		where: { id: { in: [IDS.attA1, IDS.attA2, IDS.attA3, IDS.attB1] } },
	});
	await prisma.computationRun.deleteMany({ where: { id: IDS.run } });
	await prisma.clo.deleteMany({ where: { id: IDS.clo } });
	await prisma.classSection.deleteMany({
		where: { id: { in: [IDS.sectionA, IDS.sectionB] } },
	});
	await prisma.course.deleteMany({ where: { id: IDS.course } });
	await prisma.student.deleteMany({
		where: { id: { in: [IDS.s1, IDS.s2, IDS.s3] } },
	});
	await prisma.user.deleteMany({
		where: { id: { in: USER_IDS } },
	});
	await prisma.academicTerm.deleteMany({ where: { id: IDS.term } });
	await prisma.program.deleteMany({ where: { id: IDS.program } });
	await prisma.department.deleteMany({ where: { id: IDS.department } });
}

async function seed(): Promise<void> {
	await prisma.department.create({
		data: {
			id: IDS.department,
			name: "Integration AtRisk Dept",
			code: "IT-AR",
		},
	});
	await prisma.program.create({
		data: {
			id: IDS.program,
			departmentId: IDS.department,
			name: "Integration AtRisk Program",
			code: "IT-AR-PROG",
		},
	});
	await prisma.academicTerm.create({
		data: {
			id: IDS.term,
			// NOTE: unique (schoolYear, semester) — no other integration file
			// claims 2091-2092, and the constraint is global across files.
			schoolYear: "2091-2092",
			semester: "1st",
			isActive: false,
		},
	});
	await prisma.course.create({
		data: {
			id: IDS.course,
			programId: IDS.program,
			code: "IT-AR-101",
			title: "Integration AtRisk Course",
		},
	});
	await prisma.classSection.createMany({
		data: [
			{
				id: IDS.sectionA,
				courseId: IDS.course,
				termId: IDS.term,
				sectionCode: "A1",
			},
			{
				id: IDS.sectionB,
				courseId: IDS.course,
				termId: IDS.term,
				sectionCode: "B1",
			},
		],
	});
	await prisma.clo.create({
		data: {
			id: IDS.clo,
			courseId: IDS.course,
			code: "CLO1",
			description: "Integration at-risk CLO",
		},
	});
	await prisma.computationRun.create({
		data: { id: IDS.run, scope: "class_section" },
	});
	await prisma.student.createMany({
		data: [
			{
				id: IDS.s1,
				studentNumber: "IT-AR-0001",
				programId: IDS.program,
				firstName: "Anna",
				lastName: "At-Risk",
				anonymizedId: "it-ar-anon-1",
			},
			{
				id: IDS.s2,
				studentNumber: "IT-AR-0002",
				programId: IDS.program,
				firstName: "Ben",
				lastName: "Below",
				anonymizedId: "it-ar-anon-2",
			},
			{
				id: IDS.s3,
				studentNumber: "IT-AR-0003",
				programId: IDS.program,
				firstName: "Cara",
				lastName: "Cutoff",
				anonymizedId: "it-ar-anon-3",
			},
		],
	});
	await prisma.cloAttainment.createMany({
		data: [
			{
				id: IDS.attA1,
				classSectionId: IDS.sectionA,
				cloId: IDS.clo,
				studentId: IDS.s1,
				compositeScorePct: 55,
				computationRunId: IDS.run,
				isBelowThreshold: true,
			},
			{
				id: IDS.attA2,
				classSectionId: IDS.sectionA,
				cloId: IDS.clo,
				studentId: IDS.s2,
				compositeScorePct: 60,
				computationRunId: IDS.run,
				isBelowThreshold: true,
			},
			{
				id: IDS.attA3,
				classSectionId: IDS.sectionA,
				cloId: IDS.clo,
				studentId: IDS.s3,
				compositeScorePct: 50,
				computationRunId: IDS.run,
				isBelowThreshold: true,
			},
			{
				id: IDS.attB1,
				classSectionId: IDS.sectionB,
				cloId: IDS.clo,
				studentId: IDS.s1,
				compositeScorePct: 58,
				computationRunId: IDS.run,
				isBelowThreshold: true,
			},
		],
	});
	await prisma.atRiskFlag.createMany({
		data: [
			{
				id: IDS.flag1,
				studentId: IDS.s1,
				cloAttainmentId: IDS.attA1,
				reason: "Composite 55% below the 70% floor",
			},
			{
				id: IDS.flag2,
				studentId: IDS.s2,
				cloAttainmentId: IDS.attA2,
				reason: "Composite 60% below the 70% floor",
			},
			{
				id: IDS.flag3,
				studentId: IDS.s3,
				cloAttainmentId: IDS.attA3,
				reason: "Composite 50% below the 70% floor",
			},
			{
				id: IDS.flag4,
				studentId: IDS.s1,
				cloAttainmentId: IDS.attB1,
				reason: "Composite 58% below the 70% floor",
			},
		],
	});
	await prisma.user.createMany({
		data: [
			{
				id: IDS.faculty,
				name: "At-Risk Faculty",
				email: "atrisk-faculty@obelisktest.local",
				role: "faculty",
				programId: IDS.program,
				departmentId: IDS.department,
				isActive: true,
			},
			{
				id: IDS.other,
				name: "At-Risk Other",
				email: "atrisk-other@obelisktest.local",
				role: "faculty",
				programId: IDS.program,
				departmentId: IDS.department,
				isActive: true,
			},
			{
				id: IDS.chair,
				name: "At-Risk Chair",
				email: "atrisk-chair@obelisktest.local",
				role: "program_chair",
				programId: IDS.program,
				departmentId: IDS.department,
				isActive: true,
			},
			{
				id: IDS.dean,
				name: "At-Risk Dean",
				email: "atrisk-dean@obelisktest.local",
				role: "dean",
				programId: IDS.program,
				departmentId: IDS.department,
				isActive: true,
			},
			{
				id: IDS.aqau,
				name: "At-Risk AQAU",
				email: "atrisk-aqau@obelisktest.local",
				role: "aqau",
				isActive: true,
			},
			{
				id: IDS.vpaa,
				name: "At-Risk VPAA",
				email: "atrisk-vpaa@obelisktest.local",
				role: "vpaa",
				isActive: true,
			},
		],
	});
}

/** Reuse another test file's `clo_raw_data` row when present; else create ours. */
async function ensureRawFormType(): Promise<string> {
	const existing = await prisma.formType.findUnique({
		where: { code: "clo_raw_data" },
		select: { id: true },
	});
	if (existing) return existing.id;
	await prisma.formType.create({
		data: {
			id: IDS.rawType,
			code: "clo_raw_data",
			name: "Per-Student CLO Raw Data Sheet",
			pdcaStage: "DO",
			sequenceNo: 7,
		},
	});
	return IDS.rawType;
}

describe.skipIf(!db)("at-risk action-taken form (integration)", () => {
	it("lists the watchlist scoped to one class section", async () => {
		await reset();
		await seed();
		try {
			// These fixtures are institution-wide (no unit) — `listFlags` takes
			// the caller's unit as its first argument.
			const INSTITUTION = unitScopeOf({ id: "atrisk-test", role: "vpaa" });
			const sectionA = await atRiskService.listFlags(INSTITUTION, IDS.sectionA);
			expect(sectionA).toHaveLength(3);
			expect(sectionA.map((r) => r.studentId).sort()).toEqual(
				[IDS.s1, IDS.s2, IDS.s3].sort(),
			);
			expect(
				sectionA.every((r) => r.cloAttainment?.classSectionId === IDS.sectionA),
			).toBe(true);
			expect(sectionA[0]?.student.studentNumber).toBeDefined();
			expect(sectionA[0]?.cloAttainment?.clo.code).toBe("CLO1");

			const sectionB = await atRiskService.listFlags(INSTITUTION, IDS.sectionB);
			expect(sectionB).toHaveLength(1);
			expect(sectionB[0]?.studentId).toBe(IDS.s1);

			// Unscoped listing contains every test flag (other fixtures may exist).
			const all = await atRiskService.listFlags(INSTITUTION);
			expect(all.map((r) => r.id)).toEqual(expect.arrayContaining(FLAG_IDS));
		} finally {
			await reset();
		}
	}, 60000);

	it("init resolves term/program from the section and is idempotent", async () => {
		await reset();
		await seed();
		try {
			const first = await atRiskService.init(IDS.sectionA, IDS.faculty);
			const sub = await prisma.formSubmission.findUnique({
				where: { id: first.id },
			});
			expect(sub?.status).toBe("draft");
			expect(sub?.classSectionId).toBe(IDS.sectionA);
			expect(sub?.programId).toBe(IDS.program);
			expect(sub?.termId).toBe(IDS.term);
			expect(sub?.submittedByUserId).toBe(IDS.faculty);
			expect(sub?.formTypeId).toBeDefined();

			// A second call reuses the open draft instead of forking a new one.
			const again = await atRiskService.init(IDS.sectionA, IDS.other);
			expect(again.id).toBe(first.id);
			expect(
				await prisma.formSubmission.count({
					where: { formTypeId: sub?.formTypeId },
				}),
			).toBe(1);

			// Unknown section → 404-shaped service error.
			await expect(
				atRiskService.init("no-such-section", IDS.faculty),
			).rejects.toThrow(AtRiskSectionNotFoundError);

			// Opening a form never mutates the watchlist.
			expect(await flagCount()).toBe(4);
		} finally {
			await reset();
		}
	}, 60000);

	it("submit gate blocks an empty selection / empty note; flags stay on submit", async () => {
		await reset();
		await seed();
		try {
			const { id } = await atRiskService.init(IDS.sectionA, IDS.faculty);

			// Empty studentIds → gate.
			await expect(
				submissionService.submit(id, IDS.faculty, "faculty"),
			).rejects.toThrow(SubmitGateError);

			// Students selected but no intervention described → gate.
			await atRiskService.save(id, IDS.faculty, "faculty", {
				studentIds: [IDS.s1],
				actionTaken: "   ",
			});
			await expect(
				submissionService.submit(id, IDS.faculty, "faculty"),
			).rejects.toThrow(SubmitGateError);

			// A non-owner cannot write the payload.
			await expect(
				atRiskService.save(id, IDS.other, "faculty", {
					studentIds: [IDS.s1],
					actionTaken: "hijack",
				}),
			).rejects.toThrow(NotOwnerError);

			await atRiskService.save(id, IDS.faculty, "faculty", {
				studentIds: [IDS.s1, IDS.s2],
				actionTaken: "Weekly coaching + supplemental exercises issued.",
			});
			const submitted = await submissionService.submit(
				id,
				IDS.faculty,
				"faculty",
			);
			expect(submitted.status).toBe("submitted");
			expect(submitted.currentApproverRole).toBe("program_chair");
			expect(submitted.approvalSteps).toHaveLength(LADDER.length);
			expect(submitted.approvalSteps.map((s) => s.approverRole)).toEqual(
				LADDER.map((r) => r.role),
			);

			// 9.9: the flag stays after submission — nothing cleared yet.
			expect(await flagCount()).toBe(4);
		} finally {
			await reset();
		}
	}, 60000);

	it("return leaves flags intact; final approval clears only selected students in the form's section", async () => {
		await reset();
		await seed();
		try {
			const { id } = await atRiskService.init(IDS.sectionA, IDS.faculty);
			await atRiskService.save(id, IDS.faculty, "faculty", {
				studentIds: [IDS.s1, IDS.s2],
				actionTaken: "Coaching sessions held Sep 8/10/12.",
			});
			await submissionService.submit(id, IDS.faculty, "faculty");

			// --- returned at the program-chair step → nothing cleared -----------
			const returned = await submissionService.decide(
				id,
				"program_chair",
				IDS.chair,
				"program_chair",
				{ decision: "returned", comment: "Add the re-assessment date." },
			);
			expect(returned.status).toBe("returned");
			expect(await flagCount()).toBe(4);

			// Editable again → fix and resubmit (chain rebuilt from scratch).
			await atRiskService.save(id, IDS.faculty, "faculty", {
				studentIds: [IDS.s1, IDS.s2],
				actionTaken: "Coaching sessions held Sep 8/10/12; re-assessment wk 11.",
			});
			await submissionService.submit(id, IDS.faculty, "faculty");

			// --- ladder: chair → dean → aqau leave the flags alone ---------------
			for (const index of [0, 1, 2]) {
				const rung = await approveRung(id, index);
				expect(rung.status).toBe("submitted");
				expect(await flagCount()).toBe(4);
			}

			// --- final approval (VPAA) → flags cleared --------------------------
			const approved = await approveRung(id, LADDER.length - 1);
			expect(approved.status).toBe("approved");
			expect(approved.currentApproverRole).toBeNull();

			// s1@sA and s2@sA cleared; s3@sA (not selected) and s1@sB (other
			// section) survive.
			const remaining = await prisma.atRiskFlag.findMany({
				where: { id: { in: FLAG_IDS } },
				select: { id: true },
			});
			expect(remaining.map((f) => f.id).sort()).toEqual(
				[IDS.flag3, IDS.flag4].sort(),
			);

			// The clear count lands in the FINAL approval's audit entry; the
			// earlier rungs log an approval with no effect details.
			const approvals = await prisma.auditLog.findMany({
				where: { targetRecordId: id, action: "form_submission.approved" },
				orderBy: { createdAt: "asc" },
			});
			expect(approvals).toHaveLength(LADDER.length);
			const flagged = approvals.map(
				(entry) => (entry.details as { flagsCleared?: number }).flagsCleared,
			);
			expect(flagged.slice(0, -1).every((count) => count === undefined)).toBe(
				true,
			);
			expect(flagged.at(-1)).toBe(2);

			// Locked after approval — the payload cannot be rewritten.
			await expect(
				atRiskService.save(id, IDS.faculty, "faculty", {
					studentIds: [],
					actionTaken: "",
				}),
			).rejects.toThrow(ActionTakenInvalidEditError);

			// A later intervention round gets a fresh draft (previous is approved).
			const second = await atRiskService.init(IDS.sectionA, IDS.faculty);
			expect(second.id).not.toBe(id);
		} finally {
			await reset();
		}
	}, 60000);

	it("approving a different form code never clears at-risk flags", async () => {
		await reset();
		await seed();
		try {
			const rawTypeId = await ensureRawFormType();
			// Payload even names every flagged student — the effect must stay
			// keyed to `action_taken` and do nothing for `clo_raw_data`.
			// Bound to a section with captured attainments so the clo_raw_data
			// submit gate (≥1 CloAttainment) lets the draft through.
			const draft = await submissionService.create(
				{
					formTypeId: rawTypeId,
					classSectionId: IDS.sectionA,
					programId: IDS.program,
					termId: IDS.term,
					formData: { studentIds: [IDS.s1, IDS.s2, IDS.s3] },
				},
				IDS.faculty,
			);
			// NOTE: `clo_raw_data` is Record-tagged — it files straight to
			// `approved` with no steps, so no approval effect can run for it.
			const filed = await submissionService.submit(
				draft.id,
				IDS.faculty,
				"faculty",
			);
			expect(filed.status).toBe("approved");
			expect(filed.approvalSteps).toHaveLength(0);
			expect(await flagCount()).toBe(4);

			// Reading the action-taken endpoints against a foreign submission 404s.
			await expect(atRiskService.get(draft.id)).rejects.toThrow(
				"Action-taken submission",
			);
			await expect(
				atRiskService.save(draft.id, IDS.faculty, "faculty", {
					studentIds: [IDS.s1],
					actionTaken: "nope",
				}),
			).rejects.toThrow("Action-taken submission");
		} finally {
			await reset();
		}
	}, 60000);
});
