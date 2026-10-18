import { prisma } from "@lib/prisma";
import type { UserRole } from "@prisma/generated/prisma/enums";
import { env } from "@utils/env";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { openAPI } from "better-auth/plugins";

import {
	requestedScopeForRole,
	RoleRequestError,
	SELF_SELECTABLE_ROLES,
} from "./model";

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
 * User projection shared by every user listing (role requests, platform
 * users) so the fields the tables render stay identical.
 */
export const userListSelect = {
	id: true,
	name: true,
	email: true,
	role: true,
	requestedRole: true,
	roleRequestStatus: true,
	employeeId: true,
	programId: true,
	departmentId: true,
	isActive: true,
	createdAt: true,
	program: { select: { id: true, name: true, code: true } },
	department: { select: { id: true, name: true, code: true } },
} as const;

/**
 * `GET /auth/users` — every account, newest first.
 *
 * Platform-wide by design (the caller is a system admin), so it is NOT
 * unit-scoped; the users table pages the whole list client-side.
 */
export const userService = {
	async listUsers() {
		return prisma.user.findMany({
			select: userListSelect,
			orderBy: { createdAt: "desc" },
		});
	},

	/**
	 * `POST /auth/users` — an admin creates an account and grants it a role.
	 *
	 * Account creation goes through better-auth `signUpEmail` so the password
	 * hash and the credential `account` row are written by the library (the
	 * same path `prisma/seed.ts` uses); the role/scope are then set directly,
	 * because the create hook forces `role = "user"`. Scope follows the role
	 * exactly as a role request (`REQUESTED_SCOPE`): faculty/program_chair
	 * carry a program (the department is derived from it), a dean carries a
	 * department, aqau/vpaa carry neither.
	 */
	async createUser(input: {
		name: string;
		email: string;
		password: string;
		role: string;
		programId?: string | null;
		departmentId?: string | null;
	}) {
		if (!(SELF_SELECTABLE_ROLES as readonly string[]).includes(input.role)) {
			throw new RoleRequestError("Invalid role.", 400);
		}

		// Resolve scope against reference tables first — never trust the ids.
		const scopeKind = requestedScopeForRole(input.role);
		if (scopeKind === "program" && !input.programId) {
			throw new RoleRequestError(
				"Select the program this account belongs to.",
				400,
			);
		}
		if (scopeKind === "department" && !input.departmentId) {
			throw new RoleRequestError(
				"Select the department this account covers.",
				400,
			);
		}
		if (!scopeKind && (input.programId || input.departmentId)) {
			throw new RoleRequestError(
				"This role is not scoped to a program or department.",
				400,
			);
		}

		let programId: string | null = null;
		let departmentId: string | null = null;
		if (scopeKind === "program" && input.programId) {
			const program = await prisma.program.findUnique({
				where: { id: input.programId },
				select: { id: true, departmentId: true },
			});
			if (!program) throw new RoleRequestError("Program not found.", 400);
			programId = program.id;
			departmentId = program.departmentId;
		} else if (scopeKind === "department" && input.departmentId) {
			const department = await prisma.department.findUnique({
				where: { id: input.departmentId },
				select: { id: true },
			});
			if (!department) throw new RoleRequestError("Department not found.", 400);
			departmentId = department.id;
		}

		const existing = await prisma.user.findUnique({
			where: { email: input.email },
			select: { id: true },
		});
		if (existing) {
			throw new RoleRequestError(
				"An account with this email already exists.",
				409,
			);
		}

		try {
			// shortcut: signUpEmail also opens a session for the new account.
			// Harmless (it is never relayed to the admin's browser) but wasted —
			// drop it if the better-auth admin plugin is ever installed.
			await auth.api.signUpEmail({
				body: {
					email: input.email,
					password: input.password,
					name: input.name,
				},
			});
		} catch {
			throw new RoleRequestError(
				"Could not create the account — check the email and password.",
				400,
			);
		}

		return prisma.user.update({
			where: { email: input.email },
			data: { role: input.role as UserRole, programId, departmentId },
			select: userListSelect,
		});
	},

	/**
	 * `GET /auth/users/role-counts` — platform-wide headcount per role.
	 *
	 * Deliberately NOT unit-scoped (an institution-level statistic), and every
	 * role is emitted even at zero so the chart's axis is stable rather than
	 * growing as accounts are granted.
	 */
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
