import type {
	AnalyticsCourseSubmission,
	AnalyticsSubmissionsPayload,
	EtlSnapshot,
	InstitutionalSummaryResponse,
} from "@lib/ingest/ingest-client";
import { ingestClient } from "@lib/ingest/ingest-client";
import { prisma } from "@lib/prisma";
import type { Prisma } from "@prisma/generated/prisma/client";
import {
	type AiRecommendationPayload,
	buildSubmission,
	hasAnalyzableSnapshot,
	type SectionMeta,
	toRecommendationPayload,
	worstFromAnalyticsSummary,
} from "./compute";

// --- Errors ----------------------------------------------------------------

/** 409 — no persisted class records to feed the AI for the target term. */
export class AiNoDataError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AiNoDataError";
	}
}

/** 404 — the requested term does not exist. */
export class AiTermNotFoundError extends Error {
	constructor(termId: string) {
		super(`Academic term '${termId}' not found`);
		this.name = "AiTermNotFoundError";
	}
}

// --- Fetcher (injectable for tests) ----------------------------------------

export type InstitutionalSummaryFetcher = (
	payload: AnalyticsSubmissionsPayload,
) => Promise<InstitutionalSummaryResponse>;

const defaultFetcher: InstitutionalSummaryFetcher = (payload) =>
	ingestClient.institutionalSummary(payload);

interface TermRef {
	id: string;
	schoolYear: string;
	semester: string;
}

// --- Service ---------------------------------------------------------------

/**
 * AI CQI recommendations: replays stored ETL snapshots
 * (`ComputationRun.etlSnapshotJson`) into python-server's
 * `/analytics/institutional-summary` and persists each result as an
 * `AiRecommendation` row (status `pending_review`).
 *
 * Data flow: upload → persist (`etlSnapshotJson`) → this service → python
 * rollups + LLM → `ai_recommendation` → frontend drawer. The python-server
 * stays the compute engine; this layer only assembles payloads and stores
 * results (see python-server AGENTS.md ownership table).
 */
export class AiRecommendationService {
	constructor(
		private readonly fetchSummary: InstitutionalSummaryFetcher = defaultFetcher,
	) {}

	/** 404-safe term lookup for an explicit `termId`. */
	private async requireTerm(termId: string): Promise<TermRef> {
		const term = await prisma.academicTerm.findUnique({
			where: { id: termId },
			select: { id: true, schoolYear: true, semester: true },
		});
		if (!term) throw new AiTermNotFoundError(termId);
		return term;
	}

	/**
	 * Candidate terms, newest first — start date is authoritative, the
	 * schoolYear/semester strings are a lexical tie-break. NOTE: `nulls: "last"`
	 * matters — Postgres otherwise sorts undated terms first on DESC.
	 */
	private async candidateTerms(): Promise<TermRef[]> {
		return prisma.academicTerm.findMany({
			orderBy: [
				{ startDate: { sort: "desc", nulls: "last" } },
				{ schoolYear: "desc" },
				{ semester: "desc" },
			],
			select: { id: true, schoolYear: true, semester: true },
		});
	}

	/**
	 * Assemble the `/analytics/institutional-summary` payload for one term.
	 * Returns null when the term has no usable snapshots (caller walks to the
	 * next candidate term).
	 */
	private async payloadForTerm(
		term: TermRef,
	): Promise<AnalyticsSubmissionsPayload | null> {
		const sections = await prisma.classSection.findMany({
			where: { termId: term.id },
			select: {
				id: true,
				sectionCode: true,
				course: {
					select: {
						code: true,
						program: {
							select: {
								name: true,
								department: { select: { name: true } },
							},
						},
					},
				},
			},
		});
		if (!sections.length) return null;

		// One query for every section's runs, newest first; first-wins per scope.
		const runs = await prisma.computationRun.findMany({
			where: { scope: { in: sections.map((section) => section.id) } },
			orderBy: { runAt: "desc" },
			select: { scope: true, etlSnapshotJson: true },
		});
		const latestSnapshot = new Map<string, EtlSnapshot>();
		for (const run of runs) {
			if (!hasAnalyzableSnapshot(run.etlSnapshotJson)) continue;
			if (!latestSnapshot.has(run.scope)) {
				latestSnapshot.set(run.scope, run.etlSnapshotJson);
			}
		}
		if (!latestSnapshot.size) return null;

		const submissions: AnalyticsCourseSubmission[] = [];
		for (const section of sections) {
			const snapshot = latestSnapshot.get(section.id);
			if (!snapshot) continue;
			const meta: SectionMeta = {
				sectionCode: section.sectionCode,
				courseCode: section.course.code,
				programName: section.course.program.name,
				departmentName: section.course.program.department.name,
			};
			submissions.push(buildSubmission(meta, snapshot));
		}

		return {
			period: {
				type: "semester",
				label: `${term.schoolYear} ${term.semester}`,
			},
			submissions,
		};
	}

	/**
	 * Resolve the target term (explicit id, else newest with persisted class
	 * records) and build the python payload. Throws `AiNoDataError` when no
	 * candidate term has analyzable snapshots.
	 */
	async buildPayload(
		termId?: string,
	): Promise<{ payload: AnalyticsSubmissionsPayload; term: TermRef }> {
		const terms = termId
			? [await this.requireTerm(termId)]
			: await this.candidateTerms();

		for (const term of terms) {
			const payload = await this.payloadForTerm(term);
			if (payload) return { payload, term };
		}

		throw new AiNoDataError(
			termId
				? `No persisted class records found for term '${termId}'. Upload a class record first.`
				: "No persisted class records found in any academic term. Upload a class record first.",
		);
	}

	/** Generate + persist a fresh recommendation for the target term. */
	async generate(termId?: string): Promise<AiRecommendationPayload> {
		const { payload, term } = await this.buildPayload(termId);
		const response = await this.fetchSummary(payload);

		const row = await prisma.aiRecommendation.create({
			data: {
				id: crypto.randomUUID(),
				termId: term.id,
				// Compact display rows; the full rollup lives in the snapshot below.
				summary: JSON.stringify({
					worstPerformingClos: worstFromAnalyticsSummary(response.summary),
				}),
				recommendationText: response.recommendation,
				sourceDataSnapshot: {
					promptUsed: response.prompt_used,
					summary: response.summary,
					period: response.summary.period,
					// NOTE: Prisma's InputJsonValue needs an index signature the
					// response interface can't carry — same cast as the ETL snapshot.
				} as unknown as Prisma.InputJsonValue,
				status: "pending_review",
			},
			include: { term: { select: { schoolYear: true, semester: true } } },
		});
		return toRecommendationPayload(row);
	}

	/**
	 * Newest persisted recommendation (or null). Intentionally NOT wrapped in
	 * `cached()` — a generate POST must be visible on the next drawer open,
	 * and a single-row read is cheap.
	 */
	async latest(): Promise<AiRecommendationPayload | null> {
		const row = await prisma.aiRecommendation.findFirst({
			orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
			include: { term: { select: { schoolYear: true, semester: true } } },
		});
		return row ? toRecommendationPayload(row) : null;
	}
}

export const aiRecommendationService = new AiRecommendationService();
