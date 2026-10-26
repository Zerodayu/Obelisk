/**
 * Development-only demo seed — makes every dashboard graph render.
 *
 * Run `just db-seed` first (reference data + role accounts), then
 * `just db-seed-demo`. This script owns everything it writes (`demo-*` ids,
 * `DEMO-*` student numbers) and resets it before recreating, so it is safe to
 * re-run. It never touches non-demo rows and refuses to run against a
 * production database.
 *
 * NOTE: the PLO attainment chart reads python-server at request time
 * (`GET /rollup/plo-attainment-summary/:id` re-runs `/analytics/summary`), so
 * it only renders while the ETL service is up — `just dev` starts it.
 */

import { approvalRouteFor } from "@lib/forms/approval-routes";
import { prisma } from "@lib/prisma";
import { ROOT_CAUSE_CATEGORIES } from "@lib/validators/root-cause";
import type { ApproverRole, UserRole } from "@prisma/generated/prisma/enums";
import { computeLoopStatus } from "@v1/cqi/compute";
import {
	closingTheLoopService,
	cqiActionPlanService,
	ploGapAnalysisService,
} from "@v1/cqi/service";
import { attainmentService } from "@v1/ingest/service";
import {
	assessmentBudgetService,
	targetSettingMatrixService,
} from "@v1/plan/service";
import {
	cloSummaryService,
	cohortTrackingService,
	ploSummaryService,
} from "@v1/rollup/service";

import {
	approvalStepsFor,
	buildAttainments,
	buildHeader,
	DEMO_CLO_CODES,
	DEMO_COURSE_BY_YEAR,
	DEMO_PREFIX,
	DEMO_STUDENTS,
	DEMO_STUDENT_PREFIX,
	DEMO_TERMS,
	type DemoSubmissionStatus,
} from "./seed-demo-fixtures";

const PROGRAM_CODE = "BSIT";

/** Form types the demo submissions need, with the catalogue's own metadata. */
const FORM_TYPE_META: Record<
	string,
	{
		name: string;
		pdcaStage: "PLAN" | "DO" | "CHECK" | "ACT";
		sequenceNo: number;
	}
> = {
	curriculum_map: {
		name: "CLO-PLO Curriculum Map",
		pdcaStage: "PLAN",
		sequenceNo: 1,
	},
	assessment_calendar: {
		name: "Assessment Calendar with Cohort Tracking Milestones",
		pdcaStage: "PLAN",
		sequenceNo: 3,
	},
	course_assessment_report: {
		name: "Course Assessment Report",
		pdcaStage: "CHECK",
		sequenceNo: 13,
	},
	annual_program_report: {
		name: "Annual Program Assessment Report (APAR)",
		pdcaStage: "ACT",
		sequenceNo: 19,
	},
	peer_observation: {
		name: "Peer Observation Record",
		pdcaStage: "CHECK",
		sequenceNo: 22,
	},
	alumni_tracer: {
		name: "Alumni Tracer Study Report",
		pdcaStage: "ACT",
		sequenceNo: 29,
	},
	action_taken: {
		name: "Action-Taken Record (At-Risk Students)",
		pdcaStage: "ACT",
		sequenceNo: 35,
	},
};

/** Mixed-status filings so the status donut + approval-chain chart have rows. */
const MIXED_SUBMISSIONS: Array<{
	code: keyof typeof FORM_TYPE_META;
	status: DemoSubmissionStatus;
	preparer: "faculty" | "program_chair";
}> = [
	{ code: "curriculum_map", status: "approved", preparer: "program_chair" },
	{
		code: "assessment_calendar",
		status: "submitted",
		preparer: "program_chair",
	},
	{ code: "course_assessment_report", status: "returned", preparer: "faculty" },
	{
		code: "annual_program_report",
		status: "archived",
		preparer: "program_chair",
	},
	{ code: "action_taken", status: "draft", preparer: "faculty" },
	{ code: "peer_observation", status: "submitted", preparer: "faculty" },
	{ code: "alumni_tracer", status: "approved", preparer: "program_chair" },
];

const ACCOUNT_EMAILS = {
	faculty: "faculty@jmcfi.edu.ph",
	program_chair: "program_chair@jmcfi.edu.ph",
	dean: "dean@jmcfi.edu.ph",
	aqau: "aqau@jmcfi.edu.ph",
	vpaa: "vpaa@jmcfi.edu.ph",
} as const;

function fail(message: string): never {
	console.error(`FATAL: ${message}`);
	process.exit(1);
}

function daysAgo(days: number): Date {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** Find-or-create a form-type row (the services also do this lazily). */
async function ensureFormType(
	code: keyof typeof FORM_TYPE_META,
): Promise<string> {
	const meta = FORM_TYPE_META[code];
	const row = await prisma.formType.upsert({
		where: { code },
		update: {
			name: meta.name,
			pdcaStage: meta.pdcaStage,
			sequenceNo: meta.sequenceNo,
		},
		create: {
			id: crypto.randomUUID(),
			code,
			name: meta.name,
			pdcaStage: meta.pdcaStage,
			sequenceNo: meta.sequenceNo,
		},
		select: { id: true },
	});
	return row.id;
}

async function main() {
	/* WARN: destructive demo reset — same production guard as prisma/seed.ts */
	const seedUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "";
	if (
		process.env.OBELISK_SEED_ALLOW_PROD !== "1" &&
		(process.env.NODE_ENV === "production" ||
			/^postgresql:\/\/[^@/]+@db(:\d+)?\//.test(seedUrl))
	) {
		fail("refusing to seed a production database — this script is dev-only.");
	}

	// --- Resolve the reference data `just db-seed` creates -------------------
	const program = await prisma.program.findUnique({
		where: { code: PROGRAM_CODE },
		select: {
			id: true,
			name: true,
			plos: {
				orderBy: { code: "asc" },
				select: { id: true, code: true, description: true },
			},
		},
	});
	if (!program)
		fail(`program '${PROGRAM_CODE}' not found — run 'just db-seed' first.`);

	const courses = await prisma.course.findMany({
		where: {
			programId: program.id,
			code: { in: Object.values(DEMO_COURSE_BY_YEAR) },
		},
		select: { id: true, code: true, title: true },
	});
	const courseByCode = new Map(courses.map((course) => [course.code, course]));
	for (const code of Object.values(DEMO_COURSE_BY_YEAR)) {
		if (!courseByCode.has(code)) {
			fail(`course '${code}' not found — run 'just db-seed' first.`);
		}
	}

	const accounts = await prisma.user.findMany({
		where: { email: { in: Object.values(ACCOUNT_EMAILS) } },
		select: { id: true, email: true, role: true },
	});
	const userIdByRole = new Map(accounts.map((user) => [user.role, user.id]));
	for (const role of Object.keys(ACCOUNT_EMAILS) as Array<
		keyof typeof ACCOUNT_EMAILS
	>) {
		if (!userIdByRole.has(role)) {
			fail(`seeded '${role}' account not found — run 'just db-seed' first.`);
		}
	}
	const facultyId = userIdByRole.get("faculty")!;
	const chairId = userIdByRole.get("program_chair")!;
	const deanId = userIdByRole.get("dean")!;
	const aqauId = userIdByRole.get("aqau")!;
	const vpaaId = userIdByRole.get("vpaa")!;

	// --- Reset only the rows this script owns --------------------------------
	console.log("Resetting previous demo data...");
	// NOTE: clusters restrict their graduation term, so they go before terms.
	await prisma.graduationCluster.deleteMany({
		where: { id: { startsWith: DEMO_PREFIX } },
	});
	await prisma.academicTerm.deleteMany({
		where: { id: { startsWith: DEMO_PREFIX } },
	});
	await prisma.computationRun.deleteMany({
		where: { scope: { contains: DEMO_PREFIX } },
	});
	await prisma.student.deleteMany({
		where: { studentNumber: { startsWith: DEMO_STUDENT_PREFIX } },
	});
	await prisma.uploadRecord.deleteMany({
		where: { id: { startsWith: DEMO_PREFIX } },
	});
	await prisma.auditLog.deleteMany({
		where: { id: { startsWith: DEMO_PREFIX } },
	});
	await prisma.aiRecommendation.deleteMany({
		where: { id: { startsWith: DEMO_PREFIX } },
	});
	await prisma.peo.deleteMany({ where: { id: { startsWith: DEMO_PREFIX } } });

	// --- Academic scaffolding ------------------------------------------------
	console.log("Seeding demo terms, students, CLO mappings and PEOs...");
	await prisma.academicTerm.createMany({
		data: DEMO_TERMS.map((term) => ({ ...term, isActive: false })),
	});
	const latestTerm = DEMO_TERMS[DEMO_TERMS.length - 1];

	await prisma.student.createMany({
		data: DEMO_STUDENTS.map((student) => ({
			id: `${DEMO_PREFIX}student-${student.studentNumber}`,
			studentNumber: student.studentNumber,
			anonymizedId: `${DEMO_PREFIX}anon-${student.studentNumber}`,
			programId: program.id,
			firstName: student.firstName,
			lastName: student.lastName,
			yearLevel: student.yearLevel,
			studentStatus: "active",
		})),
	});

	// CLO1–5 exist for the first course already (prisma/seed.ts); extend every
	// demo course so each cohort has its own CLO set.
	for (const course of courses) {
		for (const code of DEMO_CLO_CODES) {
			const existing = await prisma.clo.findFirst({
				where: { courseId: course.id, code },
				select: { id: true },
			});
			if (existing) {
				await prisma.clo.update({
					where: { id: existing.id },
					data: { description: `${code} for ${course.code} (demo)` },
				});
			} else {
				await prisma.clo.create({
					data: {
						id: crypto.randomUUID(),
						courseId: course.id,
						code,
						description: `${code} for ${course.code} (demo)`,
					},
				});
			}
		}
	}

	const demoClos = await prisma.clo.findMany({
		where: {
			courseId: { in: courses.map((course) => course.id) },
			code: { in: DEMO_CLO_CODES },
		},
		orderBy: [{ courseId: "asc" }, { code: "asc" }],
		select: { id: true, code: true, courseId: true },
	});
	const closByCourse = new Map<string, typeof demoClos>();
	for (const clo of demoClos) {
		const list = closByCourse.get(clo.courseId) ?? [];
		list.push(clo);
		closByCourse.set(clo.courseId, list);
	}

	// CLO→PLO coverage: every CLO maps to two PLOs, cycling all 13 PLOs.
	await prisma.cloToPloMap.deleteMany({
		where: { cloId: { in: demoClos.map((clo) => clo.id) } },
	});
	const stages = ["i", "p", "d"] as const;
	await prisma.cloToPloMap.createMany({
		data: demoClos.flatMap((clo) => {
			const cloIndex = Number(clo.code.replace("CLO", "")) - 1;
			const first = program.plos[cloIndex % program.plos.length];
			const second = program.plos[(cloIndex * 5 + 7) % program.plos.length];
			const heavy = cloIndex % 5 === 0 || cloIndex % 5 === 2 || cloIndex % 5 === 4;
			const mappings: Array<{
				id: string;
				cloId: string;
				ploId: string;
				weight: number;
				stage: "i" | "p" | "d" | null;
			}> = [
				{
					id: crypto.randomUUID(),
					cloId: clo.id,
					ploId: first.id,
					weight: heavy ? 2.0 : 0.3,
					stage: stages[cloIndex % stages.length],
				},
			];
			if (second.id !== first.id) {
				mappings.push({
					id: crypto.randomUUID(),
					cloId: clo.id,
					ploId: second.id,
					weight: heavy ? 2.0 : 0.3,
					stage: null,
				});
			}
			return mappings;
		}),
	});

	// Ensure the PLOs not covered by the per-CLO-code mapping above still have
	// data: map each of them to CLO1 of every demo course (neutral weight).
	const mappedPloIds = new Set(
		program.plos
			.filter((_, i) => [0, 1, 2, 3, 4, 7, 9, 12].includes(i))
			.map((plo) => plo.id),
	);
	const unmappedPlos = program.plos.filter((plo) => !mappedPloIds.has(plo.id));
	const clo1s = demoClos.filter((clo) => clo.code === "CLO1");
	await prisma.cloToPloMap.createMany({
		data: unmappedPlos.flatMap((plo) =>
			clo1s.map((clo) => ({
				id: crypto.randomUUID(),
				cloId: clo.id,
				ploId: plo.id,
				weight: 1,
				stage: null,
			})),
		),
	});

	const peoDefs = [
		"Apply computing knowledge to solve real organizational problems.",
		"Design and deliver reliable IT solutions with professional ethics.",
		"Lead collaborative projects and communicate outcomes effectively.",
		"Pursue continuous learning and adapt to emerging technologies.",
	];
	await prisma.peo.createMany({
		data: peoDefs.map((description, index) => ({
			id: `${DEMO_PREFIX}peo-${index + 1}`,
			programId: program.id,
			code: `PEO${index + 1}`,
			description,
		})),
	});
	const peos = await prisma.peo.findMany({
		where: { programId: program.id, id: { startsWith: DEMO_PREFIX } },
		orderBy: { code: "asc" },
		select: { id: true },
	});
	await prisma.ploToPeoMap.createMany({
		data: program.plos.map((plo, index) => ({
			id: crypto.randomUUID(),
			ploId: plo.id,
			peoId: peos[index % peos.length].id,
		})),
	});
	await prisma.peoAttainment.createMany({
		data: peos.map((peo, index) => ({
			id: `${DEMO_PREFIX}peo-attainment-${index + 1}`,
			peoId: peo.id,
			programId: program.id,
			termId: latestTerm.id,
			attainedPct: 74 + index * 4,
			evidenceJson: { source: "seed-demo" },
		})),
	});

	// --- Class records: runs, ETL snapshots, attainments, at-risk flags ------
	console.log("Persisting demo class records (runs + attainments)...");
	const sectionRuns: Array<{
		sectionId: string;
		termId: string;
		courseId: string;
		runId: string;
	}> = [];
	const assessmentItems: Array<{
		id: string;
		classSectionId: string;
		cloId: string;
		type: "direct" | "indirect";
		title: string;
		maxScore: number;
		weightPct: number;
	}> = [];

	for (const [termIndex, term] of DEMO_TERMS.entries()) {
		for (const yearLevel of [1, 2, 3, 4]) {
			const course = courseByCode.get(DEMO_COURSE_BY_YEAR[yearLevel])!;
			const sectionId = `${DEMO_PREFIX}section-${termIndex + 1}-y${yearLevel}`;
			const students = DEMO_STUDENTS.filter(
				(student) => student.yearLevel === yearLevel,
			);

			await prisma.classSection.create({
				data: {
					id: sectionId,
					courseId: course.id,
					termId: term.id,
					sectionCode: `Y${yearLevel}`,
					facultyId,
				},
			});

			const result = await attainmentService.persistAttainment(
				{
					header: buildHeader({
						courseCode: course.code,
						courseTitle: course.title,
						sectionCode: `Y${yearLevel}`,
						schoolYear: term.schoolYear,
						semester: term.semester,
						studentCount: students.length,
					}),
					attainments: buildAttainments(students, DEMO_CLO_CODES, termIndex),
					clo_plo_mapping: [],
					formula_version: "70_30_v1",
					section_extraction: "missing_sheet",
				},
				sectionId,
				facultyId,
			);
			sectionRuns.push({
				sectionId,
				termId: term.id,
				courseId: course.id,
				runId: result.computationRunId,
			});

			for (const clo of closByCourse.get(course.id) ?? []) {
				for (const type of ["direct", "indirect"] as const) {
					assessmentItems.push({
						id: `${DEMO_PREFIX}item-${termIndex}-${yearLevel}-${clo.code}-${type}`,
						classSectionId: sectionId,
						cloId: clo.id,
						type,
						title: `${type === "direct" ? "Direct" : "Indirect"} assessment — ${clo.code}`,
						maxScore: 100,
						weightPct: 20,
					});
				}
			}
		}
	}
	await prisma.assessmentItem.createMany({ data: assessmentItems });

	// At-risk reasons are one-per-score from the ingest path; group them by CLO
	// so the watchlist donut has a readable five-slice distribution.
	const demoStudentIds = await prisma.student.findMany({
		where: { studentNumber: { startsWith: DEMO_STUDENT_PREFIX } },
		select: { id: true },
	});
	const flags = await prisma.atRiskFlag.findMany({
		where: { studentId: { in: demoStudentIds.map((s) => s.id) } },
		include: { cloAttainment: { select: { clo: { select: { code: true } } } } },
	});
	for (const flag of flags) {
		await prisma.atRiskFlag.update({
			where: { id: flag.id },
			data: {
				reason: `Below 70% on ${flag.cloAttainment?.clo.code ?? "CLO"}`,
			},
		});
	}

	// --- Roll-up submissions (read routes re-derive their payloads) ----------
	console.log("Creating roll-up submissions...");
	for (const run of sectionRuns) {
		await cloSummaryService.ensureDraft(run.sectionId, facultyId, run.runId);
	}
	await ploSummaryService.ensureDraft(program.id, latestTerm.id, chairId);
	await cohortTrackingService.ensureDraft(program.id, chairId, latestTerm.id);

	// --- CQI loop: gap → action plan → closing-the-loop ----------------------
	console.log("Building the CQI loop...");
	const gapDraft = await ploGapAnalysisService.ensureDraft(
		program.id,
		latestTerm.id,
		chairId,
	);
	await ploGapAnalysisService.generate(program.id, latestTerm.id, chairId);
	const gapRows = await prisma.gapRow.findMany({
		where: { ploGapAnalysisId: gapDraft.id },
		orderBy: [{ plo: { code: "asc" } }, { cohortYearLevel: "asc" }],
		select: { id: true },
	});
	for (const [index, gap] of gapRows.entries()) {
		await prisma.gapRow.update({
			where: { id: gap.id },
			data: {
				rootCauseCategory:
					ROOT_CAUSE_CATEGORIES[index % ROOT_CAUSE_CATEGORIES.length],
				rootCauseAnalysis:
					"Demo root-cause analysis linking the gap to instruction and assessment design.",
				namedOwner: "Program Chair",
			},
		});
	}

	const planDraft = await cqiActionPlanService.ensureDraft(
		program.id,
		latestTerm.id,
		chairId,
	);
	await cqiActionPlanService.generate(program.id, latestTerm.id, chairId);
	const cqiEntries = await prisma.cqiEntry.findMany({
		where: { cqiActionPlanId: planDraft.id },
		orderBy: [{ plo: { code: "asc" } }, { cohortYearLevel: "asc" }],
		select: { id: true, priorAttainmentPct: true },
	});
	for (const [index, entry] of cqiEntries.entries()) {
		if (index % 3 === 0) continue; // keep a third in the "planned" phase
		await prisma.cqiEntry.update({
			where: { id: entry.id },
			data: {
				status: "tracked",
				interventionImplemented: index % 3 === 1 ? "yes" : "partial",
				currentAttainmentPct: Math.min(
					96,
					Number(entry.priorAttainmentPct) + 6,
				),
			},
		});
	}

	const ctlDraft = await closingTheLoopService.ensureDraft(
		program.id,
		latestTerm.id,
		chairId,
	);
	await closingTheLoopService.generate(program.id, latestTerm.id, chairId);
	const ctlRows = await prisma.ctlRow.findMany({
		where: { closingTheLoopId: ctlDraft.id },
		orderBy: { id: "asc" },
		select: { id: true, cqiEntryId: true },
	});
	for (const [index, row] of ctlRows.entries()) {
		const variant = index % 3;
		const conditions12Met = variant === 0;
		const condition3Met = variant === 0;
		const condition4Met = variant === 0;
		const condition5Met = variant === 0;
		const interventionImplemented =
			variant === 2 ? "no" : variant === 1 ? "partial" : "yes";
		const interventionImplementedText =
			variant === 2
				? ""
				: "Demo evidence: intervention delivered and reassessed in the next term.";
		await prisma.cqiEntry.update({
			where: { id: row.cqiEntryId },
			data: { interventionImplemented },
		});
		await prisma.ctlRow.update({
			where: { id: row.id },
			data: {
				gapFindingAndEvidence:
					"Demo gap finding: prior attainment below the 70% floor.",
				interventionImplementedText,
				conditions12Met,
				condition3Met,
				condition4Met,
				condition5Met,
				loopStatus: computeLoopStatus({
					conditions12Met,
					condition3Met,
					condition4Met,
					condition5Met,
					interventionImplemented,
					interventionImplementedText,
				}),
			},
		});
	}

	// --- PLAN forms: target matrix + budget ----------------------------------
	console.log("Creating PLAN submissions (targets + budget)...");
	const targetDraft = await targetSettingMatrixService.init(
		program.id,
		latestTerm.id,
		chairId,
	);
	const targetRows = await prisma.ploTargetRow.findMany({
		where: { targetSettingMatrixId: targetDraft.draft.id },
		orderBy: { sortOrder: "asc" },
		select: { id: true },
	});
	for (const [index, row] of targetRows.entries()) {
		await prisma.ploTargetRow.update({
			where: { id: row.id },
			data: {
				y1TargetPct: 72 + (index % 3),
				y2TargetPct: 74 + (index % 4),
				y3TargetPct: 76 + (index % 5),
				y4TargetPct: 78 + (index % 6),
				rationale: "Demo target: at or above the 70% institutional floor.",
			},
		});
	}

	const budgetDraft = await assessmentBudgetService.init(
		program.id,
		latestTerm.id,
		deanId,
	);
	const budgetLines = await prisma.budgetLineItem.findMany({
		where: { assessmentBudgetId: budgetDraft.draft.id },
		orderBy: { id: "asc" },
		select: { id: true },
	});
	for (const [index, line] of budgetLines.entries()) {
		await prisma.budgetLineItem.update({
			where: { id: line.id },
			data: {
				estimatedCost: 15000 + index * 3500,
				approvedCost: index % 3 === 0 ? null : 12000 + index * 3000,
				source: index % 4 === 0 ? null : "dean",
			},
		});
	}

	// --- Governance: mixed-status filings + approval chains ------------------
	console.log("Creating mixed-status submissions and approval chains...");
	for (const [index, item] of MIXED_SUBMISSIONS.entries()) {
		const formTypeId = await ensureFormType(item.code);
		const route = approvalRouteFor(item.code);
		const { steps, currentApproverRole } = approvalStepsFor(
			route.chain,
			item.status,
		);
		const submissionId = `${DEMO_PREFIX}submission-${index + 1}`;
		const createdAt = daysAgo(MIXED_SUBMISSIONS.length - index);

		await prisma.formSubmission.create({
			data: {
				id: submissionId,
				formTypeId,
				programId: program.id,
				termId: latestTerm.id,
				submittedByUserId: userIdByRole.get(item.preparer)!,
				status: item.status,
				currentApproverRole: currentApproverRole as ApproverRole | null,
				formData: {
					header: {
						program: program.name,
						term: `${latestTerm.schoolYear} ${latestTerm.semester}`,
						preparedBy: item.preparer,
					},
				},
				createdAt,
				updatedAt: createdAt,
				approvalSteps: {
					create: steps.map((step, stepIndex) => ({
						id: `${DEMO_PREFIX}step-${index + 1}-${stepIndex + 1}`,
						approverRole: step.approverRole as ApproverRole,
						sequenceNo: stepIndex + 1,
						approverUserId:
							step.decision === "pending"
								? null
								: (userIdByRole.get(step.approverRole as UserRole) ?? null),
						decision: step.decision,
						comment:
							step.decision === "returned"
								? "Demo: please attach the CLO-PLO validation evidence."
								: null,
						decidedAt:
							step.decision === "pending"
								? null
								: daysAgo(MIXED_SUBMISSIONS.length - index - stepIndex * 0.5),
					})),
				},
			},
		});
	}

	// --- Faculty ingest history + computation-run chart ----------------------
	const latestRuns = sectionRuns.filter((run) => run.termId === latestTerm.id);
	const completedRun = latestRuns[0];
	await prisma.uploadRecord.createMany({
		data: [
			{
				id: `${DEMO_PREFIX}upload-1`,
				userId: facultyId,
				classSectionId: completedRun.sectionId,
				filename: "class-record-demo-y1.xlsx",
				status: "completed",
				computationRunId: completedRun.runId,
				summary: { studentsProcessed: 6, cloAttainmentsCreated: 30 },
				createdAt: daysAgo(4),
			},
			{
				id: `${DEMO_PREFIX}upload-2`,
				userId: facultyId,
				classSectionId: latestRuns[1]?.sectionId ?? completedRun.sectionId,
				filename: "class-record-demo-y2.xlsx",
				status: "failed",
				error: "Workbook verification failed: section code mismatch.",
				createdAt: daysAgo(3),
			},
			{
				id: `${DEMO_PREFIX}upload-3`,
				userId: facultyId,
				classSectionId: latestRuns[2]?.sectionId ?? completedRun.sectionId,
				filename: "class-record-demo-y3.xlsx",
				status: "discarded",
				createdAt: daysAgo(2),
			},
			{
				id: `${DEMO_PREFIX}upload-4`,
				userId: facultyId,
				classSectionId: latestRuns[3]?.sectionId ?? completedRun.sectionId,
				filename: "class-record-demo-y4.xlsx",
				status: "queued",
				createdAt: daysAgo(1),
			},
		],
	});

	// --- Audit waterfall, AI statuses, graduation cluster --------------------
	console.log("Creating audit logs, AI recommendations and archive cluster...");
	await prisma.auditLog.createMany({
		data: [
			["form_submission.created", "forms"],
			["form_submission.submitted", "forms"],
			["form_submission.approved", "forms"],
			["class_record.persisted", "ingest"],
			["clo_attainment_summary.generated", "rollup"],
			["plo_gap_analysis.generated", "cqi"],
			["assessment_budget.saved", "plan"],
			["curriculum_map.saved", "plan"],
		].map(([action, moduleAffected], index) => ({
			id: `${DEMO_PREFIX}audit-${index + 1}`,
			userId: index % 2 === 0 ? chairId : facultyId,
			action,
			moduleAffected,
			targetRecordId: `${DEMO_PREFIX}submission-${(index % MIXED_SUBMISSIONS.length) + 1}`,
			details: { source: "seed-demo" },
			createdAt: daysAgo(index + 1),
		})),
	});

	await prisma.aiRecommendation.createMany({
		data: (
			["pending_review", "acknowledged", "actioned", "dismissed"] as const
		).map((status, index) => ({
			id: `${DEMO_PREFIX}ai-${index + 1}`,
			programId: null,
			termId: null,
			ploId: null,
			summary: "Demo institutional CQI summary.",
			recommendationText:
				"Demo recommendation: strengthen assessment design for the lowest-attaining CLOs.",
			sourceDataSnapshot: { source: "seed-demo" },
			status,
			reviewedByUserId: status === "pending_review" ? null : vpaaId,
			reviewedAt: status === "pending_review" ? null : daysAgo(index),
			generatedAt: daysAgo(index + 2),
		})),
	});

	const cluster = await prisma.graduationCluster.create({
		data: {
			id: `${DEMO_PREFIX}cluster`,
			programId: program.id,
			graduationTermId: DEMO_TERMS[1].id,
			label: `${program.name} ${DEMO_TERMS[1].schoolYear} graduation cluster (demo)`,
			status: "archived",
			stats: { totalStudents: 4 },
			confirmedByUserId: aqauId,
			confirmedAt: daysAgo(30),
			compiledAt: daysAgo(28),
			archivedAt: daysAgo(27),
		},
		select: { id: true },
	});
	const graduating = DEMO_STUDENTS.filter(
		(student) => student.yearLevel === 4,
	).slice(0, 4);
	await prisma.graduationClusterEntry.createMany({
		data: graduating.map((student, index) => ({
			id: `${DEMO_PREFIX}cluster-entry-${index + 1}`,
			clusterId: cluster.id,
			studentId: `${DEMO_PREFIX}student-${student.studentNumber}`,
			anonymizedId: `${DEMO_PREFIX}anon-${student.studentNumber}`,
			studentStatusAtArchive: (
				["graduated", "transferee", "withdrawn", "transferred_out"] as const
			)[index],
			isGraduationEntry: index === 0,
			graduatedAt: index === 0 ? daysAgo(60) : null,
			compiledData: { source: "seed-demo" },
			peoAttainment: {},
		})),
	});

	console.log("\nDemo seed finished.");
	console.log(`  program: ${program.name} (${program.id})`);
	console.log(`  terms: ${DEMO_TERMS.length}, sections: ${sectionRuns.length}`);
	console.log(
		`  students: ${DEMO_STUDENTS.length}, attainment rows: ${sectionRuns.length * 6 * DEMO_CLO_CODES.length}`,
	);
	console.log(
		`  gap rows: ${gapRows.length}, CQI entries: ${cqiEntries.length}, CTL rows: ${ctlRows.length}`,
	);
	console.log(
		"\nNOTE: the PLO attainment chart calls python-server on read — run the stack with `just dev` (not `just dev-backend`).",
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
