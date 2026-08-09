// If your Prisma file is located elsewhere, you can change the path
import { prisma } from "@lib/prisma";
import { env } from "@utils/env";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { openAPI } from "better-auth/plugins";

export const auth = betterAuth({
	basePath: "/api/v1/auth",

	trustedOrigins: [env.FRONTEND_URL, "http://localhost:3000"],

	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),

	plugins: [openAPI()],

	user: {
		additionalFields: {
			role: {
				type: "string",
				input: false,
				required: false,
				defaultValue: "user",
			},
			requestedRole: {
				type: "string",
				input: true,
				required: false,
			},
			roleRequestStatus: {
				type: "string",
				input: false,
				required: false,
				defaultValue: "none",
			},
			employeeId: { type: "string", input: false, required: false },
			programId: { type: "string", input: false, required: false },
			departmentId: { type: "string", input: false, required: false },
			isActive: {
				type: "boolean",
				input: false,
				required: false,
				defaultValue: true,
			},
		},
	},

	databaseHooks: {
		user: {
			create: {
				before: async (user) => ({
					data: {
						...user,
						role: "user",
						roleRequestStatus: user.requestedRole ? "pending" : "none",
					},
				}),
			},
		},
	},

	emailAndPassword: {
		enabled: true,
		// New accounts are created through the org-restricted Google provider
		// only; email/password remains available for existing users to sign in.
		// Allow email/password sign-ups (was previously disabled causing 404s
		// on HTTP /sign-up/email endpoints after .env.local restore).
		disableSignUp: false,
		password: {
			hash: (pass) => Bun.password.hash(pass),
			verify: ({ password, hash }) => Bun.password.verify(password, hash),
		},
	},

	// Only enable the Google social provider when real credentials are set.
	// During local development the .env may contain placeholder values which
	// cause the client-side Google flow to immediately fail; omit the
	// provider in that case so users fall back to email/password signin.
	socialProviders:
		env.GOOGLE_CLIENT_ID === "placeholder" || env.GOOGLE_CLIENT_SECRET === "placeholder"
			? {}
			: {
				google: {
					prompt: "select_account",
					clientId: env.GOOGLE_CLIENT_ID,
					clientSecret: env.GOOGLE_CLIENT_SECRET,
					hd: env.ORG_EMAIL_DOMAIN,
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
