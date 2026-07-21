import {
	numeric,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";
import { program } from "./program";

export const course = pgTable(
	"course",
	{
		id: text("id").primaryKey(),
		programId: text("program_id")
			.notNull()
			.references(() => program.id, { onDelete: "cascade" }),
		code: varchar("code", { length: 20 }).notNull(), // "CS301"
		title: text("title").notNull(),
		units: numeric("units", { precision: 3, scale: 1 }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [uniqueIndex("uniq_course_code").on(t.programId, t.code)],
);
