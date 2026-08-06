import { z } from "zod";

const rawEnv = {
	DATABASE_URL: process.env.DATABASE_URL,
	BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
	BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
	FRONTEND_URL: process.env.FRONTEND_URL,
	PYTHON_SERVER_URL: process.env.PYTHON_SERVER_URL,
	GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
	ORG_EMAIL_DOMAIN: process.env.ORG_EMAIL_DOMAIN,
};

const envSchema = z.object({
	DATABASE_URL: z.string().min(1),
	BETTER_AUTH_SECRET: z.string().min(1),
	BETTER_AUTH_URL: z.string().min(1),
	FRONTEND_URL: z.string().min(1),
	PYTHON_SERVER_URL: z.string().min(1),
	GOOGLE_CLIENT_ID: z.string().min(1),
	GOOGLE_CLIENT_SECRET: z.string().min(1),
	ORG_EMAIL_DOMAIN: z.string().min(1),
});

export const env = envSchema.parse(rawEnv);
