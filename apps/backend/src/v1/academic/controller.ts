import { cached } from "@lib/cache";
import { unitScopeOf } from "@lib/unit-scope";
import { authPlugin } from "@v1/auth/controller";
import { Elysia } from "elysia";

import { ClassSectionQuerySchema } from "./model";
import {
	listClassSections,
	listDepartments,
	listPrograms,
	listTerms,
} from "./service";

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
		cached(300, async ({ user }) => listPrograms(unitScopeOf(user))),
		{
			auth: true,
			detail: {
				summary: "List the caller's programs",
				description:
					"Session-derived unit scope: a faculty/chair lists its own program, a dean the programs of its department, institution-wide roles all of them.",
				...SECURITY,
				responses: {
					200: { description: "List of programs" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/departments",
		cached(300, async ({ user }) => listDepartments(unitScopeOf(user))),
		{
			auth: true,
			detail: {
				summary: "List the caller's departments",
				description:
					"Session-derived unit scope: a faculty/chair lists the department of its program, a dean its own department, institution-wide roles all of them.",
				...SECURITY,
				responses: {
					200: { description: "List of departments" },
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
		cached(120, async ({ query, user }) =>
			listClassSections(unitScopeOf(user), query.programId, query.termId),
		),
		{
			auth: true,
			query: ClassSectionQuerySchema,
			detail: {
				summary: "List class sections, optionally filtered by program and term",
				description:
					"Listed within the caller's unit only; a `programId` outside that unit is refused with 403.",
				...SECURITY,
				responses: {
					200: { description: "List of class sections" },
					401: { description: "Unauthorized" },
					403: { description: "programId is outside the caller's unit" },
				},
			},
		},
	);
