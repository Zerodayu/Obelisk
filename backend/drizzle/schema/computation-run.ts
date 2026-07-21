import {
	numeric,
	pgTable,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { user } from "./user";

// Logs every aggregation pass — the audit trail for which "level" of the
// hierarchy ran, which formula/weights were applied, and who triggered it.
export const computationRun = pgTable("computation_run", {
	id: text("id").primaryKey(),
	triggeredByUserId: text("triggered_by_user_id").references(() => user.id, {
		onDelete: "set null",
	}),
	scope: text("scope").notNull(), // "clo_attainment" | "plo_rollup"
	formulaVersion: varchar("formula_version", { length: 20 })
		.notNull()
		.default("70_30_v1"),
	directWeight: numeric("direct_weight", { precision: 3, scale: 2 })
		.notNull()
		.default("0.70"),
	indirectWeight: numeric("indirect_weight", { precision: 3, scale: 2 })
		.notNull()
		.default("0.30"),
	runAt: timestamp("run_at").notNull().defaultNow(),
});
