import Elysia from "elysia";

import { academicPlugin } from "./v1/academic/controller";
import { aiPlugin } from "./v1/ai/controller";
import { archivePlugin } from "./v1/archive/controller";
import { atRiskPlugin } from "./v1/atrisk/controller";
import { auditPlugin } from "./v1/audit/controller";
import { authPlugin } from "./v1/auth/controller";
import { carPlugin } from "./v1/car/controller";
import { checkPlugin } from "./v1/check/controller";
import { cqiPlugin } from "./v1/cqi/controller";
import { formsPlugin } from "./v1/forms/controller";
import { ingestPlugin } from "./v1/ingest/controller";
import { periodicPlugin } from "./v1/periodic/controller";
import { planPlugin } from "./v1/plan/controller";
import { reportsPlugin } from "./v1/reports/controller";
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
	.use(archivePlugin)
	.use(checkPlugin)
	.use(periodicPlugin)
	.use(reportsPlugin)
	.use(atRiskPlugin)
	.use(auditPlugin)
	.use(aiPlugin);
