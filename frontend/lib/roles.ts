/**
 * Central role definitions for the Obelisk frontend.
 *
 * These mirror the backend's `UserRole` enum in `01-enums.prisma` and the
 * authorization matrix in `backend/SYSTEM-DESIGN.md` §3. The client uses this
 * to drive navigation, rendering, and scoped query params — the **backend is
 * the source of truth** for enforcement. We only hide/navigate client-side.
 */

/**
 * Role values. Match `UserRole` exactly (backend enum).
 * `user` is the default post-signup role with no institutional scope.
 */
export const USER_ROLES = [
  "user",
  "faculty",
  "program_chair",
  "dean",
  "aqau",
  "vpaa",
  "system_admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ALL_ROLES: readonly UserRole[] = USER_ROLES;

/** Convenience groups used to gate route groups / nav sections. */
export const ADMIN_ROLES: readonly UserRole[] = [
  "system_admin",
  "vpaa",
  "aqau",
] as const;

export const QA_ROLES: readonly UserRole[] = [
  "aqau",
  "vpaa",
  "system_admin",
] as const;

export const ACADEMIC_ROLES: readonly UserRole[] = [
  "faculty",
  "program_chair",
  "dean",
] as const;

export const ARCHIVE_ROLES: readonly UserRole[] = [
  "aqau",
  "vpaa",
  "dean",
  "system_admin",
] as const;

/** All-role accept list (used by anything any logged-in role may open). */
export const ANY_AUTHENTICATED_ROLES: readonly UserRole[] = ALL_ROLES;

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    (USER_ROLES as readonly string[]).includes(value)
  );
}

/** Human-friendly display label for a role (used in nav, badges, dashboards). */
export const ROLE_LABELS: Record<UserRole, string> = {
  user: "User",
  faculty: "Faculty",
  program_chair: "Program Chair",
  dean: "Dean",
  aqau: "AQAU",
  vpaa: "VPAA",
  system_admin: "System Admin",
};

export function roleLabel(role: UserRole | undefined): string {
  if (!role) return "User";
  return ROLE_LABELS[role] ?? role;
}

/**
 * Does `role` belong to `allowed`? `allowed` is treated as an allow-list.
 * An empty/undefined allow-list means "any authenticated role".
 */
export function hasAccess(
  role: UserRole | undefined,
  allowed?: readonly UserRole[] | typeof ANY_AUTHENTICATED_ROLES,
): boolean {
  if (role === undefined) return false;
  if (!allowed || allowed.length === 0) return true;
  return (allowed as readonly string[]).includes(role);
}

/**
 * Scope descriptors resolved from the authenticated user. The backend
 * enforces these; the client uses them to build scoped query params and to
 * hide irrelevant UI. `undefined` means "not scoped" (institution-wide or
 * not applicable for the role).
 */
export interface UserScope {
  /** One program this user is restricted to (program_chair). */
  programId?: string;
  /** One department this user is restricted to (dean). */
  departmentId?: string;
}

/**
 * Resolve the narrowest scope a role may target. Higher institutional roles
 * (aqau/vpaa/system_admin) are not scoped to a single unit.
 */
export function scopeForRole(role: UserRole | undefined): UserScope {
  switch (role) {
    case "program_chair":
    case "faculty":
      // faculty is actually scoped to their own class sections/courses, but the
      // program id is the useful coarse filter for nav/dashboards; the backend
      // narrows further to the current user's class sections.
      return { programId: undefined };
    case "dean":
      return { departmentId: undefined };
    default:
      return {};
  }
}
