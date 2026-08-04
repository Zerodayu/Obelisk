import Elysia from "elysia";
import { authPlugin } from "./v1/auth/controller";
import { formsPlugin } from "./v1/forms/controller";
import { ingestPlugin } from "./v1/ingest/controller";

export const apiRoutesV1 = new Elysia({ prefix: "api/v1" })
	.use(authPlugin)
	.use(formsPlugin)
	.use(ingestPlugin);
