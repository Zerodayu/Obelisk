/** Roles a signed-in account may apply for (system_admin is the approver, never self-assigned). */
export const SELF_SELECTABLE_ROLES = [
	"faculty",
	"program_chair",
	"dean",
	"aqau",
	"vpaa",
] as const;

export type SelfSelectableRole = (typeof SELF_SELECTABLE_ROLES)[number];

/** What a role request has to be scoped to: a program, a department, nothing. */
export type RequestedScopeKind = "program" | "department";

/**
 * Scope each self-selectable role must carry on its request:
 * `faculty`/`program_chair` work inside one program, a `dean` sits over a
 * department (every program under it), and the institution-wide roles
 * (aqau/vpaa) are scoped to neither and must not send either.
 *
 * Mirrored by `apps/frontend/lib/roles.ts` (`REQUESTED_SCOPE`), which drives
 * the conditional program/department select on `/onboarding` — keep both in
 * sync (guarded by `test/unit/role-request.test.ts`).
 */
export const REQUESTED_SCOPE = {
	faculty: "program",
	program_chair: "program",
	dean: "department",
} as const satisfies Partial<Record<SelfSelectableRole, RequestedScopeKind>>;

/** The scope a request for `requestedRole` must carry, or `null` for none. */
export function requestedScopeForRole(
	requestedRole?: string | null,
): RequestedScopeKind | null {
	if (!requestedRole) return null;
	return (
		(REQUESTED_SCOPE as Record<string, RequestedScopeKind | undefined>)[
			requestedRole
		] ?? null
	);
}

/** Does a request for `requestedRole` have to carry a program? */
export function roleNeedsProgram(requestedRole?: string | null): boolean {
	return requestedScopeForRole(requestedRole) === "program";
}

/** Does a request for `requestedRole` have to carry a department? */
export function roleNeedsDepartment(requestedRole?: string | null): boolean {
	return requestedScopeForRole(requestedRole) === "department";
}

/** The scope ids a request arrived with (which one applies is role-derived). */
export interface RoleRequestScope {
	programId?: string | null;
	departmentId?: string | null;
}

/**
 * Pure transition check for a role request. Returns `ok: true` when the
 * request may be filed, otherwise an error code + message. Exported so the
 * rules are unit-testable without a database.
 *
 * `scope` carries the ids the applicant picked; whether they reference real
 * rows is a DB check the controller performs afterwards.
 */
export function validateRoleRequest(
	user: {
		role?: string;
		roleRequestStatus?: string;
		requestedRole?: string | null;
	},
	requestedRole: string,
	scope?: RoleRequestScope,
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
	// NOTE: scope rules come last so account-state errors (409) stay the
	// more specific answer when both apply.
	const scopeKind = requestedScopeForRole(requestedRole);
	const { programId, departmentId } = scope ?? {};
	if (scopeKind === "program") {
		// Wrong id first: naming the other scope is the more specific error.
		if (departmentId) {
			return {
				ok: false,
				status: 400,
				message: "Department does not apply to the selected role.",
			};
		}
		if (!programId) {
			return {
				ok: false,
				status: 400,
				message: "Select the program you belong to.",
			};
		}
	} else if (scopeKind === "department") {
		if (programId) {
			return {
				ok: false,
				status: 400,
				message: "Program does not apply to the selected role.",
			};
		}
		if (!departmentId) {
			return { ok: false, status: 400, message: "Select your department." };
		}
	} else if (programId || departmentId) {
		return {
			ok: false,
			status: 400,
			message: "The selected role is not scoped to a program or department.",
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
