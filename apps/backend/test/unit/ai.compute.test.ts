import { describe, expect, it } from "bun:test";

import type { AnalyticsSummaryResponse } from "@lib/ingest/ingest-client";
import {
	buildSectionAlignment,
	buildSubmission,
	hasAnalyzableSnapshot,
	type SectionAlignment,
	toRecommendationPayload,
	withAlignment,
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

	// NOTE: the snapshot can never carry mappings (extractor.py returns []),
	// so the DB rows passed in via meta must win.
	it("prefers the DB mapping passed in the meta over the snapshot copy", () => {
		const submission = buildSubmission(
			{
				...META,
				cloPloMapping: [
					{
						clo_code: "CLO1",
						plo_code: "PLO1",
						correlation_strength: 1,
					},
					{
						clo_code: "CLO2",
						plo_code: "PLO1",
						correlation_strength: 1,
					},
				],
			},
			snapshot(),
		);
		expect(submission.clo_plo_mapping).toHaveLength(2);
		expect(submission.clo_plo_mapping).toEqual([
			{ clo_code: "CLO1", plo_code: "PLO1", correlation_strength: 1 },
			{ clo_code: "CLO2", plo_code: "PLO1", correlation_strength: 1 },
		]);
	});

	it("falls back to the snapshot mapping when the meta carries none", () => {
		const submission = buildSubmission(
			{ ...META, cloPloMapping: [] },
			snapshot(),
		);
		expect(submission.clo_plo_mapping).toEqual([
			{ clo_code: "CLO1", plo_code: "PLO1" },
		]);
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
		expect(payload.alignmentContext).toEqual([]);
	});

	it("reads the alignment block back out of the snapshot", () => {
		const payload = toRecommendationPayload({
			id: "rec-3",
			summary: "{}",
			recommendationText: "text",
			sourceDataSnapshot: {
				period: { type: "semester", label: "2092-2093 1st" },
				alignmentContext: [
					{
						courseCode: "IT-101",
						section: "3A",
						cloCode: "CLO1",
						bloomsLevel: "Analyze",
						ipdStage: "i",
						assessmentTypes: ["Exam"],
					},
					{ cloCode: "CLO2" },
				],
			},
			status: "pending_review",
			generatedAt: new Date("2026-09-27T00:00:00.000Z"),
			term: null,
		});
		expect(payload.alignmentContext).toHaveLength(1);
		expect(payload.alignmentContext[0]?.bloomsLevel).toBe("Analyze");
	});
});

describe("withAlignment", () => {
	const alignment: SectionAlignment = {
		courseCode: "IT-101",
		section: "3A",
		clos: {
			CLO1: {
				bloomsLevel: "Analyze",
				ipdStage: "i",
				assessmentTypes: ["Exam", "Rubric"],
			},
		},
	};

	it("attaches Bloom's / I-P-D / assessments to each mapping entry", () => {
		const { mapping, rows } = withAlignment(
			[{ clo_code: "CLO1", plo_code: "PLO1", correlation_strength: 1 }],
			alignment,
		);

		expect(mapping).toEqual([
			{
				clo_code: "CLO1",
				plo_code: "PLO1",
				correlation_strength: 1,
				blooms_level: "Analyze",
				ipd_stage: "i",
				assessment_types: ["Exam", "Rubric"],
			},
		]);
		expect(rows).toEqual([
			{
				courseCode: "IT-101",
				section: "3A",
				cloCode: "CLO1",
				bloomsLevel: "Analyze",
				ipdStage: "i",
				assessmentTypes: ["Exam", "Rubric"],
			},
		]);
	});

	it("leaves the mapping untouched when the section has no alignment", () => {
		const mapping = [{ clo_code: "CLO1", plo_code: "PLO1" }];
		expect(withAlignment(mapping, undefined)).toEqual({ mapping, rows: [] });
	});

	// NOTE: an entry without plo_code would KeyError python's PLO rollup, so
	// an unmapped-but-aligned CLO is emitted as context only.
	it("emits a context row for an aligned CLO that has no PLO mapping", () => {
		const { mapping, rows } = withAlignment([], {
			courseCode: "IT-101",
			section: "3A",
			clos: {
				CLO9: { bloomsLevel: "Create", ipdStage: "d", assessmentTypes: [] },
			},
		});

		expect(mapping).toEqual([]);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.cloCode).toBe("CLO9");
		expect(rows[0]?.bloomsLevel).toBe("Create");
	});
});

describe("buildSectionAlignment", () => {
	it("seeds I-P-D from CloToPloMap and lets saved Part 1 win", () => {
		const alignment = buildSectionAlignment({
			courseCode: "IT-101",
			section: "3A",
			carFormData: {
				part1: {
					cloPloMapping: [
						{
							cloCode: "CLO1",
							bloomsLevel: "Analyze",
							ipdStage: "d",
							assessmentTypes: ["Rubric"],
						},
					],
				},
			},
			stageRows: [
				{ cloCode: "CLO1", stage: "i" },
				{ cloCode: "CLO2", stage: "p" },
			],
		});

		expect(alignment.clos.CLO1).toEqual({
			bloomsLevel: "Analyze",
			ipdStage: "d",
			assessmentTypes: ["Rubric"],
		});
		// NOTE: Bloom's has no DB source at all — stage-only rows stay null.
		expect(alignment.clos.CLO2).toEqual({
			bloomsLevel: null,
			ipdStage: "p",
			assessmentTypes: [],
		});
	});

	it("drops entries that carry no signal", () => {
		const alignment = buildSectionAlignment({
			courseCode: "IT-101",
			section: "3A",
			carFormData: { part1: { cloPloMapping: [{ cloCode: "CLO1" }] } },
			stageRows: [{ cloCode: "CLO2", stage: null }],
		});

		expect(alignment.clos).toEqual({});
	});

	it("tolerates a submission with no saved formData", () => {
		const alignment = buildSectionAlignment({
			courseCode: "IT-101",
			section: "3A",
			carFormData: null,
			stageRows: [],
		});

		expect(alignment.clos).toEqual({});
		expect(alignment.section).toBe("3A");
	});
});
