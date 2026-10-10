import type {
	AnalyticsCourseSubmission,
	AnalyticsSubmissionsPayload,
	EtlSnapshot,
	InstitutionalSummaryResponse,
} from "@lib/ingest/ingest-client";
import { ingestClient } from "@lib/ingest/ingest-client";
import { prisma } from "@lib/prisma";
import { aiRecommendationUnitWhere, type UnitScope } from "@lib/unit-scope";
import type { Prisma } from "@prisma/generated/prisma/client";

import {
	type AiRecommendationPayload,
	type AlignmentContextRow,
	buildSectionAlignment,
	buildSubmission,
	hasAnalyzableSnapshot,
	type SectionAlignment,
	type SectionMeta,
	toRecommendationPayload,
	withAlignment,
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
	 * Assemble the `/analytics/institutional-summary` payload for one term,
	 * plus the per-course alignment rows the prompt and drawer both read.
	 * Returns null when the term has no usable snapshots (caller walks to the
	 * next candidate term).
	 */
	private async payloadForTerm(term: TermRef): Promise<{
		payload: AnalyticsSubmissionsPayload;
		alignment: AlignmentContextRow[];
	} | null> {
		const sections = await prisma.classSection.findMany({
			where: { termId: term.id },
			select: {
				id: true,
				sectionCode: true,
				course: {
					select: {
						id: true,
						code: true,
						program: {
							select: {
								id: true,
								name: true,
								department: { select: { name: true } },
							},
						},
					},
				},
			},
		});
		if (!sections.length) return null;

		// NOTE: snapshot clo_plo_mapping is permanently []; load CloToPloMap per program.
		const programIds = [
			...new Set(sections.map((section) => section.course.program.id)),
		];
		const maps = await prisma.cloToPloMap.findMany({
			where: {
				plo: { programId: { in: programIds } },
				clo: { course: { programId: { in: programIds } } },
			},
			select: {
				weight: true,
				stage: true,
				plo: { select: { programId: true, code: true } },
				// NOTE: keyed by course, not just code — CLO codes repeat across
				// every course in a program.
				clo: { select: { code: true, courseId: true } },
			},
		});
		const mappingByProgramId = new Map<string, Record<string, unknown>[]>();
		const stageByCourseId = new Map<string, Map<string, string>>();
		for (const map of maps) {
			const entry = {
				clo_code: map.clo.code,
				plo_code: map.plo.code,
				correlation_strength: Number(map.weight),
			};
			const bucket = mappingByProgramId.get(map.plo.programId) ?? [];
			bucket.push(entry);
			mappingByProgramId.set(map.plo.programId, bucket);

			// NOTE: a CLO may map to several PLOs — first non-null stage wins.
			if (!map.stage) continue;
			const stages =
				stageByCourseId.get(map.clo.courseId) ?? new Map<string, string>();
			if (!stages.has(map.clo.code)) stages.set(map.clo.code, map.stage);
			stageByCourseId.set(map.clo.courseId, stages);
		}

		// NOTE: latest CAR per section regardless of status — same "newest
		// wins" rule as the ETL snapshot. Part 1 only holds Bloom's / I-P-D /
		// assessment types once faculty have saved it.
		const cars = await prisma.formSubmission.findMany({
			where: {
				formType: { code: "course_assessment_report" },
				classSectionId: { in: sections.map((section) => section.id) },
			},
			orderBy: { createdAt: "desc" },
			select: { classSectionId: true, formData: true },
		});
		const carBySectionId = new Map<string, unknown>();
		for (const car of cars) {
			if (car.classSectionId && !carBySectionId.has(car.classSectionId)) {
				carBySectionId.set(car.classSectionId, car.formData);
			}
		}

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
		const alignment: AlignmentContextRow[] = [];
		for (const section of sections) {
			const snapshot = latestSnapshot.get(section.id);
			if (!snapshot) continue;
			const meta: SectionMeta = {
				sectionCode: section.sectionCode,
				courseCode: section.course.code,
				programName: section.course.program.name,
				departmentName: section.course.program.department.name,
				cloPloMapping: mappingByProgramId.get(section.course.program.id),
			};
			const submission = buildSubmission(meta, snapshot);

			// NOTE: applied after `buildSubmission` so the alignment survives
			// whichever mapping source won (DB rows or the snapshot copy).
			const sectionAlignment: SectionAlignment = buildSectionAlignment({
				courseCode: section.course.code,
				section: section.sectionCode,
				carFormData: carBySectionId.get(section.id),
				stageRows: [...(stageByCourseId.get(section.course.id) ?? [])].map(
					([cloCode, stage]) => ({ cloCode, stage }),
				),
			});
			const folded = withAlignment(
				submission.clo_plo_mapping,
				sectionAlignment,
			);
			submission.clo_plo_mapping = folded.mapping;
			alignment.push(...folded.rows);

			submissions.push(submission);
		}

		return {
			payload: {
				period: {
					type: "semester",
					label: `${term.schoolYear} ${term.semester}`,
				},
				submissions,
			},
			alignment,
		};
	}

	/**
	 * Resolve the target term (explicit id, else newest with persisted class
	 * records) and build the python payload. Throws `AiNoDataError` when no
	 * candidate term has analyzable snapshots.
	 */
	async buildPayload(termId?: string): Promise<{
		payload: AnalyticsSubmissionsPayload;
		term: TermRef;
		alignment: AlignmentContextRow[];
	}> {
		const terms = termId
			? [await this.requireTerm(termId)]
			: await this.candidateTerms();

		for (const term of terms) {
			const result = await this.payloadForTerm(term);
			if (result) return { ...result, term };
		}

		throw new AiNoDataError(
			termId
				? `No persisted class records found for term '${termId}'. Upload a class record first.`
				: "No persisted class records found in any academic term. Upload a class record first.",
		);
	}

	/** Generate + persist a fresh recommendation for the target term. */
	async generate(termId?: string): Promise<AiRecommendationPayload> {
		const { payload, term, alignment } = await this.buildPayload(termId);
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
					// Bloom's / I-P-D / assessment evidence behind the numbers —
					// what the drawer's "Pedagogical context" block renders.
					alignmentContext: alignment,
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
	 *
	 * `unit` filters it: a recommendation's `sourceDataSnapshot` carries the
	 * whole institution's rollup, and `generate()` stores institution-wide rows
	 * (`programId = null`) — so only institution-wide roles get a payload back;
	 * a program/department-scoped caller only ever receives recommendations
	 * filed under a program of its own unit (403 never, just `null`).
	 */
	async latest(unit: UnitScope): Promise<AiRecommendationPayload | null> {
		const row = await prisma.aiRecommendation.findFirst({
			where: aiRecommendationUnitWhere(unit),
			orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
			include: { term: { select: { schoolYear: true, semester: true } } },
		});
		return row ? toRecommendationPayload(row) : null;
	}

	/**
	 * `GET /ai/recommendations/status-counts` — the review-status distribution
	 * across the caller's unit (the donut the system-admin dashboard charts).
	 *
	 * `latest()` answers "what is the newest one?", which is a different
	 * question from "how many sit in each status". Unit-scoped exactly like
	 * `latest()`: `generate()` stores institution-wide rows (`programId =
	 * null`), so only institution-wide roles have anything to count.
	 * `cached(300)` — the counts move when someone reviews a recommendation,
	 * which is rare enough that a 5-minute staleness window is acceptable.
	 */
	async statusCounts(
		unit: UnitScope,
	): Promise<{ status: string; count: number }[]> {
		const rows = await prisma.aiRecommendation.groupBy({
			by: ["status"],
			where: aiRecommendationUnitWhere(unit),
			_count: { _all: true },
		});
		return rows.map((row) => ({ status: row.status, count: row._count._all }));
	}
}

export const aiRecommendationService = new AiRecommendationService();
