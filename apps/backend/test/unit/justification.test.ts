import { describe, expect, it } from "bun:test";
import {
	carJustification,
	curriculumJustification,
	IPD_STAGE_LABELS,
	registerJustification,
	resolveJustification,
} from "@lib/forms/justification";

describe("carJustification", () => {
	it("reads Part 1 alignment into rows and prose notes", () => {
		const justification = carJustification({
			part1: {
				cloPloMapping: [
					{
						cloCode: "CLO1",
						ploCode: "PLO3",
						bloomsLevel: "Analyze",
						ipdStage: "i",
						assessmentTypes: ["Exam", "Rubric"],
						weightInGradePct: 45,
					},
				],
			},
		});

		expect(justification.kind).toBe("car");
		expect(justification.rows).toEqual([
			{
				cloCode: "CLO1",
				ploCode: "PLO3",
				bloomsLevel: "Analyze",
				ipdStage: "i",
				assessmentTypes: ["Exam", "Rubric"],
				weightInGradePct: 45,
			},
		]);
		expect(justification.notes).toEqual([
			"CLO1 · mapped to PLO3 · assessed at Analyze level · Introduction (I) stage · evidence: Exam, Rubric · 45% of course grade.",
		]);
	});

	it("spells each I-P-D stage out instead of showing a bare letter", () => {
		expect(IPD_STAGE_LABELS).toEqual({
			i: "Introduction",
			p: "Proficiency",
			d: "Demonstration",
		});

		const note = (stage: string) =>
			carJustification({
				part1: { cloPloMapping: [{ cloCode: "CLO1", ipdStage: stage }] },
			}).notes[0];

		expect(note("p")).toContain("Proficiency (P) stage");
		expect(note("d")).toContain("Demonstration (D) stage");
	});

	it("says what is missing and where to record it, not just empty columns", () => {
		const justification = carJustification({
			part1: { cloPloMapping: [{ cloCode: "CLO2" }] },
		});

		expect(justification.notes).toEqual([
			"CLO2 · Bloom's level not yet recorded (set it in CAR Part 1) · I-P-D stage not yet recorded (set it on a CLO-PLO connection) · assessment types not yet recorded (set them in CAR Part 1).",
		]);
	});

	it("flattens Part 2 into assessment-evidence rows under the form's labels", () => {
		const justification = carJustification({
			part2: {
				// Composite leads — it is the only group the v2 template fills.
				composite: [
					{ cloCode: "CLO1", attainmentPct: 81, belowBenchmark: false },
				],
				exams: [
					{
						cloCode: "CLO1",
						attainmentPct: 62,
						belowBenchmark: true,
					},
				],
				rubric: [{ cloCode: "CLO1", attainmentPct: 88, belowBenchmark: false }],
				perfTasks: [{ cloCode: "CLO2", attainmentPct: null }],
				portfolio: [],
			},
		});

		expect(justification.assessmentEvidence).toEqual([
			{
				cloCode: "CLO1",
				assessmentType: "Composite (70/30)",
				attainmentPct: 81,
				belowBenchmark: false,
			},
			{
				cloCode: "CLO1",
				assessmentType: "Exam",
				attainmentPct: 62,
				belowBenchmark: true,
			},
			{
				cloCode: "CLO1",
				assessmentType: "Rubric",
				attainmentPct: 88,
				belowBenchmark: false,
			},
			{
				cloCode: "CLO2",
				assessmentType: "Perf.Task",
				attainmentPct: null,
				belowBenchmark: null,
			},
		]);
		// NOTE: Part 2 carries no P1 alignment — notes stay Part 1's job.
		expect(justification.notes).toEqual([]);
	});

	it("stays empty on a payload that has not been filled in yet", () => {
		const justification = carJustification({});
		expect(justification.rows).toEqual([]);
		expect(justification.assessmentEvidence).toEqual([]);
		expect(justification.coverage).toBeNull();
		expect(justification.notes).toEqual([]);
	});
});

describe("curriculumJustification", () => {
	it("counts cells per stage and reports PLOs with no D-stage course", () => {
		const justification = curriculumJustification({
			courses: [
				{
					courseCode: "CS101",
					cells: [
						{ ploCode: "PLO1", stage: "i" },
						{ ploCode: "PLO2", stage: "p" },
					],
				},
				{
					courseCode: "CS102",
					cells: [
						{ ploCode: "PLO1", stage: "d" },
						{ ploCode: "PLO3", stage: null },
					],
				},
			],
			coverageCheck: { PLO1: true, PLO2: false, PLO3: false },
		});

		expect(justification.kind).toBe("curriculum_map");
		expect(justification.coverage).toEqual({
			i: 1,
			p: 1,
			d: 1,
			unstaged: 1,
			courses: 2,
		});
		expect(justification.uncoveredPlos).toEqual(["PLO2", "PLO3"]);
		expect(justification.notes).toEqual([
			"2 courses · 4 mapped cells — 1 Introduction, 1 Proficiency, 1 Demonstration, 1 unstaged.",
			"No D-stage course yet for PLO2, PLO3 — Coverage Check incomplete.",
		]);
		// NOTE: curriculum maps carry no Bloom's source anywhere in the DB.
		expect(justification.rows).toEqual([]);
	});

	it("omits the coverage warning when every PLO reaches stage D", () => {
		const justification = curriculumJustification({
			courses: [
				{ courseCode: "CS101", cells: [{ ploCode: "PLO1", stage: "d" }] },
			],
			coverageCheck: { PLO1: true },
		});

		expect(justification.uncoveredPlos).toEqual([]);
		expect(justification.notes).toHaveLength(1);
	});
});

describe("resolveJustification", () => {
	const ctx = {
		submissionId: "sub-1",
		classSectionId: "sec-1",
		formData: {},
	};

	it("returns null for a form code with no registered resolver", async () => {
		expect(await resolveJustification("no_such_form_code", ctx)).toBeNull();
	});

	it("returns whatever the registered resolver produced", async () => {
		registerJustification("test_justification_probe", async () => ({
			kind: "car",
			rows: [
				{
					cloCode: "CLO9",
					ploCode: null,
					bloomsLevel: "Create",
					ipdStage: "d",
					assessmentTypes: null,
					weightInGradePct: null,
				},
			],
			assessmentEvidence: [],
			coverage: null,
			uncoveredPlos: [],
			notes: ["CLO9."],
		}));

		const justification = await resolveJustification(
			"test_justification_probe",
			ctx,
		);
		expect(justification?.rows[0]?.bloomsLevel).toBe("Create");
	});

	it("degrades to null when a resolver throws", async () => {
		registerJustification("test_justification_throws", async () => {
			throw new Error("no computation run");
		});

		expect(
			await resolveJustification("test_justification_throws", ctx),
		).toBeNull();
	});
});
