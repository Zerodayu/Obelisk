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
	return {
		department: meta.departmentName,
		program: meta.programName,
		course_code: (header.course_code as string) ?? meta.courseCode,
		section: (header.section as string) ?? meta.sectionCode,
		header,
		attainments: snapshot.attainments,
		clo_plo_mapping: Array.isArray(snapshot.clo_plo_mapping)
			? snapshot.clo_plo_mapping
			: [],
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
	};
}
