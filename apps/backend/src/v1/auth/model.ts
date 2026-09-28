/** Roles a signed-in account may apply for (system_admin is the approver, never self-assigned). */
export const SELF_SELECTABLE_ROLES = [
	"faculty",
	"program_chair",
	"dean",
	"aqau",
	"vpaa",
] as const;

export type SelfSelectableRole = (typeof SELF_SELECTABLE_ROLES)[number];

/**
 * Pure transition check for a role request. Returns `ok: true` when the
 * request may be filed, otherwise an error code + message. Exported so the
 * rules are unit-testable without a database.
 */
export function validateRoleRequest(
	user: {
		role?: string;
		roleRequestStatus?: string;
		requestedRole?: string | null;
	},
	requestedRole: string,
): { ok: true } | { ok: false; status: number; message: string } {
	if (!(SELF_SELECTABLE_ROLES as readonly string[]).includes(requestedRole)) {
		return { ok: false, status: 400, message: "Invalid requested role." };
	}
	if (user.role && user.role !== "user") {
		return {
			ok: false,
			status: 409,
			message: "Your account already holds an institutional role.",
		};
	}
	if (user.roleRequestStatus === "pending") {
		return {
			ok: false,
			status: 409,
			message: "A role request is already pending approval.",
		};
	}
	if (user.roleRequestStatus === "approved") {
		return {
			ok: false,
			status: 409,
			message: "Your role request was already approved.",
		};
	}
	return { ok: true };
}

export class RoleRequestError extends Error {
	readonly status: number;

	constructor(message: string, status = 400) {
		super(message);
		this.name = "RoleRequestError";
		this.status = status;
	}
}
