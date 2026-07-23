// If your Prisma file is located elsewhere, you can change the path
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/generated/prisma/client";
import { env } from "@utils/env";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export const auth = betterAuth({
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),

	emailAndPassword: {
		enabled: true,
		password: {
			hash: (pass) => Bun.password.hash(pass),
			verify: ({ password, hash }) => Bun.password.verify(password, hash),
		},
	},

	advanced: {
		cookiePrefix: "obelisk-app",
		database: {
			generateId: false,
		},
	},

	session: {
		expiresIn: 60 * 60 * 24 * 7,
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5,
		},
	},
});
