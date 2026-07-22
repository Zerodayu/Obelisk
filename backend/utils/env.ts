import dotenvx from "@dotenvx/dotenvx";

dotenvx.config({ path: ".env.local" });

import { z } from "zod";

const envSchema = z.object({
	DATABASE_URL: z.string().min(1),
	BETTER_AUTH_SECRET: z.string().min(1),
	BETTER_AUTH_URL: z.string().min(1),
	FRONTEND_URL: z.string().min(1),
});

export const env = envSchema.parse(process.env);
