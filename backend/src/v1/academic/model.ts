import { t } from "elysia";

export const ClassSectionQuerySchema = t.Object({
	programId: t.Optional(t.String()),
	termId: t.Optional(t.String()),
});

export type ClassSectionQuery = typeof ClassSectionQuerySchema.static;
