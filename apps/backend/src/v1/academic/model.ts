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

/**
 * Create a class section — faculty/chair in their own program, system_admin
 * anywhere. `courseTitle` is only used when the course code is new; `clos`
 * seeds a new course's outcomes (required when the course has none yet).
 */
export const CreateClassSectionSchema = t.Object({
	sectionCode: t.String({ minLength: 1, description: "Section code, e.g. 1A" }),
	courseCode: t.String({
		minLength: 1,
		description: "Course code, e.g. IT 101",
	}),
	courseTitle: t.Optional(
		t.String({ minLength: 1, description: "Course title (new courses only)" }),
	),
	programId: t.Optional(
		t.String({
			minLength: 1,
			description: "Required for institution-wide roles",
		}),
	),
	termId: t.Optional(
		t.String({ minLength: 1, description: "Defaults to the active term" }),
	),
	clos: t.Optional(
		t.Array(
			t.Object({
				code: t.String({ minLength: 1 }),
				description: t.String({ minLength: 1 }),
			}),
			{ minItems: 1 },
		),
	),
});

export type CreateClassSection = typeof CreateClassSectionSchema.static;
