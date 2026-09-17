import { cached } from "@lib/cache";
import { authPlugin } from "@v1/auth/controller";
import { Elysia } from "elysia";
import { ClassSectionQuerySchema } from "./model";
import { listClassSections, listPrograms, listTerms } from "./service";

const SECURITY = {
	security: [{ bearerAuth: [] as string[], apiKeyCookie: [] as string[] }],
};

export const academicPlugin = new Elysia({
	prefix: "/academic",
	name: "academic",
	tags: ["Academic Reference Data"],
})
	.use(authPlugin)
	.get(
		"/programs",
		cached(300, async () => listPrograms()),
		{
			auth: true,
			detail: {
				summary: "List all programs",
				...SECURITY,
				responses: {
					200: { description: "List of programs" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/terms",
		cached(300, async () => listTerms()),
		{
			auth: true,
			detail: {
				summary: "List all academic terms",
				...SECURITY,
				responses: {
					200: { description: "List of terms" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/class-sections",
		cached(120, async ({ query }) =>
			listClassSections(query.programId, query.termId),
		),
		{
			auth: true,
			query: ClassSectionQuerySchema,
			detail: {
				summary: "List class sections, optionally filtered by program and term",
				...SECURITY,
				responses: {
					200: { description: "List of class sections" },
					401: { description: "Unauthorized" },
				},
			},
		},
	);
