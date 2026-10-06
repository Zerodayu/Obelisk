import type {
	AnalyticsCourseSubmission,
	AnalyticsSummaryResponse,
	EtlSnapshot,
} from "@lib/ingest/ingest-client";

// --- Payload building (pure) -----------------------------------------------

/** Section identity + org names needed to feed python-server. */
export interface SectionMeta {
	sectionCode: string;
	courseCode: string;
	programName: string;
	departmentName: string;
	/**
	 * CLO→PLO mappings shaped for python-server (`{ clo_code, plo_code,
	 * correlation_strength }`); empty falls back to the snapshot copy, which
	 * `extractor.py` permanently returns as `[]`.
	 */
	cloPloMapping?: Record<string, unknown>[];
}

/**
 * Map a persisted ETL snapshot onto python-server's course-submission shape.
 * The workbook header wins over the DB values for `course_code`/`section`
 * (the uploaded class record is the source of truth), same as the rollup
 * payload builder in `src/v1/rollup/service.ts`.
 */
export function buildSubmission(
	meta: SectionMeta,
	snapshot: EtlSnapshot,
): AnalyticsCourseSubmission {
	const header = (snapshot.header ?? {}) as Record<string, unknown>;
	const fromSnapshot = Array.isArray(snapshot.clo_plo_mapping)
		? snapshot.clo_plo_mapping
		: [];
	return {
		department: meta.departmentName,
		program: meta.programName,
		course_code: (header.course_code as string) ?? meta.courseCode,
		section: (header.section as string) ?? meta.sectionCode,
		header,
		attainments: snapshot.attainments,
		clo_plo_mapping: meta.cloPloMapping?.length
			? meta.cloPloMapping
			: fromSnapshot,
	};
}

/** Does this stored snapshot have rows worth feeding to the AI? */
export function hasAnalyzableSnapshot(
	snapshot: unknown,
): snapshot is EtlSnapshot {
	const candidate = snapshot as EtlSnapshot | null;
	return (
		candidate != null &&
		Array.isArray(candidate.attainments) &&
		candidate.attainments.length > 0
	);
}

// --- Pedagogical alignment (Bloom's / I-P-D / assessments) ----------------

/** Per-CLO alignment read from the section's latest CAR Part 1. */
export interface CloAlignment {
	bloomsLevel: string | null;
	ipdStage: string | null;
	assessmentTypes: string[];
}

/** One section's alignment keyed by CLO code, plus the identity it needs. */
export interface SectionAlignment {
	courseCode: string;
	section: string;
	clos: Record<string, CloAlignment>;
}

/** One alignment row — the drawer block and the prompt's context share it. */
export interface AlignmentContextRow extends CloAlignment {
	courseCode: string;
	section: string;
	cloCode: string;
}

/**
 * Fold a section's alignment into the CLO→PLO entries python receives
 * (`blooms_level` / `ipd_stage` / `assessment_types`) and return the same
 * rows as drawer-ready context.
 *
 * NOTE: alignment is per section, never global — `_generic_aggregator` merges
 * CLOs by bare code across every course in a group, so a shared map would
 * attribute one course's Bloom's level to another's CLO.
 *
 * NOTE: CLOs with alignment but no PLO mapping are emitted as context rows
 * only — adding them to `clo_plo_mapping` without a `plo_code` would KeyError
 * python's `compute_plo_attainment`.
 */
export function withAlignment(
	mapping: Record<string, unknown>[],
	alignment: SectionAlignment | undefined | null,
): { mapping: Record<string, unknown>[]; rows: AlignmentContextRow[] } {
	if (!alignment) return { mapping, rows: [] };

	const rows: AlignmentContextRow[] = [];
	const covered = new Set<string>();
	const aligned = mapping.map((entry) => {
		const cloCode = typeof entry.clo_code === "string" ? entry.clo_code : "";
		const clos = alignment.clos[cloCode];
		if (!clos) return entry;
		covered.add(cloCode);
		rows.push({
			courseCode: alignment.courseCode,
			section: alignment.section,
			cloCode,
			...clos,
		});
		return {
			...entry,
			blooms_level: clos.bloomsLevel,
			ipd_stage: clos.ipdStage,
			assessment_types: clos.assessmentTypes,
		};
	});

	for (const [cloCode, clos] of Object.entries(alignment.clos)) {
		if (covered.has(cloCode)) continue;
		rows.push({
			courseCode: alignment.courseCode,
			section: alignment.section,
			cloCode,
			...clos,
		});
	}

	return { mapping: aligned, rows };
}

/**
 * Assemble one section's alignment: `CloToPloMap.stage` is the floor (it
 * exists even when faculty never saved Part 1), the saved CAR Part 1 then
 * overlays Bloom's / I-P-D / assessment types on top.
 *
 * NOTE: entries carrying no signal at all are dropped — an empty "not
 * recorded" row tells neither the approver nor the LLM anything.
 */
export function buildSectionAlignment(input: {
	courseCode: string;
	section: string;
	carFormData: unknown;
	stageRows: Array<{ cloCode: string; stage: string | null }>;
}): SectionAlignment {
	const clos: Record<string, CloAlignment> = {};
	for (const row of input.stageRows) {
		if (!row.stage) continue;
		clos[row.cloCode] = {
			bloomsLevel: null,
			ipdStage: row.stage,
			assessmentTypes: [],
		};
	}

	const part1 = (
		input.carFormData as { part1?: { cloPloMapping?: unknown } } | null
	)?.part1;
	const saved = Array.isArray(part1?.cloPloMapping) ? part1.cloPloMapping : [];
	for (const raw of saved) {
		if (raw == null || typeof raw !== "object") continue;
		const entry = raw as {
			cloCode?: unknown;
			bloomsLevel?: unknown;
			ipdStage?: unknown;
			assessmentTypes?: unknown;
		};
		if (typeof entry.cloCode !== "string") continue;
		const base = clos[entry.cloCode] ?? {
			bloomsLevel: null,
			ipdStage: null,
			assessmentTypes: [],
		};
		clos[entry.cloCode] = {
			bloomsLevel:
				typeof entry.bloomsLevel === "string" && entry.bloomsLevel
					? entry.bloomsLevel
					: base.bloomsLevel,
			ipdStage:
				typeof entry.ipdStage === "string" && entry.ipdStage
					? entry.ipdStage
					: base.ipdStage,
			assessmentTypes: Array.isArray(entry.assessmentTypes)
				? entry.assessmentTypes.filter(
						(type): type is string => typeof type === "string",
					)
				: base.assessmentTypes,
		};
	}

	for (const [code, alignment] of Object.entries(clos)) {
		if (
			!alignment.bloomsLevel &&
			!alignment.ipdStage &&
			alignment.assessmentTypes.length === 0
		) {
			delete clos[code];
		}
	}

	return { courseCode: input.courseCode, section: input.section, clos };
}

// --- Worst-performing CLO mapping (pure) -----------------------------------

/** One critical CLO row rendered in the drawer's "key gaps" block. */
export interface WorstPerformingClo {
	/** Aggregation level python grouped by: "Department" | "Program" | "AVP Group". */
	groupName: string;
	/** Group value (department/program/AVP name). */
	key: string;
	cloCode: string;
	/** Mean attainment in percent points (0–100), one decimal. */
	meanAttainmentPct: number;
	recordCount: number;
}

/** Python's `mean_attainment_pct` is a 0–1 fraction; display wants percent. */
function toPct(fraction: unknown): number {
	return typeof fraction === "number" ? Math.round(fraction * 1000) / 10 : 0;
}

/**
 * Map python's `worst_performing_clos` (snake_case, 0–1 fractions) onto the
 * compact camelCase rows stored in `AiRecommendation.summary`. Tolerates a
 * malformed/absent list — the AI panel must never hard-fail on bad rollups.
 */
export function worstFromAnalyticsSummary(
	summary: AnalyticsSummaryResponse | null | undefined,
): WorstPerformingClo[] {
	const raw = summary?.worst_performing_clos;
	if (!Array.isArray(raw)) return [];

	return raw.flatMap((item) => {
		if (
			item == null ||
			typeof item !== "object" ||
			typeof item.clo_code !== "string" ||
			typeof item.key !== "string"
		) {
			return [];
		}
		return [
			{
				groupName: String((item as { group_name?: unknown }).group_name ?? ""),
				key: item.key,
				cloCode: item.clo_code,
				meanAttainmentPct: toPct(item.mean_attainment_pct),
				recordCount:
					typeof item.record_count === "number" ? item.record_count : 0,
			},
		];
	});
}

/** Read the compact rows back out of the `AiRecommendation.summary` column. */
export function worstFromStoredSummary(stored: string): WorstPerformingClo[] {
	try {
		const parsed = JSON.parse(stored) as { worstPerformingClos?: unknown };
		if (!Array.isArray(parsed.worstPerformingClos)) return [];
		return parsed.worstPerformingClos.filter(
			(row): row is WorstPerformingClo =>
				row != null &&
				typeof row === "object" &&
				typeof (row as WorstPerformingClo).cloCode === "string" &&
				typeof (row as WorstPerformingClo).key === "string",
		);
	} catch {
		// NOTE: legacy/manual rows may hold a plain string — show no gaps block.
		return [];
	}
}

// --- Stored row → client payload (pure) ------------------------------------

export type AiRecommendationStatus =
	| "pending_review"
	| "acknowledged"
	| "actioned"
	| "dismissed";

/** Client-facing view of an `AiRecommendation` row. */
export interface AiRecommendationPayload {
	id: string;
	generatedAt: string;
	status: AiRecommendationStatus | string;
	/** Analysis period label (e.g. "2025-2026 1st"), from the source snapshot. */
	period: { type: string; label: string } | null;
	/** Term the rollup was computed against, when linked. */
	term: { schoolYear: string; semester: string } | null;
	/** Markdown recommendation text (LLM output or its debug stub). */
	recommendationText: string;
	/** Critical CLOs from the pure-data rollup — real numbers, no LLM needed. */
	worstPerformingClos: WorstPerformingClo[];
	/**
	 * Per-course CLO alignment (Bloom's / I-P-D / assessment types) behind the
	 * recommendation, so the drawer can justify the numbers. Empty for rows
	 * generated before this field existed.
	 */
	alignmentContext: AlignmentContextRow[];
}

/** Structural shape of the Prisma row this mapper consumes. */
export interface StoredRecommendation {
	id: string;
	summary: string;
	recommendationText: string;
	sourceDataSnapshot: unknown;
	status: string;
	generatedAt: Date;
	term: { schoolYear: string; semester: string } | null;
}

function periodFromSnapshot(snapshot: unknown): {
	type: string;
	label: string;
} | null {
	const period = (snapshot as { period?: unknown } | null)?.period;
	if (period == null || typeof period !== "object") return null;
	const { type, label } = period as { type?: unknown; label?: unknown };
	if (typeof label !== "string") return null;
	return { type: typeof type === "string" ? type : "semester", label };
}

/** Read the alignment block back out of the stored `sourceDataSnapshot`. */
export function alignmentFromStoredSnapshot(
	snapshot: unknown,
): AlignmentContextRow[] {
	const raw = (snapshot as { alignmentContext?: unknown } | null)
		?.alignmentContext;
	if (!Array.isArray(raw)) return [];
	return raw.filter(
		(row): row is AlignmentContextRow =>
			row != null &&
			typeof row === "object" &&
			typeof (row as AlignmentContextRow).cloCode === "string" &&
			typeof (row as AlignmentContextRow).courseCode === "string",
	);
}

export function toRecommendationPayload(
	row: StoredRecommendation,
): AiRecommendationPayload {
	return {
		id: row.id,
		generatedAt:
			row.generatedAt instanceof Date
				? row.generatedAt.toISOString()
				: new Date(row.generatedAt).toISOString(),
		status: row.status,
		period: periodFromSnapshot(row.sourceDataSnapshot),
		term: row.term,
		recommendationText: row.recommendationText,
		worstPerformingClos: worstFromStoredSummary(row.summary),
		alignmentContext: alignmentFromStoredSnapshot(row.sourceDataSnapshot),
	};
}
