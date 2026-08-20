import { authPlugin } from "@v1/auth/controller";
import { Elysia } from "elysia";
import {
	GenerateCarParamsSchema,
	ListCarsQuerySchema,
	SaveCarPartsSchema,
} from "./model";
import { CarInvalidEditError, CarNotFoundError, carService } from "./service";

export const carPlugin = new Elysia({
	prefix: "/car",
	name: "car",
	tags: ["CAR"],
})
	.use(authPlugin)
	.post(
		"/generate",
		async ({ body, user }) => {
			const draft = await carService.ensureDraft(
				body.classSectionId,
				user.id,
				body.computationRunId,
			);
			const payload = await carService.generate(
				body.classSectionId,
				body.computationRunId,
			);
			return { draft, payload };
		},
		{
			auth: true,
			body: GenerateCarParamsSchema,
			detail: {
				summary: "Ensure a CAR draft and generate the full 7-part report",
				description:
					"Creates the section's CAR submission (if none) and assembles all seven parts. Parts 2/3/4 roll up live from stored attainment; parts 1/5/6/7 merge saved edits.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "CAR draft id + assembled payload" },
					401: { description: "Unauthorized" },
					404: {
						description:
							"No class section or computation run found (upload a class record first)",
					},
				},
			},
		},
	)
	.get("/", async ({ query }) => carService.list(query.classSectionId), {
		auth: true,
		query: ListCarsQuerySchema,
		detail: {
			summary: "List CAR submissions",
			description:
				"Optionally filtered by class section; newest first, without the assembled payload.",
			security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
			responses: {
				200: { description: "List of CAR submissions" },
				401: { description: "Unauthorized" },
			},
		},
	})
	.get(
		"/:id",
		async ({ params, set }) => {
			try {
				return await carService.generateFromSubmission(params.id);
			} catch (error) {
				if (error instanceof CarNotFoundError) {
					set.status = 404;
					return { error: error.message };
				}
				throw error;
			}
		},
		{
			auth: true,
			detail: {
				summary: "Get an assembled CAR by submission id",
				description:
					"Re-derives computed parts from stored attainment and merges the submission's saved parts.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Assembled CAR payload" },
					401: { description: "Unauthorized" },
					404: { description: "CAR submission not found" },
				},
			},
		},
	)
	.put(
		"/:id",
		async ({ params, body, user, set }) => {
			try {
				return await carService.save(params.id, user.id, body);
			} catch (error) {
				if (error instanceof CarNotFoundError) {
					set.status = 404;
					return { error: error.message };
				}
				if (error instanceof CarInvalidEditError) {
					set.status = 409;
					return { error: error.message };
				}
				throw error;
			}
		},
		{
			auth: true,
			body: SaveCarPartsSchema,
			detail: {
				summary: "Save editable CAR parts (1/5/6/7)",
				description:
					"Merges user-entered blocks into the CAR formData. Only allowed while draft or returned.",
				security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
				responses: {
					200: { description: "Saved formData" },
					401: { description: "Unauthorized" },
					404: { description: "CAR submission not found" },
					409: { description: "Submission is not editable" },
				},
			},
		},
	);
