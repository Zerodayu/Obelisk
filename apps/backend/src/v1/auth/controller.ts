import { prisma } from "@lib/prisma";
import { hasRole, ROLE_REQUEST_ROLES } from "@lib/role-access";
import type { UserRole } from "@prisma/generated/prisma/enums";
import type { Session, User } from "better-auth";
import { Elysia, t } from "elysia";
import {
	RoleRequestError,
	type RoleRequestScope,
	SELF_SELECTABLE_ROLES,
	type SelfSelectableRole,
	validateRoleRequest,
} from "./model";
import { auth } from "./service";

const ROLE_REQUEST_STATUS = {
	none: "none",
	pending: "pending",
	approved: "approved",
	denied: "denied",
} as const;

const ROLE_REQUEST_STATUS_ENUM = t.Enum(ROLE_REQUEST_STATUS);

const roleRequestSelect = {
	id: true,
	name: true,
	email: true,
	role: true,
	requestedRole: true,
	roleRequestStatus: true,
	employeeId: true,
	programId: true,
	departmentId: true,
	isActive: true,
	createdAt: true,
	program: { select: { id: true, name: true, code: true } },
	department: { select: { id: true, name: true, code: true } },
} as const;

export const roleRequestService = {
	/**
	 * File (or re-file) a role request for the signed-in user. New accounts
	 * sign in through the org-restricted Google provider without a role; they
	 * choose one here and a system_admin must approve it. The request carries
	 * the role's scope — `faculty`/`program_chair` name a program (their
	 * department is derived from it), a `dean` names the department that
	 * covers its programs — persisted to `user.program_id` / `user.department_id`
	 * so the approver sees it and the granted role lands already scoped.
	 */
	async submit(
		user: { id: string; role?: string; roleRequestStatus?: string },
		requestedRole: string,
		scope?: RoleRequestScope,
	) {
		const validation = validateRoleRequest(user, requestedRole, scope);
		if (!validation.ok) {
			throw new RoleRequestError(validation.message, validation.status);
		}

		// Scope ids are resolved against reference tables — never trust the
		// client. Exactly one of the two columns ends up set (both null for
		// aqau/vpaa), so a re-filed request can't leave a stale scope behind.
		let programId: string | null = null;
		let departmentId: string | null = null;
		if (scope?.programId) {
			const program = await prisma.program.findUnique({
				where: { id: scope.programId },
				select: { id: true, departmentId: true },
			});
			if (!program) {
				throw new RoleRequestError("Program not found.", 400);
			}
			programId = program.id;
			// A faculty member/chair also belongs to the program's department.
			departmentId = program.departmentId;
		} else if (scope?.departmentId) {
			const department = await prisma.department.findUnique({
				where: { id: scope.departmentId },
				select: { id: true },
			});
			if (!department) {
				throw new RoleRequestError("Department not found.", 400);
			}
			departmentId = department.id;
		}

		await prisma.user.update({
			where: { id: user.id },
			data: {
				requestedRole: requestedRole as UserRole,
				roleRequestStatus: "pending",
				programId,
				departmentId,
			},
		});

		return { ok: true };
	},

	async list(status: keyof typeof ROLE_REQUEST_STATUS = "pending") {
		return prisma.user.findMany({
			where: { roleRequestStatus: status },
			select: roleRequestSelect,
			orderBy: { createdAt: "asc" },
		});
	},

	async decide(
		userId: string,
		decision: "approved" | "denied",
	): Promise<"approved" | "denied"> {
		const target = await prisma.user.findUnique({ where: { id: userId } });
		if (!target) throw new RoleRequestError("User not found", 404);
		if (!target.requestedRole)
			throw new RoleRequestError("User has no role request on file", 409);
		if (target.roleRequestStatus !== "pending")
			throw new RoleRequestError("Role request is already resolved", 409);

		const data =
			decision === "approved"
				? // The scope (program/department) was resolved when the request
					// was filed, so approval just grants the role.
					({
						role: target.requestedRole,
						roleRequestStatus: "approved",
					} as const)
				: ({
						// No request on file anymore — drop the scope with it.
						roleRequestStatus: "denied",
						requestedRole: null,
						programId: null,
						departmentId: null,
					} as const);

		await prisma.user.update({
			where: { id: userId },
			data,
		});

		return decision;
	},
};

/** Throws a 403 when the caller's role is not in `ROLE_REQUEST_ROLES`. */
function requireSystemAdmin(user: User) {
	if (!hasRole((user as { role?: string }).role, ROLE_REQUEST_ROLES)) {
		throw new RoleRequestError("Forbidden — system admin only", 403);
	}
}

export const authPlugin = new Elysia({ name: "auth" })
	.macro({
		auth: {
			async resolve({
				request: { headers },
				set,
			}): Promise<{ user: User; session: Session } | undefined> {
				// NOTE: role gating must read the DB, not the up-to-5-min
				// `session_data` cookie cached at login — a role request
				// filed moments ago has to apply immediately.
				const session = await auth.api.getSession({
					headers,
					query: { disableCookieCache: true },
				});

				if (!session) {
					set.status = 401;
					return;
				}

				return {
					user: session.user,
					session: session.session,
				};
			},
		},
	})
	.guard({ auth: true }, (app) =>
		app
			.get("/auth/me", async ({ user, session }) => ({ user, session }), {
				detail: {
					tags: ["Auth"],
					summary: "Get current user",
					description: "Returns the authenticated user and session",
					security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
					responses: {
						200: { description: "User session data" },
						401: { description: "Unauthorized" },
					},
				},
			})
			.post(
				"/auth/role-request",
				async ({ user, body, set }) => {
					try {
						const scope: RoleRequestScope = {
							programId: body.programId,
							departmentId: body.departmentId,
						};
						return await roleRequestService.submit(
							user,
							body.requestedRole,
							scope,
						);
					} catch (error) {
						if (error instanceof RoleRequestError) {
							set.status = error.status;
							return { error: error.message };
						}
						throw error;
					}
				},
				{
					body: t.Object({
						requestedRole: t.Enum(
							Object.fromEntries(
								SELF_SELECTABLE_ROLES.map((role) => [role, role]),
							) as Record<SelfSelectableRole, SelfSelectableRole>,
						),
						// Optional at the schema level (which one applies is
						// role-derived); the service rejects a missing/unknown
						// scope and the wrong id for the selected role.
						programId: t.Optional(t.String()),
						departmentId: t.Optional(t.String()),
					}),
					detail: {
						tags: ["Auth"],
						summary: "Request a role",
						description:
							"Authenticated users without an institutional role file a role request here; a system_admin must approve it before the role is granted. Scope follows the role: faculty/program_chair carry the id of the program they teach in (their department is derived from it), dean carries the id of the department that covers its programs, aqau/vpaa carry neither — all stored on user.program_id / user.department_id.",
						security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
						responses: {
							200: { description: "Role request filed" },
							400: {
								description:
									"Invalid requested role or scope (missing/unknown program or department)",
							},
							401: { description: "Unauthorized" },
							409: {
								description: "Account already has a role or a pending request",
							},
						},
					},
				},
			)
			.get(
				"/auth/role-requests",
				async ({ user, query, set }) => {
					try {
						requireSystemAdmin(user);
						return await roleRequestService.list(query.status);
					} catch (error) {
						if (error instanceof RoleRequestError) {
							set.status = error.status;
							return { error: error.message };
						}
						throw error;
					}
				},
				{
					query: t.Object({
						status: t.Optional(ROLE_REQUEST_STATUS_ENUM),
					}),
					detail: {
						tags: ["Auth"],
						summary: "List role requests",
						description:
							"System admin only. Lists users by role-request status (default pending).",
						security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
						responses: {
							200: { description: "Role request users" },
							401: { description: "Unauthorized" },
							403: { description: "System admin only" },
						},
					},
				},
			)
			.post(
				"/auth/role-requests/:userId/approve",
				async ({ user, params, set }) => {
					try {
						requireSystemAdmin(user);
						await roleRequestService.decide(params.userId, "approved");
						return { ok: true };
					} catch (error) {
						if (error instanceof RoleRequestError) {
							set.status = error.status;
							return { error: error.message };
						}
						throw error;
					}
				},
				{
					params: t.Object({ userId: t.String() }),
					detail: {
						tags: ["Auth"],
						summary: "Approve a pending role request",
						description:
							"System admin only. Grants the user their requested role.",
						security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
						responses: {
							200: { description: "Role granted" },
							401: { description: "Unauthorized" },
							403: { description: "System admin only" },
							404: { description: "User not found" },
							409: { description: "No resolvable pending request" },
						},
					},
				},
			)
			.post(
				"/auth/role-requests/:userId/deny",
				async ({ user, params, set }) => {
					try {
						requireSystemAdmin(user);
						await roleRequestService.decide(params.userId, "denied");
						return { ok: true };
					} catch (error) {
						if (error instanceof RoleRequestError) {
							set.status = error.status;
							return { error: error.message };
						}
						throw error;
					}
				},
				{
					params: t.Object({ userId: t.String() }),
					detail: {
						tags: ["Auth"],
						summary: "Deny a pending role request",
						description:
							"System admin only. Rejects the request; the user keeps the `user` role.",
						security: [{ bearerAuth: [] }, { apiKeyCookie: [] }],
						responses: {
							200: { description: "Request denied" },
							401: { description: "Unauthorized" },
							403: { description: "System admin only" },
							404: { description: "User not found" },
							409: { description: "No resolvable pending request" },
						},
					},
				},
			),
	);

let _schema: ReturnType<typeof auth.api.generateOpenAPISchema>;
const getSchema = async () => (_schema ??= auth.api.generateOpenAPISchema());

export const OpenAPI = {
	getPaths: async (prefix = "api/v1/auth") => {
		const { paths } = await getSchema();
		const reference = Object.create(null);
		for (const path of Object.keys(paths)) {
			const key = prefix + path;
			reference[key] = paths[path];
			for (const method of Object.keys(paths[path])) {
				const operation = reference[key][method];
				operation.tags = ["Better Auth"];
			}
		}
		return reference;
	},
	components: getSchema().then(({ components }) => components),
};
