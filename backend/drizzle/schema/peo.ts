import { pgTable, text, varchar } from "drizzle-orm/pg-core";
import { program } from "./program";

export const peo = pgTable("peo", {
	id: text("id").primaryKey(),
	programId: text("program_id")
		.notNull()
		.references(() => program.id, { onDelete: "cascade" }),
	code: varchar("code", { length: 20 }).notNull(), // "PEO1"
	description: text("description").notNull(),
});
