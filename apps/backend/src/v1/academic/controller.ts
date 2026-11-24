import { cached } from "@lib/cache";
import {
	assertCanManageClassSections,
	assertCanManageClos,
	assertCanManageReferenceData,
	RoleAccessForbiddenError,
} from "@lib/role-access";
import { unitScopeOf } from "@lib/unit-scope";
import { authPlugin } from "@v1/auth/controller";
import { Elysia, t } from "elysia";

import {
	ClassSectionQuerySchema,
	CreateClassSectionSchema,
	CreateCloSchema,
	CreateDepartmentSchema,
	CreateProgramSchema,
	UpdateCloSchema,
	UpdateDepartmentSchema,
	UpdateProgramSchema,
} from "./model";
import {
	createClassSection,
	createClo,
	createDepartment,
	createProgram,
	deleteClo,
	deleteDepartment,
	deleteProgram,
	listAssessmentTypeCounts,
	listClassSections,
	listClos,
	listCourses,
	listDepartments,
	listPrograms,
	listStudentYearLevels,
	listTerms,
	ReferenceDataError,
	updateClo,
	updateDepartment,
	updateProgram,
} from "./service";

const SECURITY = {
	security: [{ bearerAuth: [] as string[], apiKeyCookie: [] as string[] }],
};

/**
 * Map reference-data write errors onto HTTP statuses: `ReferenceDataError`
 * carries its own status (409 duplicate, 404 unknown department), a role
 * refusal is a 403. Anything else is re-thrown.
 */
function mapAcademicErrors(
	error: unknown,
	set: { status?: string | number },
): unknown {
	if (
		error instanceof ReferenceDataError ||
		error instanceof RoleAccessForbiddenError
	) {
		set.status = error.status;
		return { error: error.message };
	}
	throw error;
}

export const academicPlugin = new Elysia({
	prefix: "/academic",
	name: "academic",
	tags: ["Academic Reference Data"],
})
	.use(authPlugin)
	.get(
		"/programs",
		// NOTE: not cached — system_admin creates programs through the UI, and a
		// cached list would serve the pre-create rows (see createProgram).
		async ({ user }) => listPrograms(unitScopeOf(user)),
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
		// NOTE: not cached — system_admin creates departments through the UI, and
		// a cached list would serve the pre-create rows (see createDepartment).
		async ({ user }) => listDepartments(unitScopeOf(user)),
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
		// NOTE: not cached — the first section create can bootstrap a term, and
		// a cached list would hide it from the picker (see createClassSection).
		async () => listTerms(),
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
		"/students/year-levels",
		cached(300, async ({ user }) => listStudentYearLevels(unitScopeOf(user))),
		{
			auth: true,
			detail: {
				summary: "Count students per year level",
				description:
					"Unit-scoped headcount by `Student.yearLevel`; students with no level on file are reported with a null yearLevel.",
				...SECURITY,
				responses: {
					200: { description: "Year level -> student count" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/assessment-types",
		cached(300, async ({ user }) =>
			listAssessmentTypeCounts(unitScopeOf(user)),
		),
		{
			auth: true,
			detail: {
				summary: "Count assessment items per type",
				description:
					"Unit-scoped count of `AssessmentItem` rows grouped by direct/indirect.",
				...SECURITY,
				responses: {
					200: { description: "Assessment type -> item count" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/class-sections",
		// NOTE: not cached — capture roles create sections through the UI, and a
		// cached list would serve the pre-create rows (same as programs).
		async ({ query, user }) =>
			listClassSections(unitScopeOf(user), query.programId, query.termId),
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
	)
	.post(
		"/class-sections",
		async ({ body, user, set }) => {
			// NOTE: the auth macro answers 401 by returning `undefined` from its
			// resolve but Elysia still runs the handler — fail closed here instead
			// of crashing on `user.role` (same as GET /audit/logs).
			if (!user) {
				set.status = 401;
				return { error: "Unauthorized" };
			}
			try {
				const actor = user as { id?: string; role?: string };
				assertCanManageClassSections(actor.role);
				return await createClassSection(unitScopeOf(user), body, {
					id: actor.id ?? "",
					role: actor.role ?? "",
				});
			} catch (error) {
				return mapAcademicErrors(error, set);
			}
		},
		{
			auth: true,
			body: CreateClassSectionSchema,
			detail: {
				summary: "Create a class section",
				description:
					"Faculty/program_chair (their own program) and system_admin. Creates the course when new (`courseTitle` required); seeds any provided CLOs; attaches to the active term unless `termId` is given.",
				...SECURITY,
				responses: {
					200: { description: "Created class section" },
					400: {
						description:
							"Missing program/course title, or a new course with a blank CLO",
					},
					401: { description: "Unauthorized" },
					403: {
						description: "Role may not create sections / foreign program",
					},
					404: { description: "Term not found" },
					409: { description: "Section already exists for this course + term" },
				},
			},
		},
	)
	.get(
		"/courses",
		// NOTE: not cached — a course appears as soon as a section or CLO is
		// created, and a cached list would hide it from the CLO picker.
		async ({ user }) =>
			listCourses(
				unitScopeOf(user),
				(user as { role?: string }).role ?? "user",
			),
		{
			auth: true,
			detail: {
				summary: "List the caller's courses",
				description:
					"Unit-scoped list of courses — the picker for adding a CLO to a course.",
				...SECURITY,
				responses: {
					200: { description: "List of courses" },
					401: { description: "Unauthorized" },
				},
			},
		},
	)
	.get(
		"/clos",
		async ({ query, user, set }) => {
			try {
				return await listClos(
					unitScopeOf(user),
					(user as { role?: string }).role ?? "user",
					query.courseId,
				);
			} catch (error) {
				return mapAcademicErrors(error, set);
			}
		},
		{
			auth: true,
			query: t.Object({
				courseId: t.Optional(t.String({ description: "Filter to one course" })),
			}),
			detail: {
				summary: "List the caller's CLOs (unit-scoped)",
				description:
					"A faculty/chair lists the CLOs of its own program's courses; a foreign `courseId` is refused with 403.",
				...SECURITY,
				responses: {
					200: { description: "List of CLOs grouped by course" },
					401: { description: "Unauthorized" },
					403: { description: "courseId is outside the caller's unit" },
				},
			},
		},
	)
	.post(
		"/clos",
		async ({ body, user, set }) => {
			try {
				assertCanManageClos((user as { role?: string }).role);
				return await createClo(
					unitScopeOf(user),
					(user as { role?: string }).role ?? "user",
					body,
				);
			} catch (error) {
				return mapAcademicErrors(error, set);
			}
		},
		{
			auth: true,
			body: CreateCloSchema,
			detail: {
				summary: "Create a CLO",
				description:
					"Faculty/chair for their own program's courses, system_admin anywhere. Rejects a duplicate code within a course.",
				...SECURITY,
				responses: {
					200: { description: "Created CLO" },
					401: { description: "Unauthorized" },
					403: { description: "Role may not manage CLOs / foreign course" },
					404: { description: "Course not found" },
					409: { description: "CLO code already exists for this course" },
				},
			},
		},
	)
	.put(
		"/clos/:id",
		async ({ params, body, user, set }) => {
			try {
				assertCanManageClos((user as { role?: string }).role);
				return await updateClo(
					unitScopeOf(user),
					(user as { role?: string }).role ?? "user",
					params.id,
					body,
				);
			} catch (error) {
				return mapAcademicErrors(error, set);
			}
		},
		{
			auth: true,
			params: t.Object({ id: t.String() }),
			body: UpdateCloSchema,
			detail: {
				summary: "Update a CLO",
				description: "Change a CLO's code and/or description.",
				...SECURITY,
				responses: {
					200: { description: "Updated CLO" },
					401: { description: "Unauthorized" },
					403: { description: "Role may not manage CLOs / foreign course" },
					404: { description: "CLO not found" },
					409: { description: "CLO code already exists for this course" },
				},
			},
		},
	)
	.delete(
		"/clos/:id",
		async ({ params, user, set }) => {
			try {
				assertCanManageClos((user as { role?: string }).role);
				await deleteClo(
					unitScopeOf(user),
					(user as { role?: string }).role ?? "user",
					params.id,
				);
				return { ok: true };
			} catch (error) {
				return mapAcademicErrors(error, set);
			}
		},
		{
			auth: true,
			params: t.Object({ id: t.String() }),
			detail: {
				summary: "Delete a CLO",
				description:
					"Blocked (409) when the CLO is mapped to a PLO or has attainment history.",
				...SECURITY,
				responses: {
					200: { description: "Deleted" },
					401: { description: "Unauthorized" },
					403: { description: "Role may not manage CLOs / foreign course" },
					404: { description: "CLO not found" },
					409: { description: "CLO is mapped or has attainment history" },
				},
			},
		},
	)
	.post(
		"/departments",
		async ({ body, user, set }) => {
			try {
				assertCanManageReferenceData((user as { role?: string }).role);
				return await createDepartment(body);
			} catch (error) {
				return mapAcademicErrors(error, set);
			}
		},
		{
			auth: true,
			body: CreateDepartmentSchema,
			detail: {
				summary: "Create a department",
				description:
					"System admin only. Adds a college/department with a globally unique code.",
				...SECURITY,
				responses: {
					200: { description: "Created department" },
					401: { description: "Unauthorized" },
					403: { description: "System admin only" },
					409: { description: "Department code already exists" },
				},
			},
		},
	)
	.post(
		"/programs",
		async ({ body, user, set }) => {
			try {
				assertCanManageReferenceData((user as { role?: string }).role);
				return await createProgram(body);
			} catch (error) {
				return mapAcademicErrors(error, set);
			}
		},
		{
			auth: true,
			body: CreateProgramSchema,
			detail: {
				summary: "Create a program",
				description:
					"System admin only. Adds a program under an existing department; the code is globally unique.",
				...SECURITY,
				responses: {
					200: { description: "Created program" },
					401: { description: "Unauthorized" },
					403: { description: "System admin only" },
					404: { description: "Department not found" },
					409: { description: "Program code already exists" },
				},
			},
		},
	)
	.put(
		"/departments/:id",
		async ({ params, body, user, set }) => {
			try {
				assertCanManageReferenceData((user as { role?: string }).role);
				return await updateDepartment(params.id, body);
			} catch (error) {
				return mapAcademicErrors(error, set);
			}
		},
		{
			auth: true,
			params: t.Object({ id: t.String() }),
			body: UpdateDepartmentSchema,
			detail: {
				summary: "Update a department",
				description:
					"System admin only. Renames the department; code stays unique.",
				...SECURITY,
				responses: {
					200: { description: "Updated department" },
					401: { description: "Unauthorized" },
					403: { description: "System admin only" },
					409: { description: "Department code already exists" },
				},
			},
		},
	)
	.delete(
		"/departments/:id",
		async ({ params, user, set }) => {
			try {
				assertCanManageReferenceData((user as { role?: string }).role);
				await deleteDepartment(params.id);
				return { ok: true };
			} catch (error) {
				return mapAcademicErrors(error, set);
			}
		},
		{
			auth: true,
			params: t.Object({ id: t.String() }),
			detail: {
				summary: "Delete a department",
				description:
					"System admin only. Blocked (409) while the department has programs or assigned users.",
				...SECURITY,
				responses: {
					200: { description: "Deleted department" },
					401: { description: "Unauthorized" },
					403: { description: "System admin only" },
					404: { description: "Department not found" },
					409: { description: "Department in use" },
				},
			},
		},
	)
	.put(
		"/programs/:id",
		async ({ params, body, user, set }) => {
			try {
				assertCanManageReferenceData((user as { role?: string }).role);
				return await updateProgram(params.id, body);
			} catch (error) {
				return mapAcademicErrors(error, set);
			}
		},
		{
			auth: true,
			params: t.Object({ id: t.String() }),
			body: UpdateProgramSchema,
			detail: {
				summary: "Update a program",
				description:
					"System admin only. Renames the program or moves it to another department; code stays unique.",
				...SECURITY,
				responses: {
					200: { description: "Updated program" },
					401: { description: "Unauthorized" },
					403: { description: "System admin only" },
					404: { description: "Department not found" },
					409: { description: "Program code already exists" },
				},
			},
		},
	)
	.delete(
		"/programs/:id",
		async ({ params, user, set }) => {
			try {
				assertCanManageReferenceData((user as { role?: string }).role);
				await deleteProgram(params.id);
				return { ok: true };
			} catch (error) {
				return mapAcademicErrors(error, set);
			}
		},
		{
			auth: true,
			params: t.Object({ id: t.String() }),
			detail: {
				summary: "Delete a program",
				description:
					"System admin only. Blocked (409) while the program has any dependent records.",
				...SECURITY,
				responses: {
					200: { description: "Deleted program" },
					401: { description: "Unauthorized" },
					403: { description: "System admin only" },
					404: { description: "Program not found" },
					409: { description: "Program in use" },
				},
			},
		},
	);
