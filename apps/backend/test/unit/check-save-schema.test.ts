import { describe, expect, it } from "bun:test";
import type { TSchema } from "@sinclair/typebox";
import {
	SaveCapstonePanelEvaluationSchema,
	SaveCloPerceptionSurveySchema,
	SaveExhibitionFeedbackSchema,
	SaveStudentExitSurveySchema,
} from "@v1/check/model";
import { Elysia } from "elysia";

/**
 * POST `body` through a throwaway Elysia route carrying the real save schema,
 * so the check runs against the same body validator the API uses.
 */
async function saveStatus(schema: TSchema, body: unknown): Promise<number> {
	const app = new Elysia().post("/", () => "ok", { body: schema });
	const res = await app.handle(
		new Request("http://localhost/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
	return res.status;
}

/* NOTE: get() serves null for untouched notes/flags and the form screens
 * round-trip that null on save — reject it and every first save 422s
 * ("Expected string but found: null"), which reads as "the form is broken". */
describe("check save schemas accept null for nullable fields", () => {
	it("F12 clo_perception_survey: divergenceNotes nullable", async () => {
		expect(
			await saveStatus(SaveCloPerceptionSurveySchema, {
				cloRows: [],
				divergenceNotes: null,
			}),
		).toBe(200);
		expect(
			await saveStatus(SaveCloPerceptionSurveySchema, {
				cloRows: [],
				divergenceNotes: "diverges from direct attainment",
			}),
		).toBe(200);
		// wrong type must still be rejected
		expect(
			await saveStatus(SaveCloPerceptionSurveySchema, {
				cloRows: [],
				divergenceNotes: 42,
			}),
		).not.toBe(200);
	});

	it("F17 student_exit_survey: notes/themes nullable", async () => {
		expect(
			await saveStatus(SaveStudentExitSurveySchema, {
				ploRows: [],
				divergenceInvestigationNotes: null,
				qualitativeThemes: null,
			}),
		).toBe(200);
		expect(await saveStatus(SaveStudentExitSurveySchema, { ploRows: [] })).toBe(
			200,
		);
		expect(
			await saveStatus(SaveStudentExitSurveySchema, {
				ploRows: [],
				qualitativeThemes: 7,
			}),
		).not.toBe(200);
	});

	it("F15 exhibition_feedback: qualitativeFeedback nullable", async () => {
		expect(
			await saveStatus(SaveExhibitionFeedbackSchema, {
				guests: [],
				qualitativeFeedback: null,
			}),
		).toBe(200);
		expect(
			await saveStatus(SaveExhibitionFeedbackSchema, {
				guests: [],
				qualitativeFeedback: 5,
			}),
		).not.toBe(200);
	});

	it("F19 capstone_panel_evaluation: declaration/flag nullable", async () => {
		expect(
			await saveStatus(SaveCapstonePanelEvaluationSchema, {
				panelistRows: [],
				programReadinessDeclaration: null,
				cqiActionRequired: null,
			}),
		).toBe(200);
		expect(
			await saveStatus(SaveCapstonePanelEvaluationSchema, {
				panelistRows: [],
				programReadinessDeclaration: 12,
			}),
		).not.toBe(200);
	});
});
