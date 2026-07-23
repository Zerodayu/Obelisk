import cors from "@elysia/cors";
import openapi from "@elysia/openapi";
import { env } from "@utils/env";
import { Elysia } from "elysia";
import { apiRoutesV1 } from "./routes";

const app = new Elysia()
	.use(
		openapi({
			documentation: {
				info: {
					version: "v0",
					title:
						"Obelisk — Outcomes-based Educational Learning and Intelligent System Kit for Jose Maria College Foundation Inc.",
				},
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
	.use(apiRoutesV1)
	.listen(3000);

console.log(
	`🦊 elysia is running at [ http://${app.server?.hostname}:${app.server?.port} ]`,
);
