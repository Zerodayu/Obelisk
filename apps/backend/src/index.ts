import cors from "@elysia/cors";
import openapi from "@elysia/openapi";
import { appINFO } from "@obelisk/app-info";
import { env } from "@utils/env";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import type { OpenAPIV3 } from "openapi-types";
import { apiRoutesV1 } from "./routes";
import { OpenAPI } from "./v1/auth/controller";
import { auth } from "./v1/auth/service";

const app = new Elysia()
	// NOTE: per-request access log → stdout → Dozzle (obelisk-backend) — Elysia
	// is silent by default, so login POSTs and API calls were invisible before.
	// The start time rides on the Request object (one per request, no globals)
	.onRequest(({ request }) => {
		(request as Request & { _start?: number })._start = performance.now();
	})
	.onAfterResponse(({ request, path, set }) => {
		const start = (request as Request & { _start?: number })._start;
		const ms =
			start === undefined ? "?" : `${Math.round(performance.now() - start)}ms`;
		// NOTE: set.status stays undefined for the implicit 200 (mapResponse
		// applies it after this hook runs)
		console.log(
			`[backend] ${request.method} ${path} ${set.status ?? 200} ${ms}`,
		);
	})
	.use(
		openapi({
			documentation: {
				info: {
					version: "0.2.0",
					title: `Obelisk(backend) — ${appINFO.description}`,
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
	.use(rateLimit({ max: 100, duration: 15 * 60 * 1000 })) //100 per 15mins
	.get("/", () => "hello elysia", { detail: { hide: true } })
	.mount(auth.handler)
	.use(apiRoutesV1);

// NOTE: Vercel imports this module and serves `app` itself — `import.meta.main`
// is false there (and VERCEL is set as a second guard), so the local listener
// only ever starts under `bun --watch src/index.ts` / `bun run dev`.
if (import.meta.main && !process.env.VERCEL) {
	app.listen(8080);
	console.log(
		`🦊 elysia is running at [ http://${app.server?.hostname}:${app.server?.port} ]`,
	);
}

export default app;
