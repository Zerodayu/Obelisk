import { Elysia } from "elysia";
import { auth } from "./service";

export const authPlugin = new Elysia({ name: "auth" }).macro({
	auth: {
		async resolve({ request: { headers }, set }) {
			const session = await auth.api.getSession({ headers });

			if (!session) {
				set.status = 401;
				return;
			}

			return { session } as { session: typeof session };
		},
	},
});
