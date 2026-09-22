import { cached } from "@lib/cache";
import { authPlugin } from "@v1/auth/controller";
import { Elysia, t } from "elysia";
import { MissingRationaleError, TargetBelowFloorError } from "./compute";
import {
	CloToPloMapInputSchema,
	CreatePloSchema,
	PlanInitSchema,
	PlanListQuerySchema,
	SaveAssessmentBudgetSchema,
	SaveAssessmentCalendarSchema,
	SaveCurriculumMapSchema,
	SaveTargetSettingMatrixSchema,
	UpdateCloToPloMapSchema,
	UpdatePloSchema,
} from "./model";
import {
	assessmentBudgetService,
	assessmentCalendarService,
	CloToPloMapDuplicateError,
	CloToPloMapNotFoundError,
	CloToPloMapSourceNotFoundError,
	cloToPloMapService,
	curriculumMapService,
	listPlanSubmissions,
	PlanInvalidEditError,
	PlanSourceNotFoundError,
	PlanSubmissionNotFoundError,
	PlanTemplateProtectedError,
	PloDuplicateError,
	PloInUseError,
	PloNotFoundError,
	PloSourceNotFoundError,
	ploService,
	targetSettingMatrixService,
} from "./service";

const SECURITY = {
	security: [{ bearerAuth: [] as string[], apiKeyCookie: [] as string[] }],
};

function mapPlanErrors(
	error: unknown,
	set: { status?: string | number },
): unknown {
	if (error instanceof PlanSubmissionNotFoundError) {
		set.status = 404;
		return { error: error.message };
	}
	if (error instanceof CloToPloMapNotFoundError) {
		set.status = 404;
		return { error: error.message };
	}
	if (error instanceof PlanTemplateProtectedError) {
		set.status = 403;
		return { error: error.message };
	}
	if (error instanceof PloNotFoundError) {
		set.status = 404;
		return { error: error.message };
	}
	if (
		error instanceof PlanInvalidEditError ||
		error instanceof PlanSourceNotFoundError ||
		error instanceof TargetBelowFloorError ||
		error instanceof MissingRationaleError ||
		error instanceof CloToPloMapSourceNotFoundError ||
		error instanceof PloSourceNotFoundError ||
		error instanceof PloDuplicateError ||
		error instanceof PloInUseError
	) {
		set.status = 409;
		return { error: error.message };
	}
	if (error instanceof CloToPloMapDuplicateError) {
		set.status = 409;
		return { error: error.message };
	}
	throw error;
}

export const planPlugin = new Elysia({
	prefix: "/plan",
	name: "plan",
	tags: ["PLAN / Setup Forms"],
})
	.use(authPlugin)
	// --- curriculum_map (F01) -------------------------------------------------
	.get(
		"/curriculum-map",
		cached(60, async ({ query }) =>
			listPlanSubmissions("curriculum_map", { programId: query.programId }),
		),
		{
			auth: true,
			query: PlanListQuerySchema,
			detail: {
				summary: "List curriculum map submissions",
				description: "Optionally filtered by program; newest first.",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/curriculum-map/init",
		async ({ body, user, set }) => {
			try {
				return await curriculumMapService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		},
		{
			auth: true,
			body: PlanInitSchema,
			detail: {
				summary: "Open (or reuse) a curriculum map draft",
				description:
					"Find-or-creates the draft submission for the program + term and returns the assembled payload with the computed Coverage Check row.",
				...SECURITY,
				responses: {
					200: { description: "Draft id + assembled payload" },
					401: { description: "Unauthorized" },
					404: { description: "Program not found" },
				},
			},
		},
	)
	.get(
		"/curriculum-map/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await curriculumMapService.get(params.id);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get an assembled curriculum map by submission id",
				...SECURITY,
				responses: {
					200: { description: "Assembled payload" },
					401: { description: "Unauthorized" },
					404: { description: "Submission not found" },
				},
			},
		},
	)
	.put(
		"/curriculum-map/:id",
		async ({ params, body, user, set }) => {
			try {
				return await curriculumMapService.save(params.id, user.id, body);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		},
		{
			auth: true,
			body: SaveCurriculumMapSchema,
			detail: {
				summary: "Save the curriculum map (PLO directory + I-P-D matrix)",
				description:
					"Full replacement of the PLO directory rows and course/matrix rows; recomputes the Coverage Check row. Only allowed while draft or returned.",
				...SECURITY,
				responses: {
					200: { description: "Saved payload" },
					401: { description: "Unauthorized" },
					404: { description: "Submission not found" },
					409: { description: "Submission not editable" },
				},
			},
		},
	)
	// --- assessment_calendar (F03) ---------------------------------------------
	.get(
		"/assessment-calendar",
		cached(60, async ({ query }) =>
			listPlanSubmissions("assessment_calendar", {
				programId: query.programId,
			}),
		),
		{
			auth: true,
			query: PlanListQuerySchema,
			detail: {
				summary: "List assessment calendar submissions",
				description: "Optionally filtered by program; newest first.",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/assessment-calendar/init",
		async ({ body, user, set }) => {
			try {
				return await assessmentCalendarService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		},
		{
			auth: true,
			body: PlanInitSchema,
			detail: {
				summary: "Open an assessment calendar draft with seeded templates",
				description:
					"Seeds the 17 institution-mandated template rows (9 Semester 1, 8 Annual/Semester 2). Templates are editable but non-deletable.",
				...SECURITY,
				responses: {
					200: { description: "Draft id + assembled payload" },
					401: { description: "Unauthorized" },
					404: { description: "Program not found" },
				},
			},
		},
	)
	.get(
		"/assessment-calendar/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await assessmentCalendarService.get(params.id);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get an assembled assessment calendar by submission id",
				...SECURITY,
				responses: {
					200: { description: "Assembled payload" },
					401: { description: "Unauthorized" },
					404: { description: "Submission not found" },
				},
			},
		},
	)
	.put(
		"/assessment-calendar/:id",
		async ({ params, body, user, set }) => {
			try {
				return await assessmentCalendarService.save(params.id, user.id, body);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		},
		{
			auth: true,
			body: SaveAssessmentCalendarSchema,
			detail: {
				summary:
					"Save calendar rows (edit dates, add/remove program-specific events)",
				description:
					"Patches existing rows by id and inserts new program-specific rows. Template rows cannot be removed.",
				...SECURITY,
				responses: {
					200: { description: "Saved payload" },
					401: { description: "Unauthorized" },
					403: { description: "Attempt to delete a template row" },
					404: { description: "Submission or row not found" },
					409: { description: "Submission not editable" },
				},
			},
		},
	)
	// --- target_setting_matrix (F04) ----------------------------------------------
	.get(
		"/target-setting-matrix",
		cached(60, async ({ query }) =>
			listPlanSubmissions("target_setting_matrix", {
				programId: query.programId,
			}),
		),
		{
			auth: true,
			query: PlanListQuerySchema,
			detail: {
				summary: "List target-setting matrix submissions",
				description: "Optionally filtered by program; newest first.",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/target-setting-matrix/init",
		async ({ body, user, set }) => {
			try {
				return await targetSettingMatrixService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		},
		{
			auth: true,
			body: PlanInitSchema,
			detail: {
				summary: "Open a target-setting matrix draft seeded from program PLOs",
				description:
					"One PLO row per program PLO, all targets defaulted to the 70% floor; returns the computed Program PLO Avg row.",
				...SECURITY,
				responses: {
					200: { description: "Draft id + assembled payload" },
					401: { description: "Unauthorized" },
					404: { description: "Program not found" },
				},
			},
		},
	)
	.get(
		"/target-setting-matrix/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await targetSettingMatrixService.get(params.id);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get an assembled target-setting matrix by submission id",
				...SECURITY,
				responses: {
					200: { description: "Assembled payload" },
					401: { description: "Unauthorized" },
					404: { description: "Submission not found" },
				},
			},
		},
	)
	.put(
		"/target-setting-matrix/:id",
		async ({ params, body, user, set }) => {
			try {
				return await targetSettingMatrixService.save(params.id, user.id, body);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		},
		{
			auth: true,
			body: SaveTargetSettingMatrixSchema,
			detail: {
				summary: "Save PLO/CLO targets (>=70% hard floor enforced)",
				description:
					"Full replacement of both row sets. Every target must be >= 70%; rationale is required for any target above the floor.",
				...SECURITY,
				responses: {
					200: { description: "Saved payload" },
					401: { description: "Unauthorized" },
					404: { description: "Submission not found" },
					409: {
						description:
							"Submission not editable, target below floor, or missing rationale",
					},
				},
			},
		},
	)
	// --- assessment_budget (F06) ------------------------------------------------------
	.get(
		"/assessment-budget",
		cached(60, async ({ query }) =>
			listPlanSubmissions("assessment_budget", { programId: query.programId }),
		),
		{
			auth: true,
			query: PlanListQuerySchema,
			detail: {
				summary: "List assessment budget submissions",
				description: "Optionally filtered by program; newest first.",
				...SECURITY,
				responses: {
					200: { description: "List of submissions" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.post(
		"/assessment-budget/init",
		async ({ body, user, set }) => {
			try {
				return await assessmentBudgetService.init(
					body.programId,
					body.termId,
					user.id,
				);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		},
		{
			auth: true,
			body: PlanInitSchema,
			detail: {
				summary: "Open an assessment budget draft with the 12 fixed line items",
				description:
					"Seeds the fixed PDCA-grouped line items (non-deletable); extra program-specific items may be added on save.",
				...SECURITY,
				responses: {
					200: { description: "Draft id + assembled payload" },
					401: { description: "Unauthorized" },
					404: { description: "Program not found" },
				},
			},
		},
	)
	.get(
		"/assessment-budget/:id",
		cached(120, async ({ params, set }) => {
			try {
				return await assessmentBudgetService.get(params.id);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		}),
		{
			auth: true,
			detail: {
				summary: "Get an assembled assessment budget by submission id",
				description: "Includes the computed TOTAL row for both cost columns.",
				...SECURITY,
				responses: {
					200: { description: "Assembled payload" },
					401: { description: "Unauthorized" },
					404: { description: "Submission not found" },
				},
			},
		},
	)
	.put(
		"/assessment-budget/:id",
		async ({ params, body, user, set }) => {
			try {
				return await assessmentBudgetService.save(params.id, user.id, body);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		},
		{
			auth: true,
			body: SaveAssessmentBudgetSchema,
			detail: {
				summary: "Save budget line items (fixed rows protected)",
				description:
					"Patches line items by id and adds program-specific extras; fixed items cannot be removed. Totals are recomputed server-side.",
				...SECURITY,
				responses: {
					200: { description: "Saved payload" },
					401: { description: "Unauthorized" },
					403: { description: "Attempt to delete a fixed line item" },
					404: { description: "Submission or line item not found" },
					409: { description: "Submission not editable" },
				},
			},
		},
	)
	// --- plo entity ---------------------------------------------------------------
	.get(
		"/plos",
		async ({ query, set }) => {
			try {
				return await ploService.list(query.programId);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		},
		{
			auth: true,
			query: t.Object({
				programId: t.String({ description: "Program to list PLOs for" }),
			}),
			detail: {
				summary: "List PLOs for a program",
				description: "Returns the program's PLO entities ordered by code.",
				...SECURITY,
				responses: {
					200: { description: "List of PLOs" },
					401: { description: "Unauthorized" },
					409: { description: "Program not found" },
				},
			},
		},
	)
	.post(
		"/plos",
		async ({ body, user, set }) => {
			try {
				return await ploService.create(body, user.id);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		},
		{
			auth: true,
			body: CreatePloSchema,
			detail: {
				summary: "Create a PLO",
				description:
					"Add a Program Learning Outcome to a program. The code must be unique within the program and the target must clear the 70% institutional hard floor.",
				...SECURITY,
				responses: {
					200: { description: "Created PLO" },
					401: { description: "Unauthorized" },
					409: {
						description:
							"Program not found, duplicate code, or target below the 70% floor",
					},
				},
			},
		},
	)
	.put(
		"/plos/:id",
		async ({ params, body, user, set }) => {
			try {
				return await ploService.update(params.id, body, user.id);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		},
		{
			auth: true,
			body: UpdatePloSchema,
			detail: {
				summary: "Update a PLO",
				description:
					"Change a PLO's code, statement, and/or target; uniqueness and the 70% floor are re-checked.",
				...SECURITY,
				responses: {
					200: { description: "Updated PLO" },
					401: { description: "Unauthorized" },
					404: { description: "PLO not found" },
					409: { description: "Duplicate code or target below the 70% floor" },
				},
			},
		},
	)
	.delete(
		"/plos/:id",
		async ({ params, user, set }) => {
			try {
				await ploService.delete(params.id, user.id);
				return { ok: true };
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		},
		{
			auth: true,
			detail: {
				summary: "Delete a PLO",
				description:
					"Remove an unused PLO. Blocked when the PLO is mapped to a CLO or carries attainment, gap, or CQI history.",
				...SECURITY,
				responses: {
					200: { description: "Deleted" },
					401: { description: "Unauthorized" },
					404: { description: "PLO not found" },
					409: { description: "PLO is mapped or has assessment history" },
				},
			},
		},
	)
	// --- clo_to_plo_map ----------------------------------------------------------
	.get(
		"/clo-plo-map",
		cached(60, async ({ query, set }) => {
			try {
				return await cloToPloMapService.list(query.programId, {
					courseId: query.courseId,
				});
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		}),
		{
			auth: true,
			query: t.Object({
				programId: t.String({ description: "Program to list mappings for" }),
				courseId: t.Optional(t.String({ description: "Filter by course id" })),
			}),
			detail: {
				summary: "List CLO-PLO mappings for a program",
				description:
					"Returns all CloToPloMap entries with CLO and PLO details. Optionally filter by course.",
				...SECURITY,
				responses: {
					200: { description: "List of mappings" },
					401: { description: "Unauthorized" },
					409: { description: "Program not found" },
				},
			},
		},
	)
	.get(
		"/clo-plo-map/entities",
		cached(60, async ({ query, set }) => {
			try {
				return await cloToPloMapService.listEntities(query.programId);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		}),
		{
			auth: true,
			query: t.Object({
				programId: t.String({
					description: "Program to list CLOs and PLOs for",
				}),
			}),
			detail: {
				summary: "List CLOs and PLOs for a program",
				description:
					"Returns all CLOs (grouped by course) and PLOs for the program. Used to populate mapping dropdowns.",
				...SECURITY,
				responses: {
					200: { description: "CLOs and PLOs lists" },
					401: { description: "Unauthorized" },
					409: { description: "Program not found" },
				},
			},
		},
	)
	.post(
		"/clo-plo-map",
		async ({ body, set }) => {
			try {
				return await cloToPloMapService.create(body);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		},
		{
			auth: true,
			body: CloToPloMapInputSchema,
			detail: {
				summary: "Create a CLO-PLO mapping",
				description:
					"Link a CLO to a PLO with an optional weight and I-P-D stage.",
				...SECURITY,
				responses: {
					200: { description: "Created mapping" },
					401: { description: "Unauthorized" },
					409: {
						description: "CLO or PLO not found, or mapping already exists",
					},
				},
			},
		},
	)
	.put(
		"/clo-plo-map/:id",
		async ({ params, body, set }) => {
			try {
				return await cloToPloMapService.update(params.id, body);
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		},
		{
			auth: true,
			body: UpdateCloToPloMapSchema,
			detail: {
				summary: "Update a CLO-PLO mapping",
				description: "Change the weight and/or stage of an existing mapping.",
				...SECURITY,
				responses: {
					200: { description: "Updated mapping" },
					401: { description: "Unauthorized" },
					404: { description: "Mapping not found" },
				},
			},
		},
	)
	.delete(
		"/clo-plo-map/:id",
		async ({ params, set }) => {
			try {
				await cloToPloMapService.delete(params.id);
				return { ok: true };
			} catch (error) {
				return mapPlanErrors(error, set);
			}
		},
		{
			auth: true,
			detail: {
				summary: "Delete a CLO-PLO mapping",
				description: "Remove a CLO-PLO connection.",
				...SECURITY,
				responses: {
					200: { description: "Deleted" },
					401: { description: "Unauthorized" },
					404: { description: "Mapping not found" },
				},
			},
		},
	);
