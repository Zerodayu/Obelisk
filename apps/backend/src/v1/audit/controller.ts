import { RoleAccessForbiddenError } from "@lib/role-access";
import { authPlugin } from "@v1/auth/controller";
import { Elysia } from "elysia";
import { AuditLogsQuerySchema } from "./model";
import { AuditQueryError, auditService } from "./service";

const SECURITY = {
	security: [{ bearerAuth: [] as string[], apiKeyCookie: [] as string[] }],
};

/** The authenticated caller's role (better-auth additional field). */
function callerRole(user: unknown): string {
	return (user as { role?: string } | undefined)?.role ?? "user";
}

/** Map the service layer's typed errors onto HTTP statuses. */
function mapAuditErrors(
	error: unknown,
	set: { status?: string | number },
): unknown {
	if (error instanceof RoleAccessForbiddenError) {
		set.status = 403;
		return { error: error.message };
	}
	if (error instanceof AuditQueryError) {
		set.status = 400;
		return { error: error.message };
	}
	throw error;
}

export const auditPlugin = new Elysia({
	prefix: "/audit",
	name: "audit",
	tags: ["Audit"],
})
	.use(authPlugin)
	.get(
		"/logs",
		async ({ query, user, set }) => {
			// NOTE: the auth macro answers 401 by returning `undefined` from its
			// resolve — Elysia still runs the handler, so fail closed here with a
			// clean body instead of crashing on `user.id` (never fall through to
			// the service with an undefined caller).
			if (!user) {
				set.status = 401;
				return { error: "Unauthorized" };
			}
			try {
				return await auditService.list(
					{ id: user.id, role: callerRole(user) },
					query,
				);
			} catch (error) {
				return mapAuditErrors(error, set);
			}
		},
		{
			auth: true,
			query: AuditLogsQuerySchema,
			detail: {
				summary: "List audit-log entries visible to the caller",
				description:
					"vpaa/system_admin see every role's rows (full waterfall); every other role sees only its own rows — requesting another userId answers 403. Newest first, keyset-paginated via `before`.",
				...SECURITY,
				responses: {
					200: { description: "Scoped audit-log page" },
					400: { description: "Invalid `before` timestamp" },
					401: { description: "Unauthorized" },
					403: { description: "Caller may not read another user's log" },
				},
			},
		},
	);
