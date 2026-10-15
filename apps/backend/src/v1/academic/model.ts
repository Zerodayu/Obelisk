import { t } from "elysia";

export const ClassSectionQuerySchema = t.Object({
	programId: t.Optional(t.String()),
	termId: t.Optional(t.String()),
});

export type ClassSectionQuery = typeof ClassSectionQuerySchema.static;

/** Create a department (college) — system admin only. */
export const CreateDepartmentSchema = t.Object({
	code: t.String({ minLength: 1, description: "Unique department code" }),
	name: t.String({ minLength: 1, description: "Department name" }),
});

export type CreateDepartment = typeof CreateDepartmentSchema.static;

/** Create a program — system admin only. Every program belongs to a department. */
export const CreateProgramSchema = t.Object({
	code: t.String({ minLength: 1, description: "Unique program code" }),
	name: t.String({ minLength: 1, description: "Program name" }),
	departmentId: t.String({
		minLength: 1,
		description: "Department the program belongs to",
	}),
});

export type CreateProgram = typeof CreateProgramSchema.static;
