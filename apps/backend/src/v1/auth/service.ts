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
		// NOTE: `disableSignUp: false` — disabling email/password sign-ups made
		// HTTP /sign-up/email 404 after the .env.local restore. Org-restricted
		// Google covers new accounts; email/password serves existing users.
		disableSignUp: false,
		password: {
			hash: (pass) => Bun.password.hash(pass),
			verify: ({ password, hash }) => Bun.password.verify(password, hash),
		},
	},

	// NOTE: local .env placeholder Google creds make the client-side Google flow
	// fail immediately; users fall back to email/password signin.
	socialProviders: {
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

// --- Platform statistics -----------------------------------------------------
// NOTE: kept here rather than in a new module — it reads only the `user` table
// and is admin-gated in the controller (`viewPlatformStats`), not unit-scoped.

/** Every role value, so a role with no account still reports a zero row. */
const PLATFORM_STAT_ROLES = [
	"user",
	"faculty",
	"program_chair",
	"dean",
	"aqau",
	"vpaa",
	"system_admin",
] as const;

/**
 * `GET /auth/users/role-counts` — platform-wide headcount per role.
 *
 * Deliberately NOT unit-scoped (an institution-level statistic), and every
 * role is emitted even at zero so the chart's axis is stable rather than
 * growing as accounts are granted.
 */
export const userService = {
	async roleCounts() {
		const rows = await prisma.user.groupBy({
			by: ["role"],
			_count: { _all: true },
		});
		const counts = new Map<string, number>(
			rows.map((row) => [row.role, row._count._all]),
		);
		return PLATFORM_STAT_ROLES.map((role) => ({
			role,
			userCount: counts.get(role) ?? 0,
		}));
	},
};
