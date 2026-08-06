import { z } from "zod";

const rawEnv = {
  DEVELOPMENT: process.env.DEVELOPMENT,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  // DATABASE_URL: process.env.DATABASE_URL,
  // BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  // BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  // FRONTEND_URL: process.env.FRONTEND_URL,
  // PYTHON_SERVER_URL: process.env.PYTHON_SERVER_URL,
};

const envSchema = z.object({
  DEVELOPMENT: z.string().min(1).optional(),
  NEXT_PUBLIC_API_URL: z.string().min(1),
  // DATABASE_URL: z.string().min(1),
  // BETTER_AUTH_SECRET: z.string().min(1),
  // BETTER_AUTH_URL: z.string().min(1),
  // FRONTEND_URL: z.string().min(1),
  // PYTHON_SERVER_URL: z.string().min(1),
});

export const env = envSchema.parse(rawEnv);
