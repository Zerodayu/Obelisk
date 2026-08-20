import Elysia from "elysia";
import { authPlugin } from "./v1/auth/controller";
import { carPlugin } from "./v1/car/controller";
import { formsPlugin } from "./v1/forms/controller";
import { ingestPlugin } from "./v1/ingest/controller";
import { rollupPlugin } from "./v1/rollup/controller";

export const apiRoutesV1 = new Elysia({ prefix: "api/v1" })
	.use(authPlugin)
	.use(formsPlugin)
	.use(ingestPlugin)
	.use(carPlugin)
	.use(rollupPlugin);
