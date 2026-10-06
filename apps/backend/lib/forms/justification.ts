/**
 * Pedagogical justification for the approval screen: Bloom's Taxonomy, I-P-D
 * stage and assessment evidence as read-only text, so an approver signs off on
 * alignment instead of raw numbers (system-docs/testing_results §2).
 *
 * Registry pattern like `submit-gates.ts` / `approval-effects.ts` — the
 * generic forms service stays form-agnostic and each feature module registers
 * the resolver for its stable form code at module load. An unregistered code
 * returns null and the screen shows its empty state.
 */

/** I-P-D stage letters, spelled out the way the manual does (I/P/D). */
export const IPD_STAGE_LABELS: Record<string, string> = {
	i: "Introduction",
	p: "Proficiency",
	d: "Demonstration",
};

/** One CLO's alignment row, taken from the assembled form payload. */
export interface JustificationRow {
	cloCode: string;
	ploCode: string | null;
	bloomsLevel: string | null;
	ipdStage: string | null;
	assessmentTypes: string[] | null;
	weightInGradePct: number | null;
}

/** One CLO × assessment-type attainment figure (CAR Part 2). */
export interface AssessmentEvidenceRow {
	cloCode: string;
	assessmentType: string;
	attainmentPct: number | null;
	belowBenchmark: boolean | null;
}

export interface SubmissionJustification {
	kind: "car" | "curriculum_map";
	/** CAR: one row per CLO. Empty for curriculum_map. */
	rows: JustificationRow[];
	/** CAR: Part 2 attainment per assessment type. Empty for curriculum_map. */
	assessmentEvidence: AssessmentEvidenceRow[];
	/** curriculum_map: mapped cells per I-P-D stage. Null for CAR. */
	coverage: {
		i: number;
		p: number;
		d: number;
		unstaged: number;
		courses: number;
	} | null;
	/** curriculum_map: PLOs with no D-stage cell (Coverage Check misses). */
	uncoveredPlos: string[];
	/** Plain-language lines rendered above the table. */
	notes: string[];
}

/** What a resolver is handed — the same record `evidence()` already loaded. */
export interface JustificationContext {
	submissionId: string;
	classSectionId: string | null;
	formData: Record<string, unknown>;
}

export type JustificationResolver = (
	ctx: JustificationContext,
) => Promise<SubmissionJustification | null>;

const resolvers = new Map<string, JustificationResolver>();

/** Register the justification resolver for a stable form code. */
export function registerJustification(
	formTypeCode: string,
	resolver: JustificationResolver,
): void {
	resolvers.set(formTypeCode, resolver);
}

/**
 * Resolve the justification for a form code. Returns null when nothing is
 * registered — never throws, so a broken resolver cannot fail the whole
 * evidence endpoint (the approver still sees the capture counters).
 */
export async function resolveJustification(
	formTypeCode: string,
	ctx: JustificationContext,
): Promise<SubmissionJustification | null> {
	const resolve = resolvers.get(formTypeCode);
	if (!resolve) return null;
	try {
		return (await resolve(ctx)) ?? null;
	} catch (error) {
		// NOTE: justification is supplementary context, never the payload
		// itself — a broken resolver must not fail the whole evidence read.
		console.error(
			`[Forms] Justification resolver failed for '${formTypeCode}':`,
			error,
		);
		return null;
	}
}

// --- Pure builders (unit-tested without a DB) -------------------------------

type CarMappingRowLike = {
	cloCode: string;
	ploCode?: string | null;
	bloomsLevel?: string | null;
	ipdStage?: string | null;
	assessmentTypes?: string[] | null;
	weightInGradePct?: number | null;
};

type CarAssessmentRowLike = {
	cloCode: string;
	attainmentPct?: number | null;
	belowBenchmark?: boolean | null;
};

/** Structural shape of `CarPayload` the builder reads — lib stays import-free. */
export interface CarJustificationPayload {
	part1?: { cloPloMapping?: CarMappingRowLike[] } | null;
	part2?: {
		composite?: CarAssessmentRowLike[];
		exams?: CarAssessmentRowLike[];
		rubric?: CarAssessmentRowLike[];
		perfTasks?: CarAssessmentRowLike[];
		portfolio?: CarAssessmentRowLike[];
	} | null;
}

/**
 * Part 2 group key → the label the card renders. `composite` leads because it
 * is the only group the v2 class-record template populates (the four
 * instrument columns are always null — python-server KNOWN_LIMITATIONS #4).
 */
const ASSESSMENT_GROUP_LABELS: Array<{
	key: "composite" | "exams" | "rubric" | "perfTasks" | "portfolio";
	label: string;
}> = [
	{ key: "composite", label: "Composite (70/30)" },
	{ key: "exams", label: "Exam" },
	{ key: "rubric", label: "Rubric" },
	{ key: "perfTasks", label: "Perf.Task" },
	{ key: "portfolio", label: "Portfolio" },
];

/**
 * One plain-language line an approver can read without decoding columns.
 *
 * When a field is null the clause names *where* it gets recorded rather than
 * just reporting the gap — "not recorded" alone reads like a broken feature
 * when the data simply has not been entered yet.
 */
function carNote(row: JustificationRow): string {
	const parts: string[] = [row.cloCode];
	if (row.ploCode) parts.push(`mapped to ${row.ploCode}`);
	parts.push(
		row.bloomsLevel
			? `assessed at ${row.bloomsLevel} level`
			: "Bloom's level not yet recorded (set it in CAR Part 1)",
	);
	const stage = row.ipdStage
		? IPD_STAGE_LABELS[row.ipdStage.toLowerCase()]
		: null;
	parts.push(
		stage
			? `${stage} (${row.ipdStage?.toUpperCase()}) stage`
			: "I-P-D stage not yet recorded (set it on a CLO-PLO connection)",
	);
	if (row.assessmentTypes?.length) {
		parts.push(`evidence: ${row.assessmentTypes.join(", ")}`);
	} else {
		parts.push("assessment types not yet recorded (set them in CAR Part 1)");
	}
	if (row.weightInGradePct != null) {
		parts.push(`${row.weightInGradePct}% of course grade`);
	}
	return `${parts.join(" · ")}.`;
}

/**
 * Build the CAR justification from the assembled payload (saved P1 edits →
 * DB `CloToPloMap` → null), i.e. exactly what the approver sees on the form
 * screen — not the raw `formData`, which is empty until Part 1 is saved.
 */
export function carJustification(
	payload: CarJustificationPayload,
): SubmissionJustification {
	const rows: JustificationRow[] = (payload.part1?.cloPloMapping ?? []).map(
		(row) => ({
			cloCode: row.cloCode,
			ploCode: row.ploCode ?? null,
			bloomsLevel: row.bloomsLevel ?? null,
			ipdStage: row.ipdStage ?? null,
			assessmentTypes: row.assessmentTypes ?? null,
			weightInGradePct: row.weightInGradePct ?? null,
		}),
	);

	const assessmentEvidence: AssessmentEvidenceRow[] = [];
	const part2 = payload.part2;
	if (part2) {
		for (const group of ASSESSMENT_GROUP_LABELS) {
			for (const row of part2[group.key] ?? []) {
				assessmentEvidence.push({
					cloCode: row.cloCode,
					assessmentType: group.label,
					attainmentPct: row.attainmentPct ?? null,
					belowBenchmark: row.belowBenchmark ?? null,
				});
			}
		}
	}

	return {
		kind: "car",
		rows,
		assessmentEvidence,
		coverage: null,
		uncoveredPlos: [],
		notes: rows.map(carNote),
	};
}

/** Structural shape of the curriculum-map course rows the builder reads. */
export interface CurriculumJustificationPayload {
	courses: Array<{
		courseCode: string;
		cells: Array<{ ploCode: string; stage?: string | null }>;
	}>;
	/** Coverage Check from `plan/compute.ts` — true when a PLO has a D cell. */
	coverageCheck: Record<string, boolean>;
}

/**
 * Build the curriculum-map justification: I-P-D coverage counts plus the PLOs
 * that still lack a D-stage cell. NOTE: curriculum maps carry no Bloom's
 * source anywhere in the DB — the UI says so rather than showing an empty
 * column.
 */
export function curriculumJustification(
	payload: CurriculumJustificationPayload,
): SubmissionJustification {
	const coverage = {
		i: 0,
		p: 0,
		d: 0,
		unstaged: 0,
		courses: payload.courses.length,
	};
	for (const course of payload.courses) {
		for (const cell of course.cells) {
			const stage = (cell.stage ?? "").toLowerCase();
			if (stage === "i" || stage === "p" || stage === "d") coverage[stage] += 1;
			else coverage.unstaged += 1;
		}
	}

	const uncoveredPlos = Object.entries(payload.coverageCheck)
		.filter(([, covered]) => !covered)
		.map(([ploCode]) => ploCode)
		.sort();

	const mapped = coverage.i + coverage.p + coverage.d;
	const notes = [
		`${coverage.courses} courses · ${mapped + coverage.unstaged} mapped cells — ` +
			`${coverage.i} Introduction, ${coverage.p} Proficiency, ` +
			`${coverage.d} Demonstration, ${coverage.unstaged} unstaged.`,
	];
	if (uncoveredPlos.length) {
		notes.push(
			`No D-stage course yet for ${uncoveredPlos.join(", ")} — Coverage Check incomplete.`,
		);
	}

	return {
		kind: "curriculum_map",
		rows: [],
		assessmentEvidence: [],
		coverage,
		uncoveredPlos,
		notes,
	};
}
