import { t } from "elysia";

/** `GET /atrisk/flags` — the at-risk watchlist backing the student picker. */
export const AtRiskFlagsQuerySchema = t.Object({
	classSectionId: t.Optional(t.String()),
});

/**
 * `POST /atrisk/action/init` — open (or reuse) the action-taken draft for a
 * class section. Term and program are resolved server-side from the section.
 */
export const ActionTakenInitSchema = t.Object({
	classSectionId: t.String(),
});

/** `PUT /atrisk/action/:id` — save the student selection + intervention note. */
export const SaveActionTakenSchema = t.Object({
	/** `Student.id` values selected from the at-risk watchlist. */
	studentIds: t.Array(t.String()),
	/** Free-text description of the intervention performed. */
	actionTaken: t.String(),
});

export type AtRiskFlagsQuery = typeof AtRiskFlagsQuerySchema.static;
export type ActionTakenInit = typeof ActionTakenInitSchema.static;
export type SaveActionTaken = typeof SaveActionTakenSchema.static;
