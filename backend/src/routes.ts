import Elysia from "elysia";
import { academicPlugin } from "./v1/academic/controller";
import { aiPlugin } from "./v1/ai/controller";
import { authPlugin } from "./v1/auth/controller";
import { carPlugin } from "./v1/car/controller";
import { checkPlugin } from "./v1/check/controller";
import { cqiPlugin } from "./v1/cqi/controller";
import { formsPlugin } from "./v1/forms/controller";
import { ingestPlugin } from "./v1/ingest/controller";
import { periodicPlugin } from "./v1/periodic/controller";
import { planPlugin } from "./v1/plan/controller";
import { rollupPlugin } from "./v1/rollup/controller";

export const apiRoutesV1 = new Elysia({ prefix: "api/v1" })
	.use(authPlugin)
	.use(academicPlugin)
	.use(formsPlugin)
	.use(ingestPlugin)
	.use(carPlugin)
	.use(rollupPlugin)
	.use(cqiPlugin)
	.use(planPlugin)
	.use(checkPlugin)
	.use(periodicPlugin)
	.use(aiPlugin);
