import { Pool } from "@neondatabase/serverless";
import { env } from "@utils/env";
import { drizzle } from "drizzle-orm/neon-serverless";

const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle({ client: pool });

export { db as default };
