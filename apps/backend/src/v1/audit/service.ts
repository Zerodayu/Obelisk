import { prisma } from "@lib/prisma";
import {
	hasRole,
	RoleAccessForbiddenError,
	VIEW_ALL_AUDIT_ROLES,
} from "@lib/role-access";
import type { Prisma } from "@prisma/generated/prisma/client";

import type { AuditLogsQuery } from "./model";

/** Hard window per request — the grid filters client-side over this page. */
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

export interface AuditCaller {
	id: string;
	role: string | undefined;
}

/** The acting user at read time (joined from `user`). */
export interface AuditActor {
	id: string;
	name: string;
	email: string;
	role: string | null;
}

export interface AuditLogEntry {
	id: string;
	action: string;
	moduleAffected: string;
	targetRecordId: string | null;
	details: unknown;
	createdAt: string;
	/** `null` when the actor's user row was deleted (`userId` SET NULL). */
	actor: AuditActor | null;
}

export interface AuditLogPage {
	entries: AuditLogEntry[];
	/** `all` = every role's rows (viewAllAuditLogs); `self` = caller's own. */
	viewer: { scope: "all" | "self" };
	hasMore: boolean;
}

/** 400 — `before` is not a parseable timestamp. */
export class AuditQueryError extends Error {
	readonly status = 400;
	constructor(message: string) {
		super(message);
		this.name = "AuditQueryError";
	}
}

function parseLimit(raw: string | undefined): number {
	if (raw == null || raw === "") return DEFAULT_LIMIT;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
	// NOTE: clamp instead of rejecting — a bad page size still gets a page.
	return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

function parseBefore(raw: string | undefined): Date | undefined {
	if (raw == null || raw === "") return undefined;
	const date = new Date(raw);
	// NOTE: NaN would reach Prisma as an opaque error — reject early with 400.
	if (Number.isNaN(date.getTime())) {
		throw new AuditQueryError(`Invalid before timestamp: ${raw}`);
	}
	return date;
}

export class AuditService {
	/**
	 * Scoped read behind `GET /audit/logs`.
	 *
	 * `viewAllAuditLogs` roles (vpaa/system_admin) get every user's rows;
	 * everyone else is forced to `userId = caller.id` and may not target
	 * another user even via the query param (explicit 403, never a silent
	 * ignore — the boundary must be testable).
	 */
	async list(
		caller: AuditCaller,
		query: AuditLogsQuery,
	): Promise<AuditLogPage> {
		const fullView = hasRole(caller.role, VIEW_ALL_AUDIT_ROLES);
		if (query.userId && query.userId !== caller.id && !fullView) {
			throw new RoleAccessForbiddenError(
				"Your role may not read another user's audit log",
			);
		}

		const where: Prisma.AuditLogWhereInput = fullView
			? query.userId
				? { userId: query.userId }
				: {}
			: { userId: caller.id };
		// NOTE: strict `<` on the keyset cursor — ties on createdAt would skip
		// rows only in the same microsecond, acceptable for this volume.
		const before = parseBefore(query.before);
		if (before) where.createdAt = { lt: before };

		const limit = parseLimit(query.limit);
		const rows = await prisma.auditLog.findMany({
			where,
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			// NOTE: one extra row as the hasMore probe
			take: limit + 1,
			include: {
				user: { select: { id: true, name: true, email: true, role: true } },
			},
		});

		const hasMore = rows.length > limit;
		const entries = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
			id: row.id,
			action: row.action,
			moduleAffected: row.moduleAffected,
			targetRecordId: row.targetRecordId,
			details: row.details,
			createdAt: row.createdAt.toISOString(),
			// NOTE: role is the user's CURRENT role — the row does not snapshot
			// the role held at action time (known v1 caveat).
			actor: row.user
				? {
						id: row.user.id,
						name: row.user.name,
						email: row.user.email,
						role: row.user.role,
					}
				: null,
		}));

		return { entries, viewer: { scope: fullView ? "all" : "self" }, hasMore };
	}
}

export const auditService = new AuditService();
