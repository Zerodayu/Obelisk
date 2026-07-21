import { numeric, pgTable, text, varchar } from "drizzle-orm/pg-core";
import { program } from "./program";

export const plo = pgTable("plo", {
	id: text("id").primaryKey(),
	programId: text("program_id")
		.notNull()
		.references(() => program.id, { onDelete: "cascade" }),
	code: varchar("code", { length: 20 }).notNull(), // "PLO1"
	description: text("description").notNull(),
	targetAttainmentPct: numeric("target_attainment_pct", {
		precision: 5,
		scale: 2,
	})
		.notNull()
		.default("70.00"), // institutional 70% benchmark
});
