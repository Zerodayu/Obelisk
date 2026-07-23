import cors from "@elysia/cors";
import openapi from "@elysia/openapi";
import { env } from "@utils/env";
import { Elysia } from "elysia";
import type { OpenAPIV3 } from "openapi-types";
import { apiRoutesV1 } from "./routes";
import { OpenAPI } from "./v1/auth/controller";
import { auth } from "./v1/auth/service";

const app = new Elysia()
	.use(
		openapi({
			documentation: {
				info: {
					version: "v0",
					title:
						"Obelisk — Outcomes-based Educational Learning and Intelligent System Kit for Jose Maria College Foundation Inc.",
				},

				components: (await OpenAPI.components) as OpenAPIV3.ComponentsObject,
				paths: (await OpenAPI.getPaths()) as OpenAPIV3.PathsObject,
			},
		}),
	)
	.use(
		cors({
			origin: [env.FRONTEND_URL, "http://localhost:3000"],
			methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			credentials: true,
			allowedHeaders: ["Content-Type", "Authorization"],
		}),
	)
	.get("/", () => "hello elysia", { detail: { hide: true } })
	.mount(auth.handler)
	.use(apiRoutesV1)
	.listen(8080);

console.log(
	`🦊 elysia is running at [ http://${app.server?.hostname}:${app.server?.port} ]`,
);
