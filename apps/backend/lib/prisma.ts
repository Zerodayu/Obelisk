import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/generated/prisma/client";
import { env } from "@utils/env";

// NOTE: TCP driver adapter against the Docker Postgres (`db` service) — the
// old Neon adapter spoke WebSockets and can't reach a plain Postgres
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
