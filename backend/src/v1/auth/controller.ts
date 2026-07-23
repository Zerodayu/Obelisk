import type { Session, User } from "better-auth";
import { Elysia } from "elysia";
import { auth } from "./service";

export const authPlugin = new Elysia({ name: "auth" })
	.macro({
		auth: {
			async resolve({
				request: { headers },
				set,
			}): Promise<{ user: User; session: Session } | undefined> {
				const session = await auth.api.getSession({ headers });

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
		app.get("/auth/me", async ({ user, session }) => ({ user, session }), {
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
		}),
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
