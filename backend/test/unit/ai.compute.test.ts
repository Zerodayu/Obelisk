import { describe, expect, it } from "bun:test";
import type { AnalyticsSummaryResponse } from "@lib/ingest/ingest-client";
import {
	buildSubmission,
	hasAnalyzableSnapshot,
	toRecommendationPayload,
	worstFromAnalyticsSummary,
	worstFromStoredSummary,
} from "@v1/ai/compute";

const META = {
	sectionCode: "3A",
	courseCode: "IT-101",
	programName: "BSIT",
	departmentName: "CITE",
};

function snapshot(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		header: { course_code: "IT-101", section: "3A" },
		attainments: [{ student_name: "A", clo_code: "CLO1" }],
		clo_plo_mapping: [{ clo_code: "CLO1", plo_code: "PLO1" }],
		...overrides,
	};
}

describe("buildSubmission", () => {
	it("enriches the snapshot with department and program", () => {
		const submission = buildSubmission(META, snapshot());
		expect(submission.department).toBe("CITE");
		expect(submission.program).toBe("BSIT");
		expect(submission.course_code).toBe("IT-101");
		expect(submission.section).toBe("3A");
		expect(submission.clo_plo_mapping).toHaveLength(1);
	});

	it("falls back to DB values when the header omits course/section", () => {
		const submission = buildSubmission(META, snapshot({ header: {} }));
		expect(submission.course_code).toBe("IT-101");
		expect(submission.section).toBe("3A");
	});

	it("treats a malformed clo_plo_mapping as empty", () => {
		const submission = buildSubmission(
			META,
			snapshot({ clo_plo_mapping: "not-an-array" }),
		);
		expect(submission.clo_plo_mapping).toEqual([]);
	});
});

describe("hasAnalyzableSnapshot", () => {
	it("accepts snapshots with attainment rows", () => {
		expect(hasAnalyzableSnapshot(snapshot())).toBe(true);
	});

	it("rejects null, non-arrays, and empty attainment lists", () => {
		expect(hasAnalyzableSnapshot(null)).toBe(false);
		expect(hasAnalyzableSnapshot({ header: {} })).toBe(false);
		expect(hasAnalyzableSnapshot(snapshot({ attainments: [] }))).toBe(false);
	});
});

function analyticsSummary(
	overrides: Partial<AnalyticsSummaryResponse> = {},
): AnalyticsSummaryResponse {
	return {
		period: { type: "semester", label: "2092-2093 1st" },
		department_summary: {},
		program_summary: {},
		avp_group_summary: {},
		worst_performing_clos: [],
		...overrides,
	};
}

describe("worstFromAnalyticsSummary", () => {
	it("maps python rows and converts 0-1 fractions to percent points", () => {
		const rows = worstFromAnalyticsSummary(
			analyticsSummary({
				worst_performing_clos: [
					{
						group_name: "Program",
						key: "BSIT",
						clo_code: "CLO2",
						mean_attainment_pct: 0.525,
						record_count: 12,
					},
				],
			}),
		);
		expect(rows).toEqual([
			{
				groupName: "Program",
				key: "BSIT",
				cloCode: "CLO2",
				meanAttainmentPct: 52.5,
				recordCount: 12,
			},
		]);
	});

	it("skips malformed rows and tolerates a missing list", () => {
		const withJunk = worstFromAnalyticsSummary(
			analyticsSummary({
				worst_performing_clos: [
					null,
					{ key: "BSIT" },
					{ clo_code: "CLO1", key: "BSIT" },
				] as AnalyticsSummaryResponse["worst_performing_clos"],
			}),
		);
		expect(withJunk).toHaveLength(1);
		expect(worstFromAnalyticsSummary(undefined)).toEqual([]);
		expect(worstFromAnalyticsSummary(null)).toEqual([]);
	});
});

describe("worstFromStoredSummary", () => {
	it("round-trips rows written as compact JSON", () => {
		const rows = [
			{
				groupName: "Department",
				key: "CITE",
				cloCode: "CLO4",
				meanAttainmentPct: 61.2,
				recordCount: 3,
			},
		];
		expect(
			worstFromStoredSummary(JSON.stringify({ worstPerformingClos: rows })),
		).toEqual(rows);
	});

	it("returns no gaps for plain-text or malformed stored summaries", () => {
		expect(worstFromStoredSummary("not json")).toEqual([]);
		expect(worstFromStoredSummary("{}")).toEqual([]);
		expect(
			worstFromStoredSummary(
				JSON.stringify({ worstPerformingClos: [{ cloCode: "CLO1" }] }),
			),
		).toEqual([]);
	});
});

describe("toRecommendationPayload", () => {
	it("projects a stored row into the client payload", () => {
		const payload = toRecommendationPayload({
			id: "rec-1",
			summary: JSON.stringify({
				worstPerformingClos: [
					{
						groupName: "Program",
						key: "BSIT",
						cloCode: "CLO2",
						meanAttainmentPct: 52.5,
						recordCount: 12,
					},
				],
			}),
			recommendationText: "## Summary\nDo the thing.",
			sourceDataSnapshot: {
				period: { type: "semester", label: "2092-2093 1st" },
				summary: analyticsSummary(),
				promptUsed: "prompt",
			},
			status: "pending_review",
			generatedAt: new Date("2026-09-27T00:00:00.000Z"),
			term: { schoolYear: "2092-2093", semester: "1st" },
		});

		expect(payload.id).toBe("rec-1");
		expect(payload.generatedAt).toBe("2026-09-27T00:00:00.000Z");
		expect(payload.status).toBe("pending_review");
		expect(payload.period).toEqual({
			type: "semester",
			label: "2092-2093 1st",
		});
		expect(payload.term?.schoolYear).toBe("2092-2093");
		expect(payload.recommendationText).toContain("Do the thing.");
		expect(payload.worstPerformingClos).toHaveLength(1);
	});

	it("nulls the period when the snapshot has none", () => {
		const payload = toRecommendationPayload({
			id: "rec-2",
			summary: "{}",
			recommendationText: "text",
			sourceDataSnapshot: null,
			status: "pending_review",
			generatedAt: new Date("2026-09-27T00:00:00.000Z"),
			term: null,
		});
		expect(payload.period).toBeNull();
		expect(payload.term).toBeNull();
		expect(payload.worstPerformingClos).toEqual([]);
	});
});
