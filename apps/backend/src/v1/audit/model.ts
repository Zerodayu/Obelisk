import { t } from "elysia";

/**
 * `GET /audit/logs` — audit-trail rows scoped to the caller's visibility.
 *
 * NOTE: `userId` is only honored for `viewAllAuditLogs` roles — any other
 * role asking for another user's rows gets a 403 (service enforces).
 * NOTE: strings on purpose — query params arrive as strings and the service
 * parses/clamps them (`t.Numeric` is not used anywhere else in this codebase).
 */
export const AuditLogsQuerySchema = t.Object({
	/** Page size (clamped to 1..2000, default 500). */
	limit: t.Optional(t.String()),
	/** Keyset cursor — ISO timestamp; returns rows strictly older than it. */
	before: t.Optional(t.String()),
	/** Full-view roles only; foreign targets 403 for everyone else. */
	userId: t.Optional(t.String()),
});

export type AuditLogsQuery = typeof AuditLogsQuerySchema.static;
