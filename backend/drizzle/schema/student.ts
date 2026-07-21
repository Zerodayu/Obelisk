import { integer, pgTable, text, varchar } from "drizzle-orm/pg-core";
import { program } from "./program";

// Minimal student record — data minimization per RA 10173.
// `anonymizedId` is used in analytics/AI export paths instead of name/number.
export const student = pgTable("student", {
	id: text("id").primaryKey(),
	studentNumber: varchar("student_number", { length: 30 }).notNull().unique(),
	programId: text("program_id")
		.notNull()
		.references(() => program.id, { onDelete: "set null" }),
	yearLevel: integer("year_level"),
	firstName: text("first_name").notNull(),
	lastName: text("last_name").notNull(),
	anonymizedId: varchar("anonymized_id", { length: 30 }).notNull().unique(),
});
