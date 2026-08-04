import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/generated/prisma/client";
import { env } from "@utils/env";

const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
