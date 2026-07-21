import {
	boolean,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";

export const academicTerm = pgTable(
	"academic_term",
	{
		id: text("id").primaryKey(),
		schoolYear: varchar("school_year", { length: 20 }).notNull(), // "2025-2026"
		semester: varchar("semester", { length: 20 }).notNull(), // "1st", "2nd", "Summer"
		isActive: boolean("is_active").notNull().default(false),
		startDate: timestamp("start_date"),
		endDate: timestamp("end_date"),
	},
	(t) => [uniqueIndex("uniq_term").on(t.schoolYear, t.semester)],
);
